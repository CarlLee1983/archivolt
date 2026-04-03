# Query Chunking Phase 2: Chrome Extension + Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate browser event capture via Chrome Extension and add timeline playback controls to visualize recording chunks sequentially.

**Architecture:** Chrome Extension (Manifest V3) captures navigate/submit/click/request events and sends them to the existing `POST /api/recording/marker` endpoint. Frontend TimelinePanel gains playback controls (play/pause, step, speed) that auto-advance `activeChunkId` through chunks with proportional time compression.

**Tech Stack:** Chrome Extension (Manifest V3, TypeScript), React + Zustand (frontend playback)

---

## File Structure

### Chrome Extension (`extension/`)

| File | Responsibility |
|------|---------------|
| `extension/manifest.json` | Manifest V3 config, permissions, service worker registration |
| `extension/src/background.ts` | Service worker: webNavigation listener, SPA history interception, state management |
| `extension/src/content.ts` | Content script: DOM event listeners (submit, click), fetch/XHR interception |
| `extension/src/popup.html` | Popup UI shell |
| `extension/src/popup.ts` | Popup logic: API URL config, connect/disconnect, status display |
| `extension/src/api.ts` | Shared HTTP client for Archivolt API calls |
| `extension/src/types.ts` | Shared type definitions |
| `extension/tsconfig.json` | TypeScript config for extension |
| `extension/build.ts` | Bun build script for bundling TS to JS |

### Frontend Playback (`web/src/`)

| File | Responsibility |
|------|---------------|
| `web/src/components/Timeline/PlaybackControls.tsx` | Play/pause, prev/next, speed selector UI |
| `web/src/stores/recordingStore.ts` | Add playback state and actions (playing, speed, timer) |
| `web/src/components/Timeline/TimelinePanel.tsx` | Integrate PlaybackControls into panel header |

### Tests

| File | Tests |
|------|-------|
| `test/unit/Extension/api.test.ts` | Extension API client |
| `test/unit/Web/PlaybackControls.test.ts` | Playback logic (timer, speed, bounds) |

---

## Part A: Chrome Extension

### Task 1: Extension scaffold and types

**Files:**
- Create: `extension/src/types.ts`
- Create: `extension/manifest.json`
- Create: `extension/tsconfig.json`
- Create: `extension/build.ts`

- [ ] **Step 1: Create shared types**

```typescript
// extension/src/types.ts

export interface MarkerPayload {
  readonly url: string
  readonly action: 'navigate' | 'submit' | 'click' | 'request'
  readonly target?: string
  readonly label?: string
}

export interface ExtensionState {
  readonly apiBaseUrl: string
  readonly connected: boolean
  readonly lockedTabId: number | null
  readonly sessionId: string | null
}

export const DEFAULT_STATE: ExtensionState = {
  apiBaseUrl: 'http://localhost:3100',
  connected: false,
  lockedTabId: null,
  sessionId: null,
}

export interface RecordingStatusResponse {
  readonly success: boolean
  readonly data?: {
    readonly recording: boolean
    readonly session?: { readonly id: string }
    readonly proxyPort?: number
  }
}
```

- [ ] **Step 2: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Archivolt Marker",
  "version": "1.0.0",
  "description": "Auto-capture browser events as Archivolt operation markers",
  "permissions": ["activeTab", "webNavigation", "storage"],
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "src/popup.html"
  },
  "host_permissions": ["http://localhost:3100/*"]
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create build script**

```typescript
// extension/build.ts
import { build } from 'bun'

await build({
  entrypoints: [
    './src/background.ts',
    './src/content.ts',
    './src/popup.ts',
  ],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
})

console.log('Extension built to dist/')
```

- [ ] **Step 5: Install chrome types and verify build**

Run:
```bash
cd extension && bun add -d @anthropic-ai/claude-code @anthropic-ai/claude-code 2>/dev/null; bun add -d @anthropic-ai/claude-code 2>/dev/null; bun add -d @types/chrome
```

Run:
```bash
cd extension && bun run build.ts
```
Expected: Build succeeds (no source files to compile yet, but config is valid)

