import { test } from 'node:test'
import assert from 'node:assert/strict'
import { standardAddonsFromState } from '../src/aiomanager.js'

const saved = (name, url, extra = {}) => ({ id: name, name, installUrl: url, manifest: { id: name, version: '1', name }, syncWithInstalled: true, ...extra })

test('standard set is the synced library add-ons, ordered like your own account', () => {
  const state = {
    addons: {
      savedAddons: [
        saved('meta', 'https://meta.example/manifest.json'),
        saved('media', 'https://media.example/x/manifest.json', { syncWithInstalled: false }),
        saved('subs', 'https://subs.example/manifest.json'),
        saved('only-some', 'https://some.example/manifest.json', { syncAccountIds: ['a2'] }),
        saved('trailers', 'https://trailers.example/manifest.json'),
      ],
    },
    accounts: [
      { id: 'a1', addons: [{ transportUrl: 'https://v3-cinemeta.strem.io/manifest.json' }, { transportUrl: 'https://meta.example/manifest.json' }, { transportUrl: 'https://trailers.example/manifest.json' }, { transportUrl: 'https://subs.example/manifest.json' }] },
      { id: 'a2', addons: [{ transportUrl: 'https://subs.example/manifest.json' }] },
    ],
  }
  const out = standardAddonsFromState(state)
  assert.deepEqual(out.map((a) => a.manifest.id), ['meta', 'trailers', 'subs'])
  assert.equal(out[0].transportUrl, 'https://meta.example/manifest.json')
  assert.deepEqual(out[0].flags, {})
})

test('no synced add-ons means an empty set', () => {
  assert.deepEqual(standardAddonsFromState({ addons: { savedAddons: [saved('x', 'https://x/manifest.json', { syncWithInstalled: false })] } }), [])
  assert.deepEqual(standardAddonsFromState({}), [])
})

test('remove defaults keeps only what Stremio flags as protected', async () => {
  const http = await import('node:http')
  const { installStandardAddons } = await import('../src/onboard.js')
  let written
  const server = http.createServer(async (req, res) => {
    let b = ''
    for await (const c of req) b += c
    const body = JSON.parse(b || '{}')
    const send = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o))
    if (req.url === '/api/addonCollectionGet') {
      return send({ result: { addons: [
        { transportUrl: 'https://a/manifest.json', manifest: { id: 'a', name: 'Needed' }, flags: { official: true, protected: true } },
        { transportUrl: 'https://b/manifest.json', manifest: { id: 'b', name: 'Optional' }, flags: { official: true, protected: false } },
      ] } })
    }
    if (req.url === '/api/addonCollectionSet') { written = body.addons; return send({ result: { success: true } }) }
    send({ error: { message: 'unknown' } })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const s = { stremio_api: `http://127.0.0.1:${server.address().port}`, remove_defaults: '1', standard_addons: '1', aio_enabled: '0' }
    const r = await installStandardAddons(s, 'key')
    assert.deepEqual(written.map((a) => a.manifest.id), ['a'])
    assert.deepEqual(r.removed, ['Optional'])
    assert.equal(await installStandardAddons({ ...s, remove_defaults: '0' }, 'key'), null)
  } finally {
    server.close()
  }
})
