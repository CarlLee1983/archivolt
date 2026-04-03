// extension/src/content.ts

// ── Helpers ──

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = el.className && typeof el.className === 'string'
    ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
    : ''
  return `${tag}${id}${cls}`
}

function sendToBackground(type: string, data: Record<string, unknown>): void {
  chrome.runtime.sendMessage({ type, ...data })
}

// ── Form submit listener ──

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  sendToBackground('MARKER', {
    url: location.pathname,
    action: 'submit',
    target: describeElement(form),
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
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? 'GET'
  if (method.toUpperCase() !== 'GET') {
    sendToBackground('MARKER', {
      url: location.pathname,
      action: 'request',
      target: `${method.toUpperCase()} ${url}`,
    })
  }
  return originalFetch.call(this, input, init)
}

const originalXHROpen = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
  if (method.toUpperCase() !== 'GET') {
    sendToBackground('MARKER', {
      url: location.pathname,
      action: 'request',
      target: `${method.toUpperCase()} ${typeof url === 'string' ? url : url.href}`,
    })
  }
  return originalXHROpen.call(this, method, url, ...rest)
}

// ── SPA history interception ──

const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function (...args: Parameters<typeof history.pushState>) {
  originalPushState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname })
}

history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  originalReplaceState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname })
}

window.addEventListener('popstate', () => {
  sendToBackground('SPA_NAVIGATE', { url: location.pathname })
})
