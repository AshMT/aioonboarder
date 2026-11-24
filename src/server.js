import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as db from './db.js'
import { initSecrets, sessionKey, hashPassword, verifyPassword, token } from './secrets.js'
import * as views from './views.js'
import { renderGuide, DEFAULT_GUIDE } from './guide.js'
import { createOnboarding, runOnboarding, resendEmail, readdToAio, aioClient, aioConfigured, welcomeLink } from './onboard.js'
import { smtpConfigured, verifySmtp, sendTest } from './mailer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'))
const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'

fs.mkdirSync(DATA_DIR, { recursive: true })
initSecrets(DATA_DIR)
db.openDb(DATA_DIR)

const app = express()
app.disable('x-powered-by')
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)
app.use(express.urlencoded({ extended: false, limit: '256kb' }))
app.use(express.json({ limit: '256kb' }))
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }))

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'",
  })
  next()
})

// ---- sessions (stateless HMAC-signed cookie) ----
const COOKIE = 'aioo_session'
const SESSION_TTL = 7 * 86400000

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = crypto.createHmac('sha256', sessionKey()).update(body).digest('base64url')
  return `${body}.${mac}`
}

function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))
  if (!raw) return null
  const [body, mac] = raw.slice(COOKIE.length + 1).split('.')
  if (!body || !mac) return null
  const expect = crypto.createHmac('sha256', sessionKey()).update(body).digest('base64url')
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.exp < Date.now() || p.gen !== db.getRaw('admin_session_gen')) return null
    return p
  } catch {
    return null
  }
}

function setSession(req, res, user) {
  const secure = req.secure ? '; Secure' : ''
  res.set('Set-Cookie', `${COOKIE}=${sign({ u: user, exp: Date.now() + SESSION_TTL, gen: db.getRaw('admin_session_gen') })}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`)
}

const isSetUp = () => !!db.getRaw('admin_password')
const serverName = () => db.getSettings().server_name || 'AIOOnboarder'

// CSRF: the session cookie is SameSite=Strict, and state-changing requests must also come
// from our own origin when the browser says where they came from.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  const origin = req.headers.origin
  if (origin && origin !== 'null') {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).send('Cross-origin request blocked')
    } catch {
      return res.status(403).send('Bad origin')
    }
  }
  next()
})

// ---- login rate limiting ----
// Per client IP (set TRUST_PROXY behind a reverse proxy so this is the real client), plus a
// global cap so a spread-out guessing run can't keep going when the login is internet-facing.
const WINDOW = 15 * 60000
const attempts = new Map()
let globalFails = []
function tooMany(ip) {
  const now = Date.now()
  const a = (attempts.get(ip) || []).filter((t) => now - t < WINDOW)
  attempts.set(ip, a)
  globalFails = globalFails.filter((t) => now - t < WINDOW)
  if (attempts.size > 10000) for (const [k, v] of attempts) if (!v.length) attempts.delete(k)
  return a.length >= 10 || globalFails.length >= 50
}
function recordFail(ip) {
  attempts.get(ip).push(Date.now())
  globalFails.push(Date.now())
}

// ---- public routes ----
app.get('/healthz', (req, res) => res.json({ ok: true }))

app.get('/welcome/:token', (req, res) => {
  const s = db.getSettings()
  const o = db.getOnboardingByToken(req.params.token)
  let state = 'ok'
  if (!o) state = 'missing'
  else if (o.link_revoked) state = 'revoked'
  else if (o.link_expires_at && o.link_expires_at < Date.now()) state = 'expired'
  if (state === 'ok' && !o.link_viewed_at && !readSession(req)) db.updateOnboarding(o.id, { link_viewed_at: Date.now() })
  res.set('Cache-Control', 'no-store')
  const guideHtml = state === 'ok'
    ? renderGuide(s.guide_md, { name: o.name, email: o.email, server_name: s.server_name, support_contact: s.support_contact })
    : ''
  res.status(state === 'ok' ? 200 : 410).send(views.welcomePage({ o, s, guideHtml, state }))
})

app.get('/setup', (req, res) => {
  if (isSetUp()) return res.redirect('/login')
  res.send(views.authPage({ mode: 'setup', serverName: serverName() }))
})

app.post('/setup', async (req, res) => {
  if (isSetUp()) return res.redirect('/login')
  const { username, password, confirm } = req.body
  const err = !username ? 'Username is required'
    : (password || '').length < 10 ? 'Use at least 10 characters'
    : password !== confirm ? "Passwords don't match" : null
  if (err) return res.status(400).send(views.authPage({ mode: 'setup', error: err, serverName: serverName() }))
  db.setRaw('admin_username', username.trim())
  db.setRaw('admin_password', await hashPassword(password))
  db.setRaw('admin_session_gen', token(8))
  setSession(req, res, username.trim())
  res.redirect('/settings')
})

