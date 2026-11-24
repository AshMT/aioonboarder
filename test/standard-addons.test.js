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
