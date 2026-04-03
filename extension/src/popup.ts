import type { ExtensionState } from './types'

const statusEl = document.getElementById('status')!
const apiUrlInput = document.getElementById('apiUrl') as HTMLInputElement
const actionBtn = document.getElementById('actionBtn')!

function updateUI(state: ExtensionState): void {
  apiUrlInput.value = state.apiBaseUrl

  if (state.connected) {
    statusEl.className = 'status status-connected'
    statusEl.textContent = `錄製中 — Session: ${state.sessionId?.slice(0, 12)}...`
    actionBtn.className = 'btn btn-disconnect'
    actionBtn.textContent = '停止側錄'
    apiUrlInput.disabled = true
  } else {
    statusEl.className = 'status status-disconnected'
    statusEl.textContent = '尚未連線'
    actionBtn.className = 'btn btn-connect'
    actionBtn.textContent = '開始側錄'
    apiUrlInput.disabled = false
  }
}

function showError(message: string): void {
  statusEl.className = 'status status-error'
  statusEl.textContent = message
}

// Load initial state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state: ExtensionState) => {
  updateUI(state)
})

// Save API URL on change
apiUrlInput.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'SET_API_URL', url: apiUrlInput.value.trim() })
})

// Connect / Disconnect
actionBtn.addEventListener('click', async () => {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as ExtensionState

  if (state.connected) {
    chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, updateUI)
    })
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      showError('無法取得當前分頁')
      return
    }

    chrome.runtime.sendMessage({ type: 'SET_API_URL', url: apiUrlInput.value.trim() })

    const result = await chrome.runtime.sendMessage({ type: 'CONNECT', tabId: tab.id }) as { success: boolean; error?: string }
    if (!result.success) {
      showError(result.error ?? '連線失敗')
      return
    }

    chrome.runtime.sendMessage({ type: 'GET_STATE' }, updateUI)
  }
})
