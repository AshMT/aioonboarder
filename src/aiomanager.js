// AIOManager integration.
//
// AIOManager keeps each manager's whole state as one client-side encrypted blob at
// /api/sync/:uuid. This module reproduces exactly what the AIOManager web client does
// (verified against AIOManager 2.0.x):
//
//   header  x-sync-password = sha256hex(masterPassword + ":sync-auth-token")
//   syncKey = PBKDF2-SHA256(masterPassword, syncSalt || "aiomanager-sync-key-v2", 600000) -> AES-256-GCM
//   data    = base64(iv[12] || ciphertext || tag[16]) of the state JSON,
//             raw-DEFLATEd (fflate) + base64'd first when `compressed` is true (client does this > 50 KB)
//   vaultKey = PBKDF2-SHA256(masterPassword, base64decode(state.salt), 600000) -> AES-256-GCM
//
// Inside the decrypted state, `accounts[]` carries each Stremio account with its auth key in
// plain text (the blob itself is the encryption boundary) and the connection credentials
// encrypted with the vault key — the same shape exportAccountsForSync() produces.
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { requestJson } from './http.js'

const pbkdf2 = promisify(crypto.pbkdf2)
const PBKDF2_ITERATIONS = 600000
const DEFAULT_SYNC_SALT = Buffer.from('aiomanager-sync-key-v2', 'utf8')
const COMPRESS_THRESHOLD = 51200
const PUSH_ATTEMPTS = 4
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Another AIOManager client (an open browser tab) saved between our pull and our push.
export class SyncConflictError extends Error {
  constructor() {
    super('AIOManager was changed by another device while saving; retry in a few seconds')
    this.code = 'conflict'
  }
}

export function syncToken(password) {
  return crypto.createHash('sha256').update(`${password}:sync-auth-token`, 'utf8').digest('hex')
}

export async function deriveKey(password, salt) {
  return pbkdf2(Buffer.from(String(password), 'utf8'), salt, PBKDF2_ITERATIONS, 32, 'sha256')
}

export function gcmEncrypt(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64')
}