- [ ] **Step 6: Commit**

```bash
git add extension/
git commit -m "feat: [extension] 建立 Chrome Extension 專案骨架與型別定義"
```

---

### Task 2: Extension API client

**Files:**
- Create: `extension/src/api.ts`
- Create: `test/unit/Extension/api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Extension/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('ExtensionApi', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkStatus', () => {
    it('should return session id when recording is active', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: true, session: { id: 'sess-123' } },
        }),
      })

      const { createApi } = await import('@/../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: true, sessionId: 'sess-123' })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/recording/status',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('should return not recording when no active session', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: false },
        }),
      })

      const { createApi } = await import('@/../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: false, sessionId: null })
    })
  })

  describe('sendMarker', () => {
    it('should POST marker and return success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'marker-1', sessionId: 'sess-123', timestamp: 1000, url: '/test', action: 'click' },
        }),
      })

      const { createApi } = await import('@/../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'click', target: 'button.save' })

      expect(result.success).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/recording/marker',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: '/test', action: 'click', target: 'button.save' }),
        }),
      )
    })

    it('should return error when no active session', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NO_ACTIVE_SESSION', message: 'No active recording session' },
        }),
      })

      const { createApi } = await import('@/../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No active recording session')
    })

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      const { createApi } = await import('@/../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Extension/api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the API client**

```typescript
// extension/src/api.ts
import type { MarkerPayload } from './types'

interface StatusResult {
  readonly recording: boolean
  readonly sessionId: string | null
}

interface MarkerResult {
  readonly success: boolean
  readonly error?: string
}

