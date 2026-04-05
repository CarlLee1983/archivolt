// extension/src/content-main.ts — MAIN world
// Manages all state synchronously (no postMessage round-trips for state).
// Posts captured markers to window for the ISOLATED bridge to relay.

const MAX_BODY_LENGTH = 8192

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie',
  'x-csrf-token', 'x-xsrf-token', 'x-api-key', 'proxy-authorization',
])

// ── Marker post ──

function post(type: string, data: Record<string, unknown>): void {
  window.postMessage({ __archivolt: true, type, ...data }, '*')
}

// ── Helpers ──

function truncateBody(body: string | undefined): string | undefined {
  if (!body) return undefined
  return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '…[truncated]' : body
}

function redactHeaders(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw))
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[redacted]' : v
  return out
}

function extractHeaders(headers: HeadersInit | Headers | undefined): Record<string, string> | undefined {
  if (!headers) return undefined
  const raw: Record<string, string> = {}
  if (headers instanceof Headers) headers.forEach((v, k) => { raw[k] = v })
  else if (Array.isArray(headers)) for (const [k, v] of headers) { raw[k] = v }
  else Object.assign(raw, headers)
  return Object.keys(raw).length ? redactHeaders(raw) : undefined
}

function parseQuery(url: string): Record<string, string> | undefined {
  try {
    const u = new URL(url, location.origin)
    if (!u.searchParams.toString()) return undefined
    const p: Record<string, string> = {}
    u.searchParams.forEach((v, k) => { p[k] = v })
    return p
  } catch { return undefined }
}

async function extractBody(input?: BodyInit | null): Promise<string | undefined> {
  if (input == null) return undefined
  if (typeof input === 'string') return truncateBody(input)
  if (input instanceof URLSearchParams) return truncateBody(input.toString())
  if (input instanceof FormData) {
    const obj: Record<string, string> = {}
    input.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
    return truncateBody(JSON.stringify(obj))
  }
  return '[binary]'
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = typeof el.className === 'string'
    ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map(c => `.${c}`).join('')
    : ''
  const text = el.textContent?.trim().slice(0, 40) || ''
  return `${tag}${id}${cls}${text ? ` "${text}"` : ''}`
}

function serializeForm(form: HTMLFormElement): Record<string, string> {
  const obj: Record<string, string> = {}
  new FormData(form).forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
  return obj
}

function isInertia(headers: HeadersInit | Headers | undefined): boolean {
  if (!headers) return false
  if (headers instanceof Headers) return headers.has('X-Inertia')
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === 'x-inertia')
  return 'X-Inertia' in headers || 'x-inertia' in headers
}

// ── User-action state (managed synchronously) ──

interface PendingClick { target: string; url: string; timer: ReturnType<typeof setTimeout> }

let pendingClick: PendingClick | null = null
let lastUserActionAt = 0       // ms timestamp of last click or submit
let lastInertiaAt = 0          // ms timestamp of last Inertia request (suppress redundant pushState)

const USER_ACTION_WINDOW_MS = 600  // capture window after user action

function userActionRecent(): boolean {
  return Date.now() - lastUserActionAt < USER_ACTION_WINDOW_MS
}

function flushPendingClick(): void {
  if (!pendingClick) return
  clearTimeout(pendingClick.timer)
  post('MARKER', { url: pendingClick.url, action: 'click', target: pendingClick.target })
  pendingClick = null
}

function discardPendingClick(): void {
  if (!pendingClick) return
  clearTimeout(pendingClick.timer)
  pendingClick = null
}

// ── Click listener ──

document.addEventListener('click', (e) => {
  const clickable = (e.target as Element).closest('button, a, input[type="submit"]')
  if (!clickable) return

  discardPendingClick()
  lastUserActionAt = Date.now()

  const timer = setTimeout(() => { pendingClick = null }, USER_ACTION_WINDOW_MS)
  pendingClick = { target: describeElement(clickable), url: location.pathname, timer }
}, { capture: true })

// ── Submit listener ──

document.addEventListener('submit', (e) => {
  flushPendingClick()
  lastUserActionAt = Date.now()

  const form = e.target as HTMLFormElement
  const method = (form.method || 'GET').toUpperCase()
  const actionUrl = form.action || location.href
  const fields = serializeForm(form)
  const isGet = method === 'GET'
  const queryParams = isGet ? { ...parseQuery(actionUrl), ...fields } : parseQuery(actionUrl)

  post('MARKER', {
    url: location.pathname,
    action: 'submit',
    target: describeElement(form),
    request: {
      method, url: actionUrl,
      queryParams: queryParams && Object.keys(queryParams).length ? queryParams : undefined,
      body: isGet ? undefined : truncateBody(JSON.stringify(fields)),
    },
  })
}, { capture: true })

