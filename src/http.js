// Minimal JSON-over-HTTP(S) client on node:http/https so we can pass a custom CA
// or skip verification for LAN services behind self-signed certs (e.g. Caddy `tls internal`),
// without pulling in undici.
import http from 'node:http'
import https from 'node:https'

export class HttpError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

export function requestJson(url, { method = 'GET', headers = {}, body, ca, insecure = false, timeoutMs = 30000 } = {}) {
  const u = new URL(url)
  const lib = u.protocol === 'https:' ? https : http
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  const opts = {
    method,
    hostname: u.hostname,
    port: u.port || undefined,
    path: u.pathname + u.search,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'aioonboarder',
      ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers,
    },
    timeout: timeoutMs,
  }
  if (u.protocol === 'https:') {
    if (ca) opts.ca = ca
    if (insecure) opts.rejectUnauthorized = false
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = null
        if (text) {
          try { data = JSON.parse(text) } catch { data = text }
        }
        resolve({ status: res.statusCode, headers: res.headers, data })
      })
    })
    req.on('timeout', () => req.destroy(new Error(`Request to ${u.host} timed out`)))
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}
