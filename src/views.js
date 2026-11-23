export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const APP_NAME = 'AIOOnboarder'
export const VERSION = '0.1.0'

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// Original mark: a gear ring (dash-array teeth) around a "+", white on black.
export const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="6.91 6.91" transform="rotate(-8 32 32)"/>
  <circle cx="32" cy="32" r="16.5" fill="none" stroke="#fff" stroke-width="5"/>
  <path d="M32 24v16M24 32h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
</svg>`

const ICONS = {
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
}
export const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`

export function layout({ title, body, nav = true, active = '', serverName = APP_NAME, flash, count, user }) {
  const name = serverName || APP_NAME
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000000">
<title>${esc(title)} · ${esc(name)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css?v=${VERSION}">
</head>
<body>
${nav ? `<header class="topbar">
  <a class="brand" href="/"><span class="logo">${LOGO}</span><span class="name">${esc(name)}</span></a>
  <nav class="tabs">
    <a href="/" class="${active === 'home' ? 'on' : ''}">${icon('userPlus')}<span>Onboard</span>${count !== undefined ? `<span class="count">${count}</span>` : ''}</a>
    <a href="/settings" class="${active === 'settings' ? 'on' : ''}">${icon('settings')}<span>Settings</span></a>
  </nav>
  <div class="top-right">
    ${user ? `<span class="who-chip">${esc(user)}</span>` : ''}
    <form method="post" action="/logout"><button class="icon-btn" title="Log out" aria-label="Log out">${icon('logout')}</button></form>
  </div>
</header>` : ''}
${flash ? `<div class="toast" role="status">${icon('check')}<span>${esc(flash.text)}</span></div>` : ''}
<main class="${nav ? 'wrap' : 'wrap narrow'}">
${body}
</main>
<script src="/app.js?v=${VERSION}" defer></script>
</body>
</html>`
}

const heroBrand = (name, tagline) => `<div class="hero-brand">
  <span class="logo">${LOGO}</span>
  <h1>${esc(name)}</h1>
  <div class="tagline">${esc(tagline)}</div>
</div>`

export function authPage({ mode, error, serverName }) {
  const setup = mode === 'setup'
  return layout({
    title: setup ? 'Set up' : 'Log in',
    nav: false,
    serverName,
    body: `<div class="auth">
  ${heroBrand(APP_NAME, 'One link to onboard them all.')}
  <form method="post" action="${setup ? '/setup' : '/login'}" class="card">
    <h1>${setup ? 'Create the admin account' : 'Welcome back'}</h1>
    <p class="sub">${setup ? 'First run. This account is the only one that can onboard users.' : 'Sign in to onboard someone.'}</p>
    ${error ? `<div class="flash error" style="margin-top:14px">${esc(error)}</div>` : ''}
    <label>Username<input name="username" autocomplete="username" required autofocus></label>
    <label>Password<input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required minlength="${setup ? 10 : 1}" placeholder="••••••••"></label>
    ${setup ? '<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required minlength="10" placeholder="••••••••"></label>' : ''}
    <button class="primary block">${setup ? 'Create account' : 'Log in'}</button>
  </form>
  <div class="footer-ver">v${VERSION}</div>
</div>`,
  })
}

const STATUS = { done: ['ok', 'Done'], failed: ['bad', 'Needs attention'], running: ['run', 'Running'], pending: ['run', 'Pending'] }

function statusPill(o) {
  const [cls, label] = STATUS[o.status] || ['run', o.status]
  return `<span class="pill ${cls}">${label}</span>`
}

function stepDots(o) {
  const names = [['stremio', 'S', 'Stremio'], ['aiomanager', 'A', 'AIOManager'], ['email', 'E', 'Email']]
  return names
    .map(([k, letter, label]) => {
      const st = o.steps[k]
      if (!st) return k === 'email' && !o.notify_email ? '' : `<span class="dot" title="${label}: not run">${letter}</span>`
      const cls = st.ok ? (st.skipped ? 'skip' : 'ok') : 'bad'
      return `<span class="dot ${cls}" title="${esc(label + ': ' + (st.error || st.detail || ''))}">${letter}</span>`
    })
    .join('')
}

const initial = (o) => esc((o.name || o.email || '?').trim()[0]?.toUpperCase() || '?')

function rowsHtml(list) {
  if (!list.length) return `<div class="rows"><div class="empty">${icon('users')}<div>No one onboarded yet</div><div class="small">People you onboard show up here.</div></div></div>`
  return `<div class="rows">${list
    .map((o) => {
      const [cls] = STATUS[o.status] || ['run']
      return `<a class="row" href="/onboardings/${o.id}">
      <span class="avatar ${cls}">${initial(o)}</span>
      <div class="who"><strong>${esc(o.name || o.email)}</strong><span class="muted">${o.name ? esc(o.email) : statusLabel(o)}</span></div>
      <div class="steps">${stepDots(o)}</div>
      <div class="when">${fmt(o.created_at)}</div>
    </a>`
    })
    .join('')}</div>`
}
const statusLabel = (o) => (STATUS[o.status] || [, o.status])[1]

export function homePage({ list, aioReady, smtpReady, serverName, flash, user }) {
  return layout({
    title: 'Onboard',
    active: 'home',
    serverName,
    flash,
    user,
    count: list.length,
    body: `<div class="grid">
  <section class="card">
    <div class="title-row card-head">
      <span class="badge-icon">${icon('userPlus')}</span>
      <div><h1>Onboard someone</h1><p class="sub">Creates a Stremio account with a temporary password${aioReady ? ', adds it to AIOManager' : ''}, and hands them their login and guide.</p></div>
    </div>
    ${!aioReady ? `<div class="flash warn"><span>AIOManager isn't connected, so new accounts won't be added to it. <a href="/settings#aiomanager">Connect it</a></span></div>` : ''}
    <form id="onboard-form" autocomplete="off">
      <label>Email<input name="email" type="email" required placeholder="them@example.com"></label>
      <label>Display name <span class="muted">optional, shown in AIOManager</span><input name="name" placeholder="Sam"></label>
      <div class="checks">
        <label class="check"><input type="checkbox" name="createLink" checked><span>Create a welcome link<span class="hint">A private page with their login and the onboarding guide</span></span></label>
        <label class="check ${smtpReady ? '' : 'disabled'}"><input type="checkbox" name="notifyEmail" ${smtpReady ? '' : 'disabled'}><span>Email it to them<span class="hint">${smtpReady ? 'Sends the welcome link to their address' : 'Set up SMTP in <a href="/settings#email">Settings</a> first'}</span></span></label>
      </div>
      <button class="primary block" type="submit">${icon('userPlus')}Create account</button>
    </form>
    <div id="onboard-result" hidden></div>
  </section>
  <section class="card list">
    <div class="card-head"><h2>Onboarded</h2><span class="muted small mono">${list.length} total</span></div>
    ${rowsHtml(list)}
  </section>
</div>`,
  })
}

export function detailPage({ o, link, serverName, flash, aioUrl, user }) {
  const linkState = !o.link_token
    ? 'No welcome link yet'
    : o.link_revoked
      ? 'Revoked'
      : o.link_expires_at < Date.now()
        ? `Expired ${fmt(o.link_expires_at)}`
        : `Expires ${fmt(o.link_expires_at)}`
  const step = (k, label) => {
    const st = o.steps[k]
    if (!st) return `<li><b>${label}</b><span>Not run</span></li>`
    return `<li class="${st.ok ? (st.skipped ? 'skip' : 'ok') : 'bad'}"><b>${label}</b><span>${esc(st.error || st.detail || '')}</span><time>${fmt(st.at)}</time></li>`
  }
  const [cls] = STATUS[o.status] || ['run']
  return layout({
    title: o.email,
    serverName,
    flash,
    user,
    body: `<p style="margin:0 0 16px"><a href="/" class="btn">${icon('arrowLeft')}Back</a></p>
<div class="grid">
  <section class="card">
    <div class="card-head">
      <div class="title-row"><span class="avatar ${cls}">${initial(o)}</span><div><h1>${esc(o.name || o.email)}</h1><p class="sub mono">${esc(o.email)}</p></div></div>
      ${statusPill(o)}
    </div>
    <div class="creds">
      <div><span class="muted">Stremio email</span><code data-copy>${esc(o.email)}</code></div>
      <div><span class="muted">Temporary password</span><code data-copy>${esc(o.temp_password)}</code></div>
      ${o.aio_account_id ? `<div><span class="muted">AIOManager account</span><code data-copy>${esc(o.aio_account_id)}</code></div>` : ''}
      ${o.aio_api_key ? `<div><span class="muted">AIOManager API key</span><code data-copy>${esc(o.aio_api_key)}</code></div>` : ''}
    </div>
    <h2>Steps</h2>
    <ul class="timeline">${step('stremio', 'Stremio account')}${step('aiomanager', 'Add to AIOManager')}${o.notify_email || o.steps.email ? step('email', 'Welcome email') : ''}</ul>
    <div class="actions">
      ${o.status === 'failed' ? `<form method="post" action="/onboardings/${o.id}/retry"><button class="primary">${icon('refresh')}Retry failed steps</button></form>` : ''}
      ${aioUrl && o.aio_account_id ? `<a class="btn" href="${esc(aioUrl)}" target="_blank" rel="noopener">${icon('external')}Open AIOManager</a>` : ''}
    </div>
  </section>
  <section class="card">
    <h2>Welcome link</h2>
    <p class="muted small">${linkState}${o.link_viewed_at ? ` · first opened ${fmt(o.link_viewed_at)}` : o.link_token ? ' · not opened yet' : ''}</p>
    ${link && !o.link_revoked ? `<div class="copyline"><input readonly value="${esc(link)}"><button class="btn" data-copy-value="${esc(link)}">${icon('link')}Copy</button></div>` : ''}
    <div class="actions">
      ${o.link_token && !o.link_revoked ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${icon('external')}Preview</a>` : ''}
      <form method="post" action="/onboardings/${o.id}/link"><button class="btn">${o.link_token && !o.link_revoked ? 'New link' : 'Create link'}</button></form>
      ${o.link_token && !o.link_revoked ? `<form method="post" action="/onboardings/${o.id}/revoke"><button class="btn danger">Revoke</button></form>` : ''}
    </div>
    <h2>Email</h2>
    <p class="muted small">${o.email_sent_at ? `Sent ${fmt(o.email_sent_at)}` : 'Not sent'}</p>
    <form method="post" action="/onboardings/${o.id}/email"><button class="btn">${icon('mail')}${o.email_sent_at ? 'Resend email' : 'Send email'}</button></form>
    <h2>Remove</h2>
    <p class="muted small">Deletes this record from ${APP_NAME} only. The Stremio account and the AIOManager entry stay.</p>
    <form method="post" action="/onboardings/${o.id}/delete" data-confirm="Delete this onboarding record?"><button class="btn danger">Delete record</button></form>
  </section>
</div>`,
  })
}

