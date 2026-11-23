// The onboarding pipeline. Each step records its outcome in `steps` so a failed run can be
// retried from where it stopped without creating a second Stremio account.
import crypto from 'node:crypto'
import * as db from './db.js'
import * as stremio from './stremio.js'
import { AIOManagerClient } from './aiomanager.js'
import { sendWelcome, smtpConfigured } from './mailer.js'
import { tempPassword, token } from './secrets.js'

export function aioClient(s) {
  return new AIOManagerClient({
    url: s.aio_url,
    uuid: s.aio_uuid,
    password: s.aio_password,
    ca: s.aio_ca || undefined,
    insecure: s.aio_insecure_tls === '1',
  })
}

export function aioConfigured(s) {
  return s.aio_enabled === '1' && !!(s.aio_url && s.aio_uuid && s.aio_password)
}

export function welcomeLink(s, o, reqOrigin) {
  if (!o.link_token) return null
  const base = (s.public_url || reqOrigin || '').replace(/\/$/, '')
  return `${base}/welcome/${o.link_token}`
}

export function createOnboarding({ email, name, createLink, notifyEmail }) {
  const s = db.getSettings()
  const ttlDays = Math.max(1, Number(s.link_ttl_days) || 7)
  return db.createOnboarding({
    id: crypto.randomUUID(),
    email: email.trim(),
    name: (name || '').trim(),
    temp_password: tempPassword(),
    link_token: createLink ? token() : null,
    link_expires_at: createLink ? Date.now() + ttlDays * 86400000 : null,
    notify_email: !!notifyEmail,
    steps: {},
  })
}

const ok = (detail) => ({ ok: true, at: Date.now(), detail })
const fail = (err) => ({ ok: false, at: Date.now(), error: String(err?.message || err) })
const skip = (detail) => ({ ok: true, skipped: true, at: Date.now(), detail })

export async function runOnboarding(id, { reqOrigin } = {}) {
  const s = db.getSettings()
  let o = db.getOnboarding(id)
  const steps = { ...o.steps }
  const save = (patch = {}) => { db.updateOnboarding(id, { steps, ...patch }); o = db.getOnboarding(id) }

  // 1. Stremio account
  let authKey = o.stremio_auth_key
  let addons = []
  if (!steps.stremio?.ok) {
    try {
      const r = await stremio.registerAccount(s.stremio_api, o.email, o.temp_password)
      authKey = r.authKey
      steps.stremio = ok('Stremio account created')
      save({ stremio_auth_key: authKey, status: 'running' })
    } catch (err) {
      if (stremio.isAlreadyRegistered(err)) {
        steps.stremio = fail(new Error(`A Stremio account already exists for ${o.email}. Use a different email, or remove it and retry.`))
      } else {
        steps.stremio = fail(err)
      }
      save({ status: 'failed' })
      return o
    }
  }

  // 2. AIOManager
  if (!steps.aiomanager?.ok) {
    if (!aioConfigured(s)) {
      steps.aiomanager = skip('AIOManager not configured')
    } else {
      try {
        try { addons = await stremio.getAddonCollection(s.stremio_api, authKey) } catch { addons = [] }
        const r = await aioClient(s).addStremioAccount({
          name: o.name || o.email,
          email: o.email,
          authKey,
          password: o.temp_password,
          addons,
        })
        steps.aiomanager = ok(r.existed ? 'Account was already in AIOManager' : `Added to AIOManager with ${addons.length} addon(s)`)
        save({ aio_account_id: r.accountId, aio_api_key: r.apiKey })
      } catch (err) {
        steps.aiomanager = fail(err)
        save({ status: 'failed' })
        return o
      }
    }
    save()
  }

  // 3. Email
  if (o.notify_email && !steps.email?.ok) {
    if (!smtpConfigured(s)) {
      steps.email = fail(new Error('Email requested but SMTP is not configured'))
    } else {
      try {
        await sendWelcome(s, {
          to: o.email,
          name: o.name,
          link: welcomeLink(s, o, reqOrigin),
          email: o.email,
          password: o.temp_password,
        })
        steps.email = ok(`Sent to ${o.email}`)
        save({ email_sent_at: Date.now() })
      } catch (err) {
        steps.email = fail(err)
      }
    }
    save()
  }

  const failed = Object.values(steps).some((st) => st && st.ok === false)
  save({ status: failed ? 'failed' : 'done' })
  return o
}

export async function resendEmail(id, { reqOrigin } = {}) {
  const o = db.getOnboarding(id)
  const steps = { ...o.steps }
  delete steps.email
  db.updateOnboarding(id, { steps, notify_email: true })
  return runOnboarding(id, { reqOrigin })
}
