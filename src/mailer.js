import nodemailer from 'nodemailer'

export function smtpConfigured(s) {
  return !!(s.smtp_host && s.smtp_from)
}

function transport(s) {
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port) || 587,
    secure: s.smtp_secure === '1',
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  })
}

export async function verifySmtp(s) {
  await transport(s).verify()
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export async function sendWelcome(s, { to, name, link, email, password }) {
  const includeCreds = s.email_include_credentials === '1'
  const server = s.server_name || 'AIOOnboarder'
  const hello = name ? `Hi ${name},` : 'Hi,'
  const lines = [
    hello,
    '',
    `You've been set up on ${server}. A Stremio account has been created for you with everything already configured.`,
    '',
  ]
  if (link) lines.push(`Open your welcome page for your login details and setup guide:`, link, '')
  if (includeCreds || !link) lines.push(`Stremio email: ${email}`, `Temporary password: ${password}`, '')
  if (s.support_contact) lines.push(`Questions? ${s.support_contact}`)
  const text = lines.join('\n')

  const html = `<!doctype html><html><body style="margin:0;background:#000000;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fafafa">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:20px;font-weight:700;margin-bottom:20px">${esc(server)}</div>
    <div style="background:#0f0f0f;border:1px solid #292929;border-radius:12px;padding:24px">
      <p style="margin:0 0 12px">${esc(hello)}</p>
      <p style="margin:0 0 20px;color:#a3a3a3">You've been set up on ${esc(server)}. A Stremio account has been created for you with everything already configured.</p>
      ${link ? `<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open your welcome page</a></p>` : ''}
      ${includeCreds || !link ? `<table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#a3a3a3">Email</td><td style="padding:6px 0;font-family:monospace">${esc(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#a3a3a3">Temporary password</td><td style="padding:6px 0;font-family:monospace">${esc(password)}</td></tr>
      </table>` : ''}
    </div>
    ${s.support_contact ? `<p style="color:#a3a3a3;font-size:13px;margin-top:16px">Questions? ${esc(s.support_contact)}</p>` : ''}
  </div></body></html>`

  await transport(s).sendMail({ from: s.smtp_from, to, subject: `Welcome to ${server}`, text, html })
}

export async function sendTest(s, to) {
  await transport(s).sendMail({ from: s.smtp_from, to, subject: `${s.server_name || 'AIOOnboarder'} test email`, text: 'SMTP is working.' })
}