const field = (label, name, s, { type = 'text', hint = '', placeholder = '', mono = false } = {}) =>
  `<label>${label}${hint ? ` <span class="muted">${hint}</span>` : ''}<input name="${name}" type="${type}"${mono ? ' class="mono"' : ''} value="${type === 'password' ? '' : esc(s[name])}" placeholder="${esc(type === 'password' && s[name] ? '•••••••• saved, leave blank to keep' : placeholder)}"></label>`
const toggle = (label, name, s, hint = '') =>
  `<label class="check" style="margin-top:16px"><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1" ${s[name] === '1' ? 'checked' : ''}><span>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</span></label>`
const sectionHead = (ic, title, sub) =>
  `<div class="title-row card-head"><span class="badge-icon">${icon(ic)}</span><div><h1 style="font-size:17px">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>`

export function settingsPage({ s, serverName, flash, defaultGuide, user }) {
  return layout({
    title: 'Settings',
    active: 'settings',
    serverName,
    flash,
    user,
    body: `<form method="post" action="/settings" class="settings">
  <section class="card">
    ${sectionHead('sliders', 'General', 'How you appear on welcome pages and emails.')}
    ${field('Server name', 'server_name', s)}
    ${field('Public URL', 'public_url', s, { hint: 'base for welcome links', placeholder: 'https://join.example.com', mono: true })}
    ${field('Link lifetime (days)', 'link_ttl_days', s, { type: 'number' })}
    ${field('Support contact', 'support_contact', s, { hint: 'shown in the guide and email', placeholder: 'Message me on WhatsApp' })}
    ${field('Stremio API', 'stremio_api', s, { hint: 'leave as https://api.strem.io', mono: true })}
  </section>

  <section class="card" id="aiomanager">
    ${sectionHead('plug', 'AIOManager', 'The account UUID and master password you log in to AIOManager with.')}
    ${toggle('Add new accounts to AIOManager', 'aio_enabled', s)}
    ${field('AIOManager URL', 'aio_url', s, { placeholder: 'https://aiomanager.lan', mono: true })}
    ${field('Account UUID', 'aio_uuid', s, { placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', mono: true })}
    ${field('Master password', 'aio_password', s, { type: 'password' })}
    ${toggle('Allow self-signed TLS certificate', 'aio_insecure_tls', s, 'For LAN instances behind Caddy <code>tls internal</code>')}
    <label>Custom CA certificate <span class="muted">PEM, safer than allowing self-signed</span><textarea name="aio_ca" rows="3" placeholder="-----BEGIN CERTIFICATE-----">${esc(s.aio_ca)}</textarea></label>
    <div class="actions"><button class="btn" type="button" data-test="/api/test/aiomanager">${icon('plug')}Test connection</button><span class="test-out"></span></div>
  </section>

  <section class="card" id="email">
    ${sectionHead('mail', 'Email', 'SMTP for sending welcome emails. Optional.')}
    ${field('SMTP host', 'smtp_host', s, { placeholder: 'smtp.gmail.com', mono: true })}
    ${field('Port', 'smtp_port', s, { type: 'number' })}
    ${toggle('Use implicit TLS', 'smtp_secure', s, 'Usually port 465')}
    ${field('Username', 'smtp_user', s)}
    ${field('Password', 'smtp_pass', s, { type: 'password' })}
    ${field('From', 'smtp_from', s, { placeholder: 'AIOOnboarder <you@example.com>' })}
    ${toggle('Include the temporary password in the email', 'email_include_credentials', s, 'Otherwise the email only carries the welcome link')}
    <div class="actions"><input name="test_to" type="email" placeholder="send a test to…" class="inline"><button class="btn" type="button" data-test="/api/test/smtp">${icon('mail')}Send test</button><span class="test-out"></span></div>
  </section>

  <section class="card wide">
    ${sectionHead('book', 'Onboarding guide', 'Markdown shown on the welcome page under the login details. Placeholders: <code>{{name}}</code> <code>{{email}}</code> <code>{{server_name}}</code> <code>{{support_contact}}</code>. Leave empty for the built-in guide.')}
    <textarea name="guide_md" rows="18" placeholder="${esc(defaultGuide)}">${esc(s.guide_md)}</textarea>
  </section>

  <div class="savebar"><button class="primary">Save settings</button></div>
</form>`,
  })
}

