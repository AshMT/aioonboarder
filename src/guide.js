import { marked } from 'marked'

export const DEFAULT_GUIDE = `## 1. Install Stremio

Get Stremio on every device you want to watch on:

- **TV / streaming stick:** search the app store for *Stremio* (Android TV, Google TV, Fire TV, Samsung, LG)
- **Phone / tablet:** [Android](https://play.google.com/store/apps/details?id=com.stremio.one) · [iPhone / iPad](https://apps.apple.com/app/stremio-organize-video/id1652924411)
- **Computer:** [stremio.com/downloads](https://www.stremio.com/downloads), or use [web.stremio.com](https://web.stremio.com) in a browser

## 2. Log in

Open Stremio, choose **Log in** (not *Sign up*) and enter the email and temporary password shown above.

Everything is already set up for you, so there's nothing to install or configure. Your addons appear automatically.

## 3. Change your password

Pick your own password once you're logged in: go to [stremio.com/reset-password](https://www.stremio.com/reset-password) and enter {{email}}. You'll get an email with a reset link.

## 4. Please don't remove addons

Your addons are managed for you and kept up to date. If something stops working, just let us know rather than removing or reinstalling addons.

## Need help?

{{support_contact}}
`

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Raw HTML in the guide is escaped, never rendered: the guide is shown on a public page.
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
    link({ href, title, tokens }) {
      const safe = /^(https?:|mailto:|\/|#)/i.test(href || '') ? href : '#'
      const text = this.parser.parseInline(tokens)
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

export function renderGuide(md, vars) {
  const filled = String(md || DEFAULT_GUIDE).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k]
    return v ? String(v).replace(/[\\`*_[\]()#<>]/g, '\\$&') : ''
  })
  return marked.parse(filled)
}
