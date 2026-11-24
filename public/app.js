// Small progressive enhancements: copy-to-clipboard, the onboarding form, settings tests.
const $ = (s, el = document) => el.querySelector(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

async function copy(text, el) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const t = document.createElement('textarea')
    t.value = text
    document.body.appendChild(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
  if (el) {
    el.classList.add('copied')
    setTimeout(() => el.classList.remove('copied'), 1200)
  }
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]')
  if (c) return copy(c.textContent.trim(), c)
  const v = e.target.closest('[data-copy-value]')
  if (v) {
    e.preventDefault()
    copy(v.dataset.copyValue, v)
    const label = [...v.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    if (label) {
      const old = label.textContent
      label.textContent = 'Copied'
      setTimeout(() => (label.textContent = old), 1200)
    }
  }
})

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-confirm]')
  if (f && !confirm(f.dataset.confirm)) e.preventDefault()
})

const STEP_LABELS = { stremio: 'Stremio account', aiomanager: 'Add to AIOManager', email: 'Welcome email' }

async function refreshList() {
  try {
    const html = await (await fetch('/', { headers: { Accept: 'text/html' } })).text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const sel of ['.rows', '.list .card-head', '.tabs']) {
      const fresh = doc.querySelector(sel)
      const cur = $(sel)
      if (fresh && cur) cur.replaceWith(fresh)
    }
  } catch {}
}

const form = $('#onboard-form')
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const out = $('#onboard-result')
    const btn = $('button[type=submit]', form)
    const fd = new FormData(form)
    const btnHtml = btn.innerHTML
    btn.disabled = true
    btn.textContent = 'Creating account…'
    out.hidden = false
    out.className = 'result'
    out.innerHTML = '<p class="muted">Creating the Stremio account and syncing AIOManager. This takes a few seconds.</p>'
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fd.get('email'),
          name: fd.get('name'),
          createLink: fd.get('createLink') === 'on',
          notifyEmail: fd.get('notifyEmail') === 'on',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        out.className = 'result bad'
        out.innerHTML = `<p class="err">${esc(data.error || 'Failed')}</p>${data.id ? `<p><a href="/onboardings/${esc(data.id)}">Open the existing record</a></p>` : ''}`
        return
      }
      const steps = Object.entries(data.steps)
        .map(([k, st]) => `<li class="${st.ok ? (st.skipped ? 'skip' : 'ok') : 'bad'}"><b>${STEP_LABELS[k] || k}</b><span>${esc(st.error || st.detail || '')}</span></li>`)
        .join('')
      out.className = `result ${data.status === 'done' ? 'good' : 'bad'}`
      out.innerHTML = `
        <ul class="timeline">${steps}</ul>
        ${data.steps.stremio?.ok ? `<div class="creds">
          <div><span class="muted">Email</span><code data-copy>${esc(data.email)}</code></div>
          <div><span class="muted">Temporary password</span><code data-copy>${esc(data.password)}</code></div>
        </div>` : ''}
        ${data.link ? `<div class="copyline"><input readonly value="${esc(data.link)}"><button class="btn" data-copy-value="${esc(data.link)}">Copy link</button></div>` : ''}
        <p style="margin:14px 0 0"><a class="btn" href="/onboardings/${esc(data.id)}">Open record →</a></p>`
      if (data.steps.stremio?.ok) form.reset()
      refreshList()
    } catch (err) {
      out.className = 'result bad'
      out.innerHTML = `<p class="err">${esc(err.message)}</p>`
    } finally {
      btn.disabled = false
      btn.innerHTML = btnHtml
    }
  })
}

document.querySelectorAll('[data-test]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const f = btn.closest('form')
    const outEl = btn.parentElement.querySelector('.test-out')
    outEl.className = 'test-out muted'
    outEl.textContent = 'Testing…'
    btn.disabled = true
    try {
      const res = await fetch(btn.dataset.test, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(f)),
      })
      const data = await res.json()
      outEl.className = `test-out ${data.ok ? 'ok' : 'bad'}`
      outEl.textContent = data.message || data.error
    } catch (err) {
      outEl.className = 'test-out bad'
      outEl.textContent = err.message
    } finally {
      btn.disabled = false
    }
  })
})

// Synced add-ons, read live from AIOManager.
const addonList = $('[data-addons]')
async function loadAddons() {
  addonList.innerHTML = '<p class="muted small">Loading from AIOManager…</p>'
  try {
    const data = await (await fetch(addonList.dataset.addons)).json()
    if (!data.ok) throw new Error(data.message || data.error)
    addonList.innerHTML = data.addons.length
      ? `<ul>${data.addons.map((a) => `<li><span class="ph">${esc((a.name || '?').charAt(0).toUpperCase())}</span><span><strong>${esc(a.name)}</strong><span class="muted small">${esc(a.host)}${a.version ? ` · v${esc(a.version)}` : ''}</span></span></li>`).join('')}</ul>`
      : '<p class="muted small">No saved add-ons have <b>Sync with installed</b> on in AIOManager.</p>'
  } catch (err) {
    addonList.innerHTML = `<p class="test-out bad">${esc(err.message)}</p>`
  }
}
if (addonList) {
  loadAddons()
  $('[data-addons-refresh]')?.addEventListener('click', loadAddons)
}

// ---- settings page ----
const settingsForm = $('#settings-form')
if (settingsForm) {
  const bar = $('.savebar', settingsForm)
  const note = $('#dirty-note')
  const snapshot = () => new URLSearchParams(new FormData(settingsForm)).toString().replace(/(^|&)test_to=[^&]*/, '')
  const initial = snapshot()
  let submitting = false
  const update = () => {
    const dirty = snapshot() !== initial
    bar.classList.toggle('dirty', dirty)
    note.textContent = dirty ? 'You have unsaved changes' : 'All changes saved'
  }
  settingsForm.addEventListener('input', update)
  settingsForm.addEventListener('change', update)
  settingsForm.addEventListener('submit', () => (submitting = true))
  window.addEventListener('beforeunload', (e) => {
    if (!submitting && snapshot() !== initial) e.preventDefault()
  })

  const guide = $('#guide-md')
  $('#guide-load-default')?.addEventListener('click', () => {
    if (guide.value.trim() && !confirm('Replace the current guide text with the built-in guide?')) return
    guide.value = $('#guide-default').content.textContent.trim() + '\n'
    guide.rows = 18
    guide.focus()
    update()
  })
  $('#guide-clear')?.addEventListener('click', () => {
    if (guide.value.trim() && !confirm('Clear your custom guide and use the built-in one?')) return
    guide.value = ''
    guide.rows = 4
    update()
  })

  // Highlight the section in view in the side nav.
  const links = [...document.querySelectorAll('.set-nav a')]
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id))
    }
  }, { rootMargin: '-30% 0px -60% 0px' })
  document.querySelectorAll('.set-section').forEach((el) => io.observe(el))
}