export function gcmDecrypt(b64, key) {
  const raw = Buffer.from(b64, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(raw.length - 16)
  const ct = raw.subarray(12, raw.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// AIOManager uses fflate's deflateSync/inflateSync: raw DEFLATE, no zlib header.
export function compress(str) {
  return zlib.deflateRawSync(Buffer.from(str, 'utf8')).toString('base64')
}

export function decompress(b64) {
  const buf = Buffer.from(b64, 'base64')
  try {
    return zlib.inflateRawSync(buf).toString('utf8')
  } catch {
    return zlib.inflateSync(buf).toString('utf8') // tolerate zlib-wrapped payloads
  }
}

export class AIOManagerClient {
  constructor({ url, uuid, password, ca, insecure }) {
    if (!url || !uuid || !password) throw new Error('AIOManager URL, account UUID and password are required')
    this.base = url.replace(/\/$/, '')
    this.uuid = uuid.trim()
    this.password = password
    this.tls = { ca: ca || undefined, insecure: !!insecure }
  }

  async #req(method, path, body) {
    return requestJson(`${this.base}${path}`, {
      method,
      body,
      headers: { 'x-sync-password': syncToken(this.password), 'x-sync-user': this.uuid },
      ...this.tls,
    })
  }

  async health() {
    const res = await requestJson(`${this.base}/api/health`, this.tls)
    return res.status === 200
  }

  // Returns { envelope, state, syncKey }
  async pull() {
    const res = await this.#req('GET', `/api/sync/${encodeURIComponent(this.uuid)}`)
    if (res.status === 401) throw new Error('AIOManager rejected the account UUID / password')
    if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
      throw new Error(`AIOManager sync pull failed (HTTP ${res.status})`)
    }
    const envelope = res.data
    if (!envelope.isEncrypted || typeof envelope.data !== 'string') {
      throw new Error('AIOManager returned an unencrypted (legacy) payload. Open AIOManager in a browser and let it sync once, then retry.')
    }
    const salt = envelope.syncSalt ? Buffer.from(envelope.syncSalt, 'base64') : DEFAULT_SYNC_SALT
    const syncKey = await deriveKey(this.password, salt)
    let inner
    try {
      inner = gcmDecrypt(envelope.data, syncKey)
    } catch {
      throw new Error('Could not decrypt AIOManager data: wrong master password?')
    }
    const json = envelope.compressed ? decompress(inner) : inner
    const state = JSON.parse(json)
    return { envelope, state, syncKey }
  }

  // `syncedAt` in the body is what AIOManager's server uses for conflict detection: it refuses a
  // push whose syncedAt is older than its own copy. Sending the time of the copy we pulled (not
  // "now") means a browser tab that saved in between makes this push fail instead of being
  // silently overwritten.
  async push({ envelope, state, syncKey }) {
    const now = new Date().toISOString()
    const stateStr = JSON.stringify({ ...state, syncedAt: now })
    let payload = stateStr
    let compressed = false
    if (stateStr.length > COMPRESS_THRESHOLD) {
      payload = compress(stateStr)
      compressed = true
    }
    const apiKeys = {}
    for (const a of state.accounts || []) if (a?.apiKey) apiKeys[a.id] = a.apiKey
    const body = {
      data: gcmEncrypt(payload, syncKey),
      isEncrypted: true,
      compressed,
      syncSalt: envelope.syncSalt,
      syncedAt: envelope.syncedAt || now,
      force: false,
      apiKeys,
    }
    const res = await this.#req('POST', `/api/sync/${encodeURIComponent(this.uuid)}`, body)
    if (res.status !== 200 || !res.data?.success) {
      throw new Error(`AIOManager sync push failed (HTTP ${res.status}): ${JSON.stringify(res.data)}`)
    }
    if (res.data.conflict) throw new SyncConflictError()
    return res.data
  }

  async summary() {
    const { state } = await this.pull()
    return {
      name: state.name || null,
      accounts: (state.accounts || []).map((a) => ({ id: a.id, name: a.name, email: a.email || a.connections?.[0]?.credentials?.email || null })),
      hasVault: !!state.salt,
    }
  }

  // True when an account with this id (or, failing that, this email) is in AIOManager's copy.
  async hasAccount({ accountId, email }) {
    const { state } = await this.pull()
    return !!findAccount(state.accounts || [], { accountId, email })
  }

  // Adds a Stremio account exactly as AIOManager's "Add account" would. Pass accountId/apiKey to
  // re-add a known account under the same identity. Retries when another client saves meanwhile.
  // Returns { accountId, apiKey, existed }
  async addStremioAccount(opts) {
    const ids = { accountId: opts.accountId || crypto.randomUUID(), apiKey: opts.apiKey || crypto.randomUUID() }
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#addOnce(opts, ids)
      } catch (err) {
        if (!(err instanceof SyncConflictError) || attempt >= PUSH_ATTEMPTS) throw err
        await sleep(1500 * attempt)
      }
    }
  }

  async #addOnce({ name, email, authKey, password, addons = [], emoji, accentColor }, { accountId, apiKey }) {
    const snap = await this.pull()
    const { state } = snap
    state.accounts = Array.isArray(state.accounts) ? state.accounts : []

    const existing = findAccount(state.accounts, { accountId, email })
    if (existing) return { accountId: existing.id, apiKey: existing.apiKey, existed: true }

    if (!state.salt) throw new Error('AIOManager vault is not initialised (no salt in state). Log in to AIOManager once in a browser first.')
    const vaultKey = await deriveKey(this.password, Buffer.from(state.salt, 'base64'))

    state.manifests = state.manifests && typeof state.manifests === 'object' ? state.manifests : {}
    const mappedAddons = addons.map((ad) => {
      const manifest = ad.manifest || {}
      const manifestId = `${manifest.id}:${manifest.version}`
      if (!state.manifests[manifestId]) state.manifests[manifestId] = manifest
      return {
        transportUrl: ad.transportUrl,
        transportName: ad.transportName ?? '',
        manifestId,
        manifest,
        flags: ad.flags,
      }
    })

    const connectionId = crypto.randomUUID()
    state.accounts.push({
      id: accountId,
      name: name || email,
      email,
      authKey,
      password,
      accentColor,
      emoji,
      profiles: [],
      addons: mappedAddons,
      connections: [
        {
          id: connectionId,
          platform: 'stremio',
          connectionType: 'native',
          driverType: 'native',
          enabled: true,
          credentials: {
            authKey: gcmEncrypt(authKey, vaultKey),
            email,
            password: gcmEncrypt(password, vaultKey),
          },
          capabilities: ['addons'],
        },
      ],
      primaryConnectionId: connectionId,
      apiKey,
      createdAt: Date.now(),
    })
    await this.push(snap)
    return { accountId, apiKey, existed: false }
  }
}

function findAccount(accounts, { accountId, email }) {
  const lower = email ? String(email).toLowerCase() : null
  return accounts.find((a) => {
    if (accountId && a.id === accountId) return true
    if (!lower) return false
    const e = a.email || a.connections?.find((c) => c.platform === 'stremio')?.credentials?.email
    return e && String(e).toLowerCase() === lower
  })
}