// ── Fetch interception ──

const _fetch = window.fetch
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const isReq = input instanceof Request
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  const method = (init?.method ?? (isReq ? (input as Request).method : 'GET')).toUpperCase()
  const rawHeaders = init?.headers ?? (isReq ? (input as Request).headers : undefined)
  const inertiaReq = isInertia(rawHeaders)
  const shouldCapture = userActionRecent() || inertiaReq

  if (shouldCapture && !isNoisyUrl(url)) {
    flushPendingClick()
    if (inertiaReq) lastInertiaAt = Date.now()

    const headers = extractHeaders(rawHeaders)
    const bodySource = init?.body !== undefined ? init.body
      : isReq ? (input as Request).clone().body : null

    const bodyP = method === 'GET' ? Promise.resolve(undefined)
      : bodySource instanceof ReadableStream
        ? new Response(bodySource).text().then(truncateBody).catch(() => '[unreadable]')
        : extractBody(bodySource as BodyInit | null | undefined)

    bodyP.then((body) => {
      post('MARKER', {
        url: location.pathname,
        action: inertiaReq ? 'navigate' : 'request',
        target: inertiaReq ? url : `${method} ${url}`,
        request: { method, url, headers, body, queryParams: parseQuery(url) },
      })
    })
  }

  return _fetch.call(this, input, init)
}

// ── XHR interception ──

const _xhrOpen = XMLHttpRequest.prototype.open
const _xhrSend = XMLHttpRequest.prototype.send
const _xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader

XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
  ;(this as any).__av = { method: method.toUpperCase(), url: String(url), headers: {} as Record<string, string> }
  return _xhrOpen.call(this, method, url, ...rest)
}

XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
  if ((this as any).__av) (this as any).__av.headers[name] = value
  return _xhrSetHeader.call(this, name, value)
}

XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
  const m = (this as any).__av
  if (m) {
    const inertiaReq = 'X-Inertia' in m.headers || 'x-inertia' in m.headers
    const shouldCapture = userActionRecent() || inertiaReq

    if (shouldCapture && !isNoisyUrl(m.url)) {
      flushPendingClick()
      if (inertiaReq) lastInertiaAt = Date.now()

      let bodyStr: string | undefined
      if (m.method !== 'GET' && body != null) {
        if (typeof body === 'string') bodyStr = truncateBody(body)
        else if (body instanceof URLSearchParams) bodyStr = truncateBody(body.toString())
        else if (body instanceof FormData) {
          const obj: Record<string, string> = {}
          body.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
          bodyStr = truncateBody(JSON.stringify(obj))
        } else bodyStr = '[binary]'
      }

      const headers = Object.keys(m.headers).length ? redactHeaders(m.headers) : undefined
      post('MARKER', {
        url: location.pathname,
        action: inertiaReq ? 'navigate' : 'request',
        target: inertiaReq ? m.url : `${m.method} ${m.url}`,
        request: { method: m.method, url: m.url, headers, body: bodyStr, queryParams: parseQuery(m.url) },
      })
    }
  }
  return _xhrSend.call(this, body)
}

// ── URL noise filter ──
// Requests matching these patterns are never captured regardless of timing.

const NOISE_URL_PATTERNS = [
  /_debugbar\//,
  /\/dataapi\/heartbeat/,
  /\/heartbeat$/,
]

function isNoisyUrl(url: string): boolean {
  return NOISE_URL_PATTERNS.some(p => p.test(url))
}

// ── SPA history interception ──
// Suppress pushState that fires within 1500ms of an Inertia request (it's Inertia's own redirect).
// 300ms was too short for slow networks where response + DOM update takes 400-600ms.

const INERTIA_PUSHSTATE_SUPPRESS_MS = 1500

const _pushState = history.pushState
const _replaceState = history.replaceState

history.pushState = function (...args: Parameters<typeof history.pushState>) {
  _pushState.apply(this, args)
  if (Date.now() - lastInertiaAt > INERTIA_PUSHSTATE_SUPPRESS_MS)
    post('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  _replaceState.apply(this, args)
  if (Date.now() - lastInertiaAt > INERTIA_PUSHSTATE_SUPPRESS_MS)
    post('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

window.addEventListener('popstate', () => {
  post('SPA_NAVIGATE', { url: location.pathname, label: document.title })
})