export function welcomePage({ o, s, guideHtml, state }) {
  const serverName = s.server_name || APP_NAME
  if (state !== 'ok') {
    const msg = { expired: 'This welcome link has expired.', revoked: 'This welcome link is no longer active.', missing: 'This welcome link is not valid.' }[state]
    return layout({
      title: 'Welcome',
      nav: false,
      serverName,
      body: `<div class="welcome">${heroBrand(serverName, 'Welcome aboard.')}<div class="card"><h1>${esc(msg)}</h1><p class="muted">Ask whoever sent it for a new one.${s.support_contact ? ' ' + esc(s.support_contact) : ''}</p></div></div>`,
    })
  }
  return layout({
    title: 'Welcome',
    nav: false,
    serverName,
    body: `<div class="welcome">
  ${heroBrand(serverName, 'Welcome aboard.')}
  <section class="card intro">
    <h1>Welcome${o.name ? `, ${esc(o.name)}` : ''}</h1>
    <p class="muted">Your Stremio account is ready. Log in with these details:</p>
    <div class="creds big">
      <div><span class="muted">Email</span><code data-copy>${esc(o.email)}</code></div>
      <div><span class="muted">Temporary password</span><code data-copy>${esc(o.temp_password)}</code></div>
    </div>
    <p class="muted small" style="margin:0">Tap a value to copy it. Keep this page private: anyone with the link can see your password.</p>
  </section>
  <section class="card guide">${guideHtml}</section>
</div>`,
  })
}