export function createApi(baseUrl: string) {
  return {
    async checkStatus(): Promise<StatusResult> {
      const res = await fetch(`${baseUrl}/api/recording/status`, { method: 'GET' })
      const json = await res.json()
      if (!json.success || !json.data?.recording) {
        return { recording: false, sessionId: null }
      }
      return {
        recording: true,
        sessionId: json.data.session?.id ?? null,
      }
    },

    async sendMarker(marker: MarkerPayload): Promise<MarkerResult> {
      try {
        const res = await fetch(`${baseUrl}/api/recording/marker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(marker),
        })
        const json = await res.json()
        if (!json.success) {
          return { success: false, error: json.error?.message ?? 'Unknown error' }
        }
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    },
  }
}

export type ExtensionApi = ReturnType<typeof createApi>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Extension/api.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/src/api.ts test/unit/Extension/api.test.ts
git commit -m "feat: [extension] 實作 Extension API 客戶端與測試"
```

---

### Task 3: Background service worker

**Files:**
- Create: `extension/src/background.ts`

- [ ] **Step 1: Implement background service worker**

```typescript
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

function sendMarker(url: string, action: 'navigate' | 'submit' | 'click' | 'request', target?: string): void {
  if (!state.connected) return
  api.sendMarker({ url, action, target })
}

// ── webNavigation listener (page navigations in locked tab) ──

chrome.webNavigation.onCompleted.addListener((details) => {
  if (!state.connected) return
  if (details.tabId !== state.lockedTabId) return
  if (details.frameId !== 0) return // main frame only
  sendMarker(new URL(details.url).pathname, 'navigate')
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
    sendMarker(message.url, message.action, message.target)
    return false
  }

  if (message.type === 'SPA_NAVIGATE') {
    if (!state.connected) return false
    if (sender.tab?.id !== state.lockedTabId) return false
    sendMarker(message.url, 'navigate')
    return false
  }

  return false
})

// ── Init ──

loadState()
```

- [ ] **Step 2: Build and verify no TypeScript errors**

Run: `cd extension && bun run build.ts`
Expected: Build succeeds, `dist/background.js` created

- [ ] **Step 3: Commit**

```bash
git add extension/src/background.ts
git commit -m "feat: [extension] 實作 background service worker — navigation 監聽與狀態管理"
```

---

### Task 4: Content script

**Files:**
- Create: `extension/src/content.ts`

- [ ] **Step 1: Implement content script**

```typescript
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
  // Only report non-GET requests (mutations are more interesting)
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
```

- [ ] **Step 2: Build and verify**

Run: `cd extension && bun run build.ts`
Expected: Build succeeds, `dist/content.js` created

- [ ] **Step 3: Commit**

```bash
git add extension/src/content.ts
git commit -m "feat: [extension] 實作 content script — submit/click/fetch/SPA 事件捕捉"
```

---

### Task 5: Popup UI

**Files:**
- Create: `extension/src/popup.html`
- Create: `extension/src/popup.ts`

- [ ] **Step 1: Create popup HTML**

```html
<!-- extension/src/popup.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 16px;
    }
    h1 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #60a5fa; }
    .field { margin-bottom: 12px; }
    label { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; font-weight: 600; }
    input[type="text"] {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
      color: #e2e8f0;
      font-family: 'SF Mono', 'Fira Code', monospace;
      outline: none;
    }
    input[type="text"]:focus { border-color: #60a5fa; }
    .btn {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-connect { background: #3b82f6; color: white; }
    .btn-connect:hover { background: #2563eb; }
    .btn-disconnect { background: #ef4444; color: white; }
    .btn-disconnect:hover { background: #dc2626; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .status {
      font-size: 11px;
      padding: 8px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .status-connected { background: #166534; color: #86efac; border: 1px solid #22c55e33; }
    .status-disconnected { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
    .status-error { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef444433; }
  </style>
</head>
<body>
  <h1>Archivolt Marker</h1>
  <div id="status" class="status status-disconnected">尚未連線</div>
  <div class="field">
    <label>API 位址</label>
    <input type="text" id="apiUrl" value="http://localhost:3100" />
  </div>
  <button id="actionBtn" class="btn btn-connect">開始側錄</button>
  <script src="dist/popup.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup script**

```typescript
// extension/src/popup.ts
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
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      showError('無法取得當前分頁')
      return
    }

    // Save URL first
    chrome.runtime.sendMessage({ type: 'SET_API_URL', url: apiUrlInput.value.trim() })

    const result = await chrome.runtime.sendMessage({ type: 'CONNECT', tabId: tab.id }) as { success: boolean; error?: string }
    if (!result.success) {
      showError(result.error ?? '連線失敗')
      return
    }

    chrome.runtime.sendMessage({ type: 'GET_STATE' }, updateUI)
  }
})
```

- [ ] **Step 3: Build and verify**

Run: `cd extension && bun run build.ts`
Expected: Build succeeds, all 3 JS files in `dist/`

- [ ] **Step 4: Add .gitignore for extension dist**

```
# extension/.gitignore
dist/
node_modules/
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup.html extension/src/popup.ts extension/.gitignore
git commit -m "feat: [extension] 實作 popup UI — API 設定與連線控制"
```

---

### Task 6: Extension build integration

**Files:**
- Modify: `package.json` (project root)

- [ ] **Step 1: Add extension build script to root package.json**

Add to `scripts` in root `package.json`:
```json
"build:ext": "cd extension && bun run build.ts"
```

- [ ] **Step 2: Install extension dependencies**

Run:
```bash
cd extension && bun init -y && bun add -d @types/chrome
```

- [ ] **Step 3: Build extension and verify output**

Run: `bun run build:ext`
Expected: `extension/dist/` contains `background.js`, `content.js`, `popup.js`

- [ ] **Step 4: Commit**

```bash
git add package.json extension/package.json extension/bun.lock extension/tsconfig.json extension/build.ts
git commit -m "chore: [extension] 整合 extension build 至根專案"
```

---

## Part B: Playback Mode

### Task 7: Playback store logic

**Files:**
- Modify: `web/src/stores/recordingStore.ts`
- Create: `test/unit/Web/PlaybackControls.test.ts`

- [ ] **Step 1: Write the failing test for playback logic**

```typescript
// test/unit/Web/PlaybackControls.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock zustand for testing
function createMockChunks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i}`,
    sessionId: 'sess-1',
    startTime: 1000 + i * 600,
    endTime: 1000 + i * 600 + 200,
    queries: [],
    tables: [`table_${i}`],
    operations: ['SELECT'],
    pattern: 'read' as const,
  }))
}

describe('playback logic', () => {
  describe('computeDelays', () => {
    it('should compute proportional delays between chunks', async () => {
      const { computeDelays } = await import('../../web/src/stores/playbackUtils')
      const chunks = createMockChunks(3)
      // chunks at 1000, 1600, 2200 — gaps of 600ms each
      const delays = computeDelays(chunks, 1)
      expect(delays).toHaveLength(2) // n-1 delays
      expect(delays[0]).toBeCloseTo(600, -1)
      expect(delays[1]).toBeCloseTo(600, -1)
    })

    it('should scale delays by speed multiplier', async () => {
      const { computeDelays } = await import('../../web/src/stores/playbackUtils')
      const chunks = createMockChunks(3)
      const delays = computeDelays(chunks, 2) // 2x speed
      expect(delays[0]).toBeCloseTo(300, -1)
      expect(delays[1]).toBeCloseTo(300, -1)
    })

    it('should cap delays at MAX_DELAY_MS', async () => {
      const { computeDelays, MAX_DELAY_MS } = await import('../../web/src/stores/playbackUtils')
      const chunks = [
        { ...createMockChunks(1)[0], startTime: 1000 },
        { ...createMockChunks(1)[0], id: 'chunk-1', startTime: 100000 }, // huge gap
      ]
      const delays = computeDelays(chunks, 1)
      expect(delays[0]).toBeLessThanOrEqual(MAX_DELAY_MS)
    })

    it('should enforce MIN_DELAY_MS', async () => {
      const { computeDelays, MIN_DELAY_MS } = await import('../../web/src/stores/playbackUtils')
      const chunks = [
        { ...createMockChunks(1)[0], startTime: 1000 },
        { ...createMockChunks(1)[0], id: 'chunk-1', startTime: 1001 }, // 1ms gap
      ]
      const delays = computeDelays(chunks, 1)
      expect(delays[0]).toBeGreaterThanOrEqual(MIN_DELAY_MS)
    })

    it('should return empty array for 0 or 1 chunks', async () => {
      const { computeDelays } = await import('../../web/src/stores/playbackUtils')
      expect(computeDelays([], 1)).toEqual([])
      expect(computeDelays(createMockChunks(1), 1)).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Web/PlaybackControls.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create playback utilities**

```typescript
// web/src/stores/playbackUtils.ts
import type { QueryChunk } from '@/api/recording'

