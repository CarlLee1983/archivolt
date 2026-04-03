// extension/src/background.ts
import { DEFAULT_STATE, type ExtensionState } from './types'
import { createApi, type ExtensionApi } from './api'

let state: ExtensionState = { ...DEFAULT_STATE }
let api: ExtensionApi = createApi(state.apiBaseUrl)

// ── State persistence ──

async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get(['archivoltState'])
  if (stored.archivoltState) {
    state = { ...DEFAULT_STATE, ...stored.archivoltState }
    api = createApi(state.apiBaseUrl)
  }
}

async function saveState(): Promise<void> {
  await chrome.storage.local.set({ archivoltState: state })
}

function updateState(patch: Partial<ExtensionState>): void {
  state = { ...state, ...patch }
  saveState()
}

// ── Connection lifecycle ──

async function connect(tabId: number): Promise<{ success: boolean; error?: string }> {
  const status = await api.checkStatus()
  if (!status.recording) {
    return { success: false, error: 'Archivolt 沒有進行中的錄製 session' }
  }
  updateState({
    connected: true,
    lockedTabId: tabId,
    sessionId: status.sessionId,
  })
  chrome.action.setBadgeText({ text: 'REC' })
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
  return { success: true }
}

function disconnect(): void {
  updateState({
    connected: false,
    lockedTabId: null,
    sessionId: null,
  })
  chrome.action.setBadgeText({ text: '' })
}

// ── Marker sending ──

function sendMarker(
  url: string,
  action: 'navigate' | 'submit' | 'click' | 'request',
  target?: string,
  request?: import('./types').RequestDetail,
  label?: string,
): void {
  if (!state.connected) return
  api.sendMarker({ url, action, target, request, label })
}

// ── webNavigation listener (page navigations in locked tab) ──

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!state.connected) return
  if (details.tabId !== state.lockedTabId) return
  if (details.frameId !== 0) return // main frame only
  const tab = await chrome.tabs.get(details.tabId)
  sendMarker(new URL(details.url).pathname, 'navigate', undefined, undefined, tab.title)
})

// ── Message handler (from content script + popup) ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONNECT') {
    connect(message.tabId).then(sendResponse)
    return true // async response
  }

  if (message.type === 'DISCONNECT') {
    disconnect()
    sendResponse({ success: true })
    return false
  }

  if (message.type === 'GET_STATE') {
    sendResponse(state)
    return false
  }

  if (message.type === 'SET_API_URL') {
    updateState({ apiBaseUrl: message.url })
    api = createApi(message.url)
    sendResponse({ success: true })
    return false
  }

  if (message.type === 'MARKER') {
    if (!state.connected) return false
    if (sender.tab?.id !== state.lockedTabId) return false
    sendMarker(message.url, message.action, message.target, message.request)
    return false
  }

  if (message.type === 'SPA_NAVIGATE') {
    if (!state.connected) return false
    if (sender.tab?.id !== state.lockedTabId) return false
    sendMarker(message.url, 'navigate', undefined, undefined, message.label)
    return false
  }

  return false
})

// ── Init ──

loadState()
