// extension/src/content.ts — ISOLATED world (bridge only)
// Relays postMessage from content-main.ts to chrome.runtime (background).

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data?.__archivolt) return
  const { __archivolt, type, ...rest } = e.data
  chrome.runtime.sendMessage({ type, ...rest }).catch(() => {})
})