export const MIN_DELAY_MS = 200
export const MAX_DELAY_MS = 3000

export function computeDelays(chunks: readonly QueryChunk[], speed: number): number[] {
  if (chunks.length <= 1) return []
  return chunks.slice(1).map((chunk, i) => {
    const gap = chunk.startTime - chunks[i].startTime
    const scaled = gap / speed
    return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, scaled))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Web/PlaybackControls.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/playbackUtils.ts test/unit/Web/PlaybackControls.test.ts
git commit -m "feat: [web] 實作 playback delay 計算邏輯與測試"
```

---

### Task 8: Add playback state to recordingStore

**Files:**
- Modify: `web/src/stores/recordingStore.ts`

- [ ] **Step 1: Add playback state and actions to the store**

Add the following imports and state to `web/src/stores/recordingStore.ts`:

```typescript
// web/src/stores/recordingStore.ts
import { create } from 'zustand'
import { recordingApi, type RecordingSession, type QueryChunk } from '@/api/recording'
import { computeDelays } from './playbackUtils'

type PlaybackSpeed = 0.5 | 1 | 2 | 4

interface RecordingState {
  // Existing
  sessions: RecordingSession[]
  selectedSessionId: string | null
  chunks: QueryChunk[]
  activeChunkId: string | null
  loading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  selectSession: (sessionId: string | null) => Promise<void>
  setActiveChunk: (chunkId: string | null) => void

  // Playback
  playing: boolean
  playbackSpeed: PlaybackSpeed
  playbackTimerId: ReturnType<typeof setTimeout> | null
  play: () => void
  pause: () => void
  stepNext: () => void
  stepPrev: () => void
  setPlaybackSpeed: (speed: PlaybackSpeed) => void
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  // ── Existing state ──
  sessions: [],
  selectedSessionId: null,
  chunks: [],
  activeChunkId: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    try {
      const sessions = await recordingApi.listSessions()
      set({ sessions })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  selectSession: async (sessionId) => {
    const { pause } = get()
    pause()
    if (!sessionId) {
      set({ selectedSessionId: null, chunks: [], activeChunkId: null })
      return
    }
    set({ selectedSessionId: sessionId, loading: true, error: null })
    try {
      const { chunks } = await recordingApi.getChunks(sessionId)
      set({ chunks, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  setActiveChunk: (chunkId) => set({ activeChunkId: chunkId }),

  // ── Playback state ──
  playing: false,
  playbackSpeed: 1,
  playbackTimerId: null,

  play: () => {
    const { chunks, activeChunkId, playing, playbackSpeed } = get()
    if (playing || chunks.length === 0) return

    // If no active chunk or at the end, start from the beginning
    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const startIndex = currentIndex >= chunks.length - 1 ? 0 : currentIndex

    set({ playing: true, activeChunkId: chunks[startIndex >= 0 ? startIndex : 0].id })

    function scheduleNext(index: number): void {
      const state = get()
      if (!state.playing || index >= state.chunks.length - 1) {
        set({ playing: false, playbackTimerId: null })
        return
      }
      const delays = computeDelays(state.chunks, state.playbackSpeed)
      const timerId = setTimeout(() => {
        const latest = get()
        if (!latest.playing) return
        const nextIndex = index + 1
        set({ activeChunkId: latest.chunks[nextIndex].id })
        scheduleNext(nextIndex)
      }, delays[index])
      set({ playbackTimerId: timerId })
    }

    scheduleNext(startIndex >= 0 ? startIndex : 0)
  },

  pause: () => {
    const { playbackTimerId } = get()
    if (playbackTimerId) clearTimeout(playbackTimerId)
    set({ playing: false, playbackTimerId: null })
  },

  stepNext: () => {
    const { chunks, activeChunkId, pause: pauseFn } = get()
    pauseFn()
    if (chunks.length === 0) return
    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const nextIndex = Math.min(currentIndex + 1, chunks.length - 1)
    set({ activeChunkId: chunks[nextIndex].id })
  },

  stepPrev: () => {
    const { chunks, activeChunkId, pause: pauseFn } = get()
    pauseFn()
    if (chunks.length === 0) return
    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const prevIndex = Math.max(currentIndex - 1, 0)
    set({ activeChunkId: chunks[prevIndex].id })
  },

  setPlaybackSpeed: (speed) => {
    const { playing, pause: pauseFn, play: playFn } = get()
    set({ playbackSpeed: speed })
    // If playing, restart with new speed
    if (playing) {
      pauseFn()
      // Small delay to let state settle
      setTimeout(() => playFn(), 0)
    }
  },
}))

/** Get the tables involved in the active chunk */
export function getActiveChunkTables(state: RecordingState): Set<string> | null {
  const { activeChunkId, chunks } = state
  if (!activeChunkId) return null
  const chunk = chunks.find((c) => c.id === activeChunkId)
  if (!chunk) return null
  return new Set(chunk.tables)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/stores/recordingStore.ts
git commit -m "feat: [web] 擴展 recordingStore — 加入 playback 狀態與 play/pause/step 控制"
```

---

### Task 9: PlaybackControls component

**Files:**
- Create: `web/src/components/Timeline/PlaybackControls.tsx`

- [ ] **Step 1: Create PlaybackControls component**

```tsx
// web/src/components/Timeline/PlaybackControls.tsx
import { useRecordingStore } from '@/stores/recordingStore'

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export function PlaybackControls() {
  const {
    chunks,
    activeChunkId,
    playing,
    playbackSpeed,
    play,
    pause,
    stepPrev,
    stepNext,
    setPlaybackSpeed,
  } = useRecordingStore()

  if (chunks.length === 0) return null

  const currentIndex = activeChunkId
    ? chunks.findIndex((c) => c.id === activeChunkId)
    : -1
  const isAtStart = currentIndex <= 0
  const isAtEnd = currentIndex >= chunks.length - 1

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
      {/* Prev */}
      <button
        onClick={stepPrev}
        disabled={isAtStart && !playing}
        className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"
        title="上一步"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      {/* Play / Pause */}
      <button
        onClick={playing ? pause : play}
        className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors cursor-pointer"
        title={playing ? '暫停' : '播放'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Next */}
      <button
        onClick={stepNext}
        disabled={isAtEnd && !playing}
        className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"
        title="下一步"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M16 6h2v12h-2zm-3.5 6L4 6v12z" transform="scale(-1,1) translate(-24,0)" />
          <path d="M16 6h2v12h-2zM4 18l8.5-6L4 6z" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Position indicator */}
      {activeChunkId && (
        <span className="text-[9px] font-mono text-muted tabular-nums">
          {currentIndex + 1}/{chunks.length}
        </span>
      )}

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
              playbackSpeed === speed
                ? 'bg-primary/20 text-primary'
                : 'text-muted hover:text-text-dim'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Timeline/PlaybackControls.tsx
git commit -m "feat: [web] 建立 PlaybackControls 元件 — play/pause/step/speed UI"
```

---

### Task 10: Integrate PlaybackControls into TimelinePanel

**Files:**
- Modify: `web/src/components/Timeline/TimelinePanel.tsx`

- [ ] **Step 1: Add PlaybackControls to TimelinePanel**

In `web/src/components/Timeline/TimelinePanel.tsx`:

1. Add import at top:
```typescript
import { PlaybackControls } from './PlaybackControls'
```

2. Insert `<PlaybackControls />` between the session selector `</div>` (line 96) and the chunk list `<div>` (line 99):

```tsx
          {/* Playback controls */}
          <PlaybackControls />

          {/* Chunk list */}
```

3. Add auto-scroll to active chunk. Replace the chunk list `<div>` (line 99) with a ref-based scroll:

Add to imports:
```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
```

Add ref inside the component:
```typescript
const chunkListRef = useRef<HTMLDivElement>(null)
```

Add auto-scroll effect after the existing `useEffect`s:
```typescript
  // Auto-scroll to active chunk during playback
  useEffect(() => {
    if (!activeChunkId || !chunkListRef.current) return
    const activeEl = chunkListRef.current.querySelector(`[data-chunk-id="${activeChunkId}"]`)
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeChunkId])
```

Update the chunk list div to use the ref:
```tsx
          <div ref={chunkListRef} className="flex-1 overflow-y-auto p-2 scroll-smooth">
```

Update ChunkCard to include data attribute:
```tsx
                <div key={chunk.id} data-chunk-id={chunk.id}>
                  <ChunkCard
                    chunk={chunk}
                    isActive={activeChunkId === chunk.id}
                    onClick={() =>
                      setActiveChunk(activeChunkId === chunk.id ? null : chunk.id)
                    }
                  />
                </div>
```

- [ ] **Step 2: Here is the complete updated TimelinePanel.tsx**

```tsx
// web/src/components/Timeline/TimelinePanel.tsx
import { useEffect, useRef, useState } from 'react'
import { useRecordingStore } from '@/stores/recordingStore'
import { ChunkCard } from './ChunkCard'
import { PlaybackControls } from './PlaybackControls'

export function TimelinePanel() {
  const {
    sessions,
    selectedSessionId,
    chunks,
    activeChunkId,
    loading,
    fetchSessions,
    selectSession,
    setActiveChunk,
  } = useRecordingStore()

  const [isOpen, setIsOpen] = useState(false)
  const chunkListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (sessions.length > 0 && !isOpen) {
      setIsOpen(true)
    }
  }, [sessions.length])

  // Auto-scroll to active chunk during playback
  useEffect(() => {
    if (!activeChunkId || !chunkListRef.current) return
    const activeEl = chunkListRef.current.querySelector(`[data-chunk-id="${activeChunkId}"]`)
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeChunkId])

  if (sessions.length === 0) return null

  return (
    <div
      className={`fixed top-20 bottom-4 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl flex flex-col z-40 overflow-hidden transition-all duration-300 ${
        isOpen ? 'right-4 w-80' : 'right-4 w-10'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-3 left-3 text-muted hover:text-white transition-colors z-10 cursor-pointer"
        title={isOpen ? '收合時間線' : '展開時間線'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isOpen ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-dim uppercase tracking-wider ml-6">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Timeline
            </div>

            {/* Session selector */}
            <select
              value={selectedSessionId ?? ''}
              onChange={(e) => selectSession(e.target.value || null)}
              className="mt-2 w-full bg-surface/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">選擇 Session...</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 20)} — {s.stats.totalQueries} queries
                </option>
              ))}
            </select>
          </div>

          {/* Playback controls */}
          <PlaybackControls />

          {/* Chunk list */}
          <div ref={chunkListRef} className="flex-1 overflow-y-auto p-2 scroll-smooth">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && selectedSessionId && chunks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 opacity-30">
                <p className="text-[11px] mt-2">無 chunk 資料</p>
              </div>
            )}

            {!loading &&
              chunks.map((chunk) => (
                <div key={chunk.id} data-chunk-id={chunk.id}>
                  <ChunkCard
                    chunk={chunk}
                    isActive={activeChunkId === chunk.id}
                    onClick={() =>
                      setActiveChunk(activeChunkId === chunk.id ? null : chunk.id)
                    }
                  />
                </div>
              ))}
          </div>

          {/* Stats footer */}
          {selectedSessionId && chunks.length > 0 && (
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-muted font-mono flex justify-between">
              <span>{chunks.length} chunks</span>
              <span>
                {chunks.reduce((sum, c) => sum + c.queries.length, 0)} queries
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Timeline/TimelinePanel.tsx
git commit -m "feat: [web] 整合 PlaybackControls 至 TimelinePanel 並加入 auto-scroll"
```

---

### Task 11: Cleanup playback timer on unmount

**Files:**
- Modify: `web/src/components/Timeline/TimelinePanel.tsx`

- [ ] **Step 1: Add cleanup effect**

Add this effect inside `TimelinePanel`, after the auto-scroll effect:

```typescript
  // Cleanup playback timer on unmount
  const pause = useRecordingStore((s) => s.pause)
  useEffect(() => {
    return () => pause()
  }, [pause])
```

- [ ] **Step 2: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Timeline/TimelinePanel.tsx
git commit -m "fix: [web] 確保 TimelinePanel 卸載時清除 playback timer"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Run all existing tests**

Run: `bun run test`
Expected: All existing tests pass, no regressions

- [ ] **Step 2: Run the new tests**

Run: `bunx vitest run test/unit/Extension/ test/unit/Web/`
Expected: All new tests pass

- [ ] **Step 3: Build extension**

Run: `bun run build:ext`
Expected: `extension/dist/` has 3 JS files

- [ ] **Step 4: Build frontend**

Run: `cd web && bun run build`
Expected: No build errors

- [ ] **Step 5: Manual smoke test instructions**

1. **Chrome Extension:**
   - 開啟 Chrome → `chrome://extensions` → 開啟開發者模式
   - 載入未封裝擴充功能 → 選擇 `extension/` 目錄
   - 啟動 Archivolt: `bun run dev:all`
   - 點擊擴充 popup → 輸入 API 位址 → 開始側錄
   - 瀏覽目標網站 → 點擊/送出表單 → 檢查 TimelinePanel 是否出現對應 marker chunks

2. **Playback:**
   - 選擇有 chunks 的 session
   - 點播放按鈕 → 觀察 chunks 自動切換、ER 圖高亮跟著變化
   - 測試速度切換（0.5x, 1x, 2x, 4x）
   - 測試 prev/next 步進
   - 測試播放到最後自動停止

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: [extension+web] 完成 Query Chunking 第二階段 — Chrome 擴充 + 回放模式"
```