app.get('/login', (req, res) => {
  if (!isSetUp()) return res.redirect('/setup')
  res.send(views.authPage({ mode: 'login', serverName: serverName() }))
})

app.post('/login', async (req, res) => {
  if (!isSetUp()) return res.redirect('/setup')
  const ip = req.ip
  if (tooMany(ip)) return res.status(429).send(views.authPage({ mode: 'login', error: 'Too many attempts. Try again in 15 minutes.', serverName: serverName() }))
  const { username, password } = req.body
  const userOk = (username || '').trim() === db.getRaw('admin_username')
  const passOk = await verifyPassword(password || '', db.getRaw('admin_password'))
  if (!userOk || !passOk) {
    recordFail(ip)
    return res.status(401).send(views.authPage({ mode: 'login', error: 'Wrong username or password', serverName: serverName() }))
  }
  attempts.delete(ip)
  setSession(req, res, username.trim())
  res.redirect('/')
})

app.post('/logout', (req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
  res.redirect('/login')
})

// ---- everything below needs the admin ----
app.use((req, res, next) => {
  if (!isSetUp()) return res.redirect('/setup')
  if (readSession(req)) {
    res.set('Cache-Control', 'no-store')
    return next()
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not logged in' })
  res.redirect('/login')
})

const flashFrom = (req) => {
  if (req.query.err) return { type: 'error', text: String(req.query.err).slice(0, 200) }
  const m = { saved: ['ok', 'Settings saved.'], retried: ['ok', 'Retried.'], link: ['ok', 'New welcome link created.'], revoked: ['ok', 'Link revoked.'], emailed: ['ok', 'Email step re-run.'], aio: ['ok', 'AIOManager step re-run.'], deleted: ['ok', 'Record deleted.'] }[req.query.ok]
  return m ? { type: m[0], text: m[1] } : null
}

app.get('/', (req, res) => {
  const s = db.getSettings()
  res.send(views.homePage({ s, list: db.listOnboardings(), aioReady: aioConfigured(s), smtpReady: smtpConfigured(s), serverName: s.server_name, flash: flashFrom(req), user: readSession(req)?.u }))
})

const origin = (req) => `${req.protocol}://${req.get('host')}`

app.post('/api/onboard', async (req, res) => {
  const email = String(req.body.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' })
  const prior = db.findActiveByEmail(email)
  if (prior && prior.steps.stremio?.ok) {
    return res.status(409).json({ error: 'This email has already been onboarded.', id: prior.id })
  }
  const o = createOnboarding({
    email,
    name: req.body.name,
    createLink: !!req.body.createLink,
    notifyEmail: !!req.body.notifyEmail,
  })
  const done = await runOnboarding(o.id, { reqOrigin: origin(req) })
  const s = db.getSettings()
  res.json({
    id: done.id,
    status: done.status,
    steps: done.steps,
    email: done.email,
    password: done.temp_password,
    link: welcomeLink(s, done, origin(req)),
  })
})

app.get('/onboardings/:id', (req, res) => {
  const o = db.getOnboarding(req.params.id)
  if (!o) return res.redirect('/')
  const s = db.getSettings()
  res.send(views.detailPage({ o, link: welcomeLink(s, o, origin(req)), serverName: s.server_name, flash: flashFrom(req), aioUrl: s.aio_url, user: readSession(req)?.u }))
})

app.post('/onboardings/:id/retry', async (req, res) => {
  if (db.getOnboarding(req.params.id)) await runOnboarding(req.params.id, { reqOrigin: origin(req) })
  res.redirect(`/onboardings/${req.params.id}?ok=retried`)
})

app.post('/onboardings/:id/aio', async (req, res) => {
  if (db.getOnboarding(req.params.id)) await readdToAio(req.params.id, { reqOrigin: origin(req) })
  res.redirect(`/onboardings/${req.params.id}?ok=aio`)
})

app.post('/onboardings/:id/link', (req, res) => {
  const s = db.getSettings()
  const ttl = Math.max(1, Number(s.link_ttl_days) || 7)
  db.updateOnboarding(req.params.id, { link_token: token(), link_expires_at: Date.now() + ttl * 86400000, link_revoked: false, link_viewed_at: null })
  res.redirect(`/onboardings/${req.params.id}?ok=link`)
})

app.post('/onboardings/:id/revoke', (req, res) => {
  db.updateOnboarding(req.params.id, { link_revoked: true })
  res.redirect(`/onboardings/${req.params.id}?ok=revoked`)
})

app.post('/onboardings/:id/email', async (req, res) => {
  if (db.getOnboarding(req.params.id)) await resendEmail(req.params.id, { reqOrigin: origin(req) })
  res.redirect(`/onboardings/${req.params.id}?ok=emailed`)
})

app.post('/onboardings/:id/delete', (req, res) => {
  db.deleteOnboarding(req.params.id)
  res.redirect('/?ok=deleted')
})

function certInfo(pem) {
  if (!pem) return null
  try {
    const c = new crypto.X509Certificate(pem)
    const cn = /CN=([^\n,]+)/.exec(c.subject)?.[1] || c.subject
    return { name: cn, expires: new Date(c.validTo).toLocaleDateString('en-AU', { dateStyle: 'medium' }) }
  } catch {
    return { name: 'Unreadable certificate', expires: 'unknown' }
  }
}

app.get('/settings', (req, res) => {
  const s = db.getSettings()
  res.send(views.settingsPage({
    s,
    serverName: s.server_name,
    flash: flashFrom(req),
    defaultGuide: DEFAULT_GUIDE,
    user: readSession(req)?.u,
    cert: certInfo(s.aio_ca),
    aioReady: aioConfigured(s),
    smtpReady: smtpConfigured(s),
  }))
})

// Shows the welcome page with sample details so the guide can be checked before sending links.
app.get('/settings/preview', (req, res) => {
  const s = db.getSettings()
  const o = { name: 'Sam', email: 'sam@example.com', temp_password: 'Kx7m-Pq4r-Tz9w' }
  const guideHtml = renderGuide(s.guide_md, { name: o.name, email: o.email, server_name: s.server_name, support_contact: s.support_contact })
  res.set('Cache-Control', 'no-store')
  res.send(views.welcomePage({ o, s, guideHtml, state: 'ok' }))
})

// Certificate fields: a new PEM replaces the stored one, the Remove box clears it, and an
// untouched form leaves it alone (the stored PEM is never echoed back into the page).
function certFromBody(body, patch) {
  const pem = String(body.aio_ca_new || '').trim()
  if (pem) {
    try {
      new crypto.X509Certificate(pem)
    } catch {
      throw new Error("That CA certificate isn't a valid PEM certificate")
    }
    patch.aio_ca = pem
    patch.aio_insecure_tls = '0'
  } else if (body.aio_ca_clear === '1') {
    patch.aio_ca = ''
  }
  return patch
}

function settingsFromBody(body) {
  const patch = {}
  for (const k of Object.keys(db.DEFAULT_SETTINGS)) {
    if (!(k in body)) continue
    let v = body[k]
    if (Array.isArray(v)) v = v[v.length - 1] // hidden "0" + checkbox "1"
    if ((k === 'aio_password' || k === 'smtp_pass') && !v) continue // blank keeps the saved secret
    if (k === 'aio_ca') continue // handled by certFromBody
    patch[k] = String(v).trim()
  }
  return certFromBody(body, patch)
}

app.post('/settings', (req, res) => {
  try {
    db.saveSettings(settingsFromBody(req.body))
  } catch (err) {
    return res.redirect('/settings?err=' + encodeURIComponent(err.message))
  }
  res.redirect('/settings?ok=saved')
})

// Test endpoints take the unsaved form values so you can test before saving.
app.post('/api/test/aiomanager', async (req, res) => {
  try {
    const s = { ...db.getSettings(), ...settingsFromBody(req.body) }
    const c = aioClient(s)
    const sum = await c.summary()
    res.json({ ok: true, message: `Connected${sum.name ? ` as ${sum.name}` : ''}: ${sum.accounts.length} account(s) in AIOManager${sum.hasVault ? '' : ' (vault not initialised; log in to AIOManager once in a browser)'}` })
  } catch (err) {
    res.json({ ok: false, message: err.code ? `${err.code}: ${err.message}` : err.message })
  }
})

app.post('/api/test/smtp', async (req, res) => {
  try {
    const s = { ...db.getSettings(), ...settingsFromBody(req.body) }
    if (!smtpConfigured(s)) throw new Error('Fill in at least the host and From address')
    await verifySmtp(s)
    if (req.body.test_to) await sendTest(s, req.body.test_to)
    res.json({ ok: true, message: req.body.test_to ? `Test email sent to ${req.body.test_to}` : 'SMTP login OK' })
  } catch (err) {
    res.json({ ok: false, message: err.message })
  }
})

app.use((err, req, res, next) => {
  console.error(err)
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message })
  res.status(500).send('Something went wrong: ' + views.esc(err.message))
})

app.listen(PORT, HOST, () => {
  console.log(`AIOOnboarder listening on http://${HOST}:${PORT} (data: ${DATA_DIR})`)
})
