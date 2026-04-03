// extension/src/content.ts

import type { RequestDetail } from './types'

// ── Constants ──

const MAX_BODY_LENGTH = 8192

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
  'x-api-key',
  'proxy-authorization',
])

// ── Helpers ──

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = el.className && typeof el.className === 'string'
    ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
    : ''
  const text = el.textContent?.trim().slice(0, 40) || ''
  const textPart = text ? ` "${text}"` : ''
  return `${tag}${id}${cls}${textPart}`
}

function sendToBackground(type: string, data: Record<string, unknown>): void {
  chrome.runtime.sendMessage({ type, ...data })
}

function truncateBody(body: string | undefined): string | undefined {
  if (!body) return undefined
  return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '…[truncated]' : body
}

function redactHeaders(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    result[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[redacted]' : v
  }
  return result
}

function extractHeadersFromObj(headers: HeadersInit | Headers | undefined): Record<string, string> | undefined {
  if (!headers) return undefined
  const raw: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { raw[k] = v })
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) { raw[k] = v }
  } else {
    Object.assign(raw, headers)
  }
  if (Object.keys(raw).length === 0) return undefined
  return redactHeaders(raw)
}

function parseQueryParams(url: string): Record<string, string> | undefined {
  try {
    const parsed = new URL(url, location.origin)
    if (parsed.searchParams.toString() === '') return undefined
    const params: Record<string, string> = {}
    parsed.searchParams.forEach((v, k) => { params[k] = v })
    return params
  } catch {
    return undefined
  }
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
  if (input instanceof ArrayBuffer || input instanceof Blob) return '[binary]'
  return undefined
}

function serializeFormData(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form)
  const obj: Record<string, string> = {}
  data.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
  return obj
}

function isApiUrl(url: string): boolean {
  try {
    const pathname = new URL(url, location.origin).pathname
    return pathname.startsWith('/api/') || pathname.startsWith('/graphql')
  } catch {
    return false
  }
}

// ── Form submit listener ──

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  const method = (form.method || 'GET').toUpperCase()
  const actionUrl = form.action || location.href
  const formFields = serializeFormData(form)

  const isGet = method === 'GET'
  const urlParams = parseQueryParams(actionUrl) ?? {}
  const queryParams = isGet
    ? { ...urlParams, ...formFields }
    : Object.keys(urlParams).length > 0 ? urlParams : undefined

  const request: RequestDetail = {
    method,
    url: actionUrl,
    queryParams: queryParams && Object.keys(queryParams).length > 0 ? queryParams : undefined,
    body: isGet ? undefined : truncateBody(JSON.stringify(formFields)),
  }

  sendToBackground('MARKER', {
    url: location.pathname,
    action: 'submit',
    target: describeElement(form),
    request,
  })
}, { capture: true })

// ── Click listener (buttons, links, input[type=submit]) ──

document.addEventListener('click', (e) => {
  const target = e.target as Element
  const clickable = target.closest('button, a, input[type="submit"]')
  if (!clickable) return
  sendToBackground('MARKER', {
    url: location.pathname,
    action: 'click',
    target: describeElement(clickable),
  })
}, { capture: true })

// ── Fetch/XHR interception ──

const originalFetch = window.fetch
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const isRequest = input instanceof Request
  const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase()

  const shouldCapture = method !== 'GET' || isApiUrl(reqUrl)

  if (shouldCapture) {
    const headers = init?.headers
      ? extractHeadersFromObj(init.headers)
      : isRequest
        ? extractHeadersFromObj((input as Request).headers)
        : undefined

    const bodySource = init?.body !== undefined
      ? init.body
      : isRequest
        ? (input as Request).clone().body
        : null

    const bodyPromise = method === 'GET'
      ? Promise.resolve(undefined)
      : bodySource instanceof ReadableStream
        ? new Response(bodySource).text().then(truncateBody).catch(() => '[unreadable]')
        : extractBody(bodySource as BodyInit | null | undefined)

    bodyPromise.then((body) => {
      const request: RequestDetail = {
        method,
        url: reqUrl,
        headers,
        body,
        queryParams: parseQueryParams(reqUrl),
      }
      sendToBackground('MARKER', {
        url: location.pathname,
        action: 'request',
        target: `${method} ${reqUrl}`,
        request,
      })
    })
  }
  return originalFetch.call(this, input, init)
}

const originalXHROpen = XMLHttpRequest.prototype.open
const originalXHRSend = XMLHttpRequest.prototype.send
const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader

XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
  (this as any).__archivolt = {
    method: method.toUpperCase(),
    url: typeof url === 'string' ? url : url.href,
    headers: {} as Record<string, string>,
  }
  return originalXHROpen.call(this, method, url, ...rest)
}

XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
  if ((this as any).__archivolt) {
    ;(this as any).__archivolt.headers[name] = value
  }
  return originalXHRSetHeader.call(this, name, value)
}

XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
  const meta = (this as any).__archivolt
  if (meta) {
    const shouldCapture = meta.method !== 'GET' || isApiUrl(meta.url)

    if (shouldCapture) {
    let bodyStr: string | undefined
    if (meta.method === 'GET') {
      bodyStr = undefined
    } else if (body == null) bodyStr = undefined
    else if (typeof body === 'string') bodyStr = truncateBody(body)
    else if (body instanceof URLSearchParams) bodyStr = truncateBody(body.toString())
    else if (body instanceof FormData) {
      const obj: Record<string, string> = {}
      body.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
      bodyStr = truncateBody(JSON.stringify(obj))
    } else {
      bodyStr = '[binary]'
    }

    const headers = Object.keys(meta.headers).length > 0 ? redactHeaders(meta.headers) : undefined
    const request: RequestDetail = {
      method: meta.method,
      url: meta.url,
      headers,
      body: bodyStr,
      queryParams: parseQueryParams(meta.url),
    }

    sendToBackground('MARKER', {
      url: location.pathname,
      action: 'request',
      target: `${meta.method} ${meta.url}`,
      request,
    })
    } // end shouldCapture
  } // end meta
  return originalXHRSend.call(this, body)
}

// ── SPA history interception ──

const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function (...args: Parameters<typeof history.pushState>) {
  originalPushState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  originalReplaceState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

window.addEventListener('popstate', () => {
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
})
