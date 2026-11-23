// Stremio account API (the same endpoints the Stremio apps and AIOManager use).
import { requestJson } from './http.js'

export const DEFAULT_STREMIO_API = 'https://api.strem.io'

async function call(apiBase, method, body) {
  const res = await requestJson(`${apiBase.replace(/\/$/, '')}/api/${method}`, { method: 'POST', body })
  const data = res.data
  if (data && typeof data === 'object' && data.error) {
    const msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error))
    const err = new Error(`Stremio ${method}: ${msg}`)
    err.code = data.error.code
    throw err
  }
  if (res.status >= 400 || !data || typeof data !== 'object') {
    throw new Error(`Stremio ${method} failed (HTTP ${res.status})`)
  }
  return data.result
}

export async function registerAccount(apiBase, email, password) {
  const result = await call(apiBase, 'register', { type: 'Auth', email, password })
  if (!result?.authKey) throw new Error('Stremio register: response had no authKey')
  return { authKey: result.authKey, user: result.user || null }
}

export async function login(apiBase, email, password) {
  const result = await call(apiBase, 'login', { type: 'Login', email, password })
  if (!result?.authKey) throw new Error('Stremio login: response had no authKey')
  return { authKey: result.authKey, user: result.user || null }
}

export async function getAddonCollection(apiBase, authKey) {
  const result = await call(apiBase, 'addonCollectionGet', { type: 'AddonCollectionGet', authKey, update: true })
  return Array.isArray(result?.addons) ? result.addons : []
}

export function isAlreadyRegistered(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('already') || m.includes('exists') || err?.code === 'USER_EXISTS'
}
