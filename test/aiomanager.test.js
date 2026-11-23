import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import { AIOManagerClient, deriveKey, gcmEncrypt, gcmDecrypt, compress, decompress, syncToken } from '../src/aiomanager.js'

test('sync token matches the AIOManager client derivation', () => {
  const expected = crypto.createHash('sha256').update('hunter2:sync-auth-token').digest('hex')
  assert.equal(syncToken('hunter2'), expected)
})

test('AES-GCM output is iv || ciphertext || tag and round-trips through WebCrypto', async () => {
  const key = crypto.randomBytes(32)
  const b64 = gcmEncrypt('hello', key)
  const raw = Buffer.from(b64, 'base64')
  // WebCrypto decrypt expects the tag appended to the ciphertext, iv separate.
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, k, raw.subarray(12))
  assert.equal(Buffer.from(pt).toString(), 'hello')
  assert.equal(gcmDecrypt(b64, key), 'hello')
})

test('compression round-trips', () => {
  const s = JSON.stringify({ a: 'x'.repeat(100000) })
  assert.equal(decompress(compress(s)), s)
})

// A stand-in for AIOManager's /api/sync/:id that stores the envelope verbatim.
function fakeAio(password, initialState, { syncSalt } = {}) {
  let envelope
  const server = http.createServer(async (req, res) => {
    if (req.headers['x-sync-password'] !== syncToken(password)) {
      res.writeHead(401).end('{}')
      return
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(envelope))
      return
    }
    let body = ''
    for await (const c of req) body += c
    envelope = JSON.parse(body)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true }))
  })
  return {
    server,
    async seed() {
      const salt = syncSalt ? Buffer.from(syncSalt, 'base64') : Buffer.from('aiomanager-sync-key-v2')
      const key = await deriveKey(password, salt)
      envelope = { data: gcmEncrypt(JSON.stringify(initialState), key), isEncrypted: true, compressed: false, syncSalt }
    },
    envelope: () => envelope,
  }
}

test('addStremioAccount appends a correctly encrypted account', async () => {
  const password = 'master-pass'
  const vaultSalt = crypto.randomBytes(16).toString('base64')
  const syncSalt = crypto.randomBytes(16).toString('base64')
  const fake = fakeAio(password, { salt: vaultSalt, name: 'Ash', accounts: [{ id: 'a1', name: 'Existing', email: 'old@example.com', apiKey: 'k1' }], notes: [] }, { syncSalt })
  await fake.seed()
  await new Promise((r) => fake.server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${fake.server.address().port}`
  try {
    const c = new AIOManagerClient({ url, uuid: 'u1', password })
    const r = await c.addStremioAccount({
      name: 'Sam',
      email: 'sam@example.com',
      authKey: 'AUTHKEY',
      password: 'temp-pw',
      addons: [{ transportUrl: 'https://v3-cinemeta.strem.io/manifest.json', transportName: '', manifest: { id: 'com.linvo.cinemeta', version: '3.0.0', name: 'Cinemeta' }, flags: { official: true, protected: true } }],
    })
    assert.equal(r.existed, false)

    const { state } = await c.pull()
    assert.equal(state.accounts.length, 2)
    assert.equal(state.notes.length, 0, 'unrelated state is preserved')
    const acc = state.accounts[1]
    assert.equal(acc.email, 'sam@example.com')
    assert.equal(acc.authKey, 'AUTHKEY')
    assert.equal(acc.addons[0].manifestId, 'com.linvo.cinemeta:3.0.0')
    assert.ok(state.manifests['com.linvo.cinemeta:3.0.0'])
    const vaultKey = await deriveKey(password, Buffer.from(vaultSalt, 'base64'))
    assert.equal(gcmDecrypt(acc.connections[0].credentials.authKey, vaultKey), 'AUTHKEY')
    assert.equal(acc.primaryConnectionId, acc.connections[0].id)
    assert.equal(fake.envelope().syncSalt, syncSalt, 'sync salt is carried through')
    assert.equal(fake.envelope().apiKeys[acc.id], r.apiKey)

    const again = await c.addStremioAccount({ name: 'Sam', email: 'SAM@example.com', authKey: 'x', password: 'y' })
    assert.equal(again.existed, true)
  } finally {
    fake.server.close()
  }
})

test('wrong master password is reported clearly', async () => {
  const fake = fakeAio('right', { salt: 'AAAA', accounts: [] })
  await fake.seed()
  await new Promise((r) => fake.server.listen(0, '127.0.0.1', r))
  try {
    const c = new AIOManagerClient({ url: `http://127.0.0.1:${fake.server.address().port}`, uuid: 'u', password: 'wrong' })
    await assert.rejects(c.pull(), /rejected/)
  } finally {
    fake.server.close()
  }
})

test('guide renders, escapes raw HTML and neutralises unsafe links', async () => {
  const { renderGuide } = await import('../src/guide.js')
  const html = renderGuide('Hi {{name}} <script>x</script> [a](javascript:alert(1)) [b](https://x.y)', { name: 'Sam' })
  assert.match(html, /Hi Sam/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /href="#"/)
  assert.match(html, /href="https:\/\/x.y" target="_blank"/)
  assert.match(renderGuide('', { email: 'a@b.co' }), /Install Stremio/)
})

test('compression is byte-compatible with fflate (what AIOManager uses)', async () => {
  const { deflateSync, inflateSync, strToU8, strFromU8 } = await import('fflate')
  const s = JSON.stringify({ accounts: [], blob: 'x'.repeat(60000) })
  // AIOManager -> us
  const theirs = Buffer.from(deflateSync(strToU8(s))).toString('base64')
  assert.equal(decompress(theirs), s)
  // us -> AIOManager
  assert.equal(strFromU8(inflateSync(Buffer.from(compress(s), 'base64'))), s)
})

test('large (compressed) state round-trips through addStremioAccount', async () => {
  const { inflateSync, strFromU8 } = await import('fflate')
  const password = 'pw'
  const salt = crypto.randomBytes(16).toString('base64')
  const fake = fakeAio(password, { salt, accounts: [], notes: [{ body: 'y'.repeat(80000) }] })
  await fake.seed()
  await new Promise((r) => fake.server.listen(0, '127.0.0.1', r))
  try {
    const c = new AIOManagerClient({ url: `http://127.0.0.1:${fake.server.address().port}`, uuid: 'u', password })
    await c.addStremioAccount({ name: 'A', email: 'a@b.co', authKey: 'k', password: 'p' })
    const env = fake.envelope()
    assert.equal(env.compressed, true)
    const key = await deriveKey(password, Buffer.from('aiomanager-sync-key-v2'))
    const state = JSON.parse(strFromU8(inflateSync(Buffer.from(gcmDecrypt(env.data, key), 'base64'))))
    assert.equal(state.accounts[0].email, 'a@b.co')
    assert.equal(state.notes[0].body.length, 80000)
  } finally {
    fake.server.close()
  }
})
