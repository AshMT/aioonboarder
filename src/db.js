import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { seal, unseal } from './secrets.js'

let db

export function openDb(dataDir) {
  db = new DatabaseSync(path.join(dataDir, 'aioonboarder.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS onboardings (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      temp_password TEXT,
      stremio_auth_key TEXT,
      aio_account_id TEXT,
      aio_api_key TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      steps TEXT NOT NULL DEFAULT '{}',
      link_token TEXT UNIQUE,
      link_expires_at INTEGER,
      link_revoked INTEGER NOT NULL DEFAULT 0,
      link_viewed_at INTEGER,
      notify_email INTEGER NOT NULL DEFAULT 0,
      email_sent_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `)
  return db
}

// Settings that are encrypted at rest.
const SECRET_KEYS = new Set(['aio_password', 'smtp_pass'])

export const DEFAULT_SETTINGS = {
  server_name: 'AIOOnboarder',
  public_url: '',
  stremio_api: 'https://api.strem.io',
  aio_url: '',
  aio_uuid: '',
  aio_password: '',
  aio_insecure_tls: '0',
  aio_ca: '',
  aio_enabled: '1',
  link_ttl_days: '7',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: '0',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  email_include_credentials: '0',
  support_contact: '',
  guide_md: '',
}

export function getSettings() {
  const out = { ...DEFAULT_SETTINGS }
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    out[row.key] = SECRET_KEYS.has(row.key) ? unseal(row.value) : row.value
  }
  return out
}

export function saveSettings(patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS) && !k.startsWith('admin_')) continue
    stmt.run(k, SECRET_KEYS.has(k) ? seal(v) : String(v ?? ''))
  }
}

export function getRaw(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
}

export function setRaw(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

function hydrate(row) {
  if (!row) return null
  return {
    ...row,
    steps: JSON.parse(row.steps || '{}'),
    temp_password: row.temp_password ? unseal(row.temp_password) : '',
    stremio_auth_key: row.stremio_auth_key ? unseal(row.stremio_auth_key) : '',
    notify_email: !!row.notify_email,
    link_revoked: !!row.link_revoked,
  }
}

export function createOnboarding(o) {
  db.prepare(`INSERT INTO onboardings (id, email, name, temp_password, status, steps, link_token, link_expires_at, notify_email, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    o.id, o.email, o.name || null, seal(o.temp_password), 'pending', JSON.stringify(o.steps || {}),
    o.link_token || null, o.link_expires_at || null, o.notify_email ? 1 : 0, Date.now(),
  )
  return getOnboarding(o.id)
}

export function updateOnboarding(id, patch) {
  const cols = []
  const vals = []
  for (const [k, v] of Object.entries(patch)) {
    let val = v
    if (k === 'steps') val = JSON.stringify(v)
    else if (k === 'temp_password' || k === 'stremio_auth_key') val = seal(v)
    else if (typeof v === 'boolean') val = v ? 1 : 0
    cols.push(`${k} = ?`)
    vals.push(val ?? null)
  }
  if (!cols.length) return
  db.prepare(`UPDATE onboardings SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id)
}

export function getOnboarding(id) {
  return hydrate(db.prepare('SELECT * FROM onboardings WHERE id = ?').get(id))
}

export function getOnboardingByToken(token) {
  return hydrate(db.prepare('SELECT * FROM onboardings WHERE link_token = ?').get(token))
}

export function listOnboardings(limit = 200) {
  return db.prepare('SELECT * FROM onboardings ORDER BY created_at DESC LIMIT ?').all(limit).map(hydrate)
}

export function findActiveByEmail(email) {
  return hydrate(db.prepare("SELECT * FROM onboardings WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 1").get(email))
}

export function deleteOnboarding(id) {
  db.prepare('DELETE FROM onboardings WHERE id = ?').run(id)
}
