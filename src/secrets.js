// Encryption at rest for secrets AIOOnboarder stores (AIOManager master password, SMTP
// password, temp passwords, Stremio auth keys). Key comes from APP_SECRET or a key file
// generated on first run in the data directory.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

let KEY = null

export function initSecrets(dataDir) {
  let secret = process.env.APP_SECRET
  if (!secret) {
    const file = path.join(dataDir, 'app.secret')
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
    }
    secret = fs.readFileSync(file, 'utf8').trim()
  }
  KEY = crypto.createHash('sha256').update(secret).digest()
  return KEY
}

export function sessionKey() {
  return crypto.createHmac('sha256', KEY).update('session').digest()
}

export function seal(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()])
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

export function unseal(sealed) {
  if (!sealed) return ''
  const raw = Buffer.from(String(sealed).slice(3), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))))

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const k = await scrypt(pw, salt)
  return `scrypt:${salt.toString('base64')}:${k.toString('base64')}`
}

export async function verifyPassword(pw, stored) {
  const [, s, h] = String(stored || '').split(':')
  if (!s || !h) return false
  const k = await scrypt(pw, Buffer.from(s, 'base64'))
  const expected = Buffer.from(h, 'base64')
  return k.length === expected.length && crypto.timingSafeEqual(k, expected)
}

// Readable temp password: 3 groups of 4 from an unambiguous alphabet, e.g. "Kx7m-Pq4r-Tz9w".
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function tempPassword(groups = 3, size = 4) {
  const out = []
  for (let g = 0; g < groups; g++) {
    let s = ''
    for (let i = 0; i < size; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)]
    out.push(s)
  }
  return out.join('-')
}

export function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url')
}
