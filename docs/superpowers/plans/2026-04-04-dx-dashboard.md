# DX Dashboard 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Archivolt 加入 Home Dashboard（系統狀態、工作流程引導、Session 管理、Wizard Drawer、分析報告檢視器），提升整體開發體驗。

**Architecture:** 前端用 react-router-dom 新增 `/`（Dashboard）、`/canvas`（現有畫布）、`/report/:sessionId`（報告檢視器）三條路由；後端新增 `/api/status`（快照）、`/api/recording/live`（SSE 即時推送）、`/api/report/:sessionId/:type`（JSON 報告）等 endpoint；RecordingService 擴充支援 HTTP Proxy，並暴露即時統計給 SSE 使用。

**Tech Stack:** React 19 + react-router-dom v6 + react-markdown + Zustand 5 + Bun SSE + Tailwind CSS 4 + Vitest + Playwright

---

## 檔案地圖

### 後端（新增 / 修改）

| 動作 | 路徑 | 說明 |
|------|------|------|
| 修改 | `src/Modules/Recording/Application/Services/RecordingService.ts` | 加 HTTP proxy 支援、`getLiveStats()` 公開方法 |
| 修改 | `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` | `start()` 接受 httpProxy 參數，`list()` 加 httpChunkCount / hasManifest / hasOptimizationReport |
| 新增 | `src/Modules/Recording/Presentation/Controllers/StatusController.ts` | `GET /api/status` 快照 |
| 修改 | `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` | 加 `/recording/live` SSE 和 `/report/:id/:type` |
| 修改 | `src/wiring/recording.ts` | 注入 StatusController，掛 SSE 路由 |
| 新增 | `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.ts` | OptimizationReportData → JSON 檔案 |
| 修改 | `src/CLI/AnalyzeCommand.ts` | analyze 後同時寫 `.json` 報告 |

### 前端（新增 / 修改）

| 動作 | 路徑 | 說明 |
|------|------|------|
| 修改 | `web/package.json` | 加 react-router-dom、react-markdown |
| 修改 | `web/src/main.tsx` | 加 BrowserRouter + Routes |
| 修改 | `web/src/App.tsx` → 重新命名為 `web/src/pages/CanvasPage.tsx` | 現有畫布頁 |
| 新增 | `web/src/pages/Dashboard.tsx` | Dashboard 主頁 |
| 新增 | `web/src/pages/ReportViewer.tsx` | 分析報告檢視器 |
| 新增 | `web/src/components/Dashboard/StatusSection.tsx` | DB + HTTP Proxy 狀態卡 |
| 新增 | `web/src/components/Dashboard/WorkflowSection.tsx` | 5 階段進度卡 |
| 新增 | `web/src/components/Dashboard/SessionList.tsx` | Session 列表與操作 |
| 新增 | `web/src/components/Wizard/WizardDrawer.tsx` | 5 步驟 Wizard |
| 新增 | `web/src/components/Report/FindingCard.tsx` | 可展開的 finding 卡片 |
| 新增 | `web/src/stores/dashboardStore.ts` | SSE 連線 + proxy 狀態 + sessions |
| 新增 | `web/src/api/dashboard.ts` | status / sessions / report API client |
| 修改 | `src/index.ts` | CLI 啟動後自動開瀏覽器 |

---

## Task 1：安裝前端套件 + 設置 React Router

**Files:**
- Modify: `web/package.json`
- Modify: `web/src/main.tsx`
- Create: `web/src/pages/CanvasPage.tsx`
- Create: `web/src/pages/Dashboard.tsx` (stub)
- Create: `web/src/pages/ReportViewer.tsx` (stub)

- [ ] **Step 1: 安裝套件**

```bash
cd /Users/carl/Dev/CMG/Archivolt/web
bun add react-router-dom react-markdown
bun add -d @types/react-router-dom
```

預期輸出：`bun add` 成功，`package.json` 出現 `react-router-dom` 和 `react-markdown`。

- [ ] **Step 2: 將現有 App.tsx 複製為 CanvasPage.tsx**

```bash
cp web/src/App.tsx web/src/pages/CanvasPage.tsx
```

- [ ] **Step 3: 修改 CanvasPage.tsx 的 export**

修改 `web/src/pages/CanvasPage.tsx` 第一行（原本是 `export default function App()`）：

```typescript
// 將 export default function App() { 改為：
export default function CanvasPage() {
```

- [ ] **Step 4: 建立 Dashboard.tsx stub**

新增 `web/src/pages/Dashboard.tsx`：

```typescript
export default function Dashboard() {
  return (
    <div className="flex h-screen bg-surface text-text font-sans items-center justify-center">
      <p className="text-muted">Dashboard — 即將完成</p>
    </div>
  )
}
```

- [ ] **Step 5: 建立 ReportViewer.tsx stub**

新增 `web/src/pages/ReportViewer.tsx`：

```typescript
import { useParams } from 'react-router-dom'

export default function ReportViewer() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return (
    <div className="flex h-screen bg-surface text-text font-sans items-center justify-center">
      <p className="text-muted">Report: {sessionId} — 即將完成</p>
    </div>
  )
}
```

- [ ] **Step 6: 修改 main.tsx 加入路由**

現有 `web/src/main.tsx` 讀取後，改為：

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/report/:sessionId" element={<ReportViewer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 7: 確認 dev server 啟動無錯誤**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bun run dev:all
```

預期：前端 http://localhost:5173 開啟，瀏覽 `/` 顯示「Dashboard — 即將完成」，`/canvas` 顯示現有 ER Canvas。

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/ web/src/main.tsx web/package.json web/bun.lock
git commit -m "feat: [dx] 安裝 react-router-dom + 建立路由骨架"
```

---

## Task 2：後端 GET /api/status

**Files:**
- Create: `src/Modules/Recording/Presentation/Controllers/StatusController.ts`
- Modify: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`
- Modify: `src/wiring/recording.ts`
- Create: `src/Modules/Recording/Presentation/Controllers/StatusController.test.ts`

- [ ] **Step 1: 先寫測試（TDD）**

新增 `src/Modules/Recording/Presentation/Controllers/StatusController.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { StatusController } from './StatusController'

function makeCtx(overrides: Partial<{ json: any }> = {}) {
  return {
    json: vi.fn((data: unknown) => new Response(JSON.stringify(data))),
    ...overrides,
  } as any
}

function makeService(overrides: Partial<{ isRecording: boolean; proxyPort: number | null }> = {}) {
  return {
    isRecording: false,
    proxyPort: null,
    getHttpProxyStatus: vi.fn(() => ({ running: false, port: null, target: null })),
    ...overrides,
  } as any
}

function makeRepo() {
  return {
    exists: vi.fn(async () => true),
  } as any
}

describe('StatusController', () => {
  it('回傳完整系統快照，proxy 未運行', async () => {
    const ctrl = new StatusController(makeService(), makeRepo())
    const ctx = makeCtx()
    await ctrl.getStatus(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.success).toBe(true)
    expect(call.data.proxy.db.running).toBe(false)
    expect(call.data.proxy.http.running).toBe(false)
    expect(call.data.schema.loaded).toBe(true)
  })

  it('proxy DB 運行中時回傳 port', async () => {
    const ctrl = new StatusController(
      makeService({ isRecording: true, proxyPort: 13306 }),
      makeRepo(),
    )
    const ctx = makeCtx()
    await ctrl.getStatus(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.data.proxy.db.running).toBe(true)
    expect(call.data.proxy.db.port).toBe(13306)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bun run test src/Modules/Recording/Presentation/Controllers/StatusController.test.ts
```

預期：FAIL — `StatusController` 不存在。

- [ ] **Step 3: 實作 StatusController**

新增 `src/Modules/Recording/Presentation/Controllers/StatusController.ts`：

```typescript
import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

export class StatusController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
  ) {}

  async getStatus(ctx: IHttpContext): Promise<Response> {
    const dbRunning = this.service.isRecording
    const httpStatus = this.service.getHttpProxyStatus()
    const schemaLoaded = await this.repo.exists()

    return ctx.json(
      ApiResponse.success({
        proxy: {
          db: {
            running: dbRunning,
            port: dbRunning ? this.service.proxyPort : null,
            protocol: this.service.status()?.proxy?.protocol ?? null,
            sessionId: this.service.status()?.id ?? null,
          },
          http: {
            running: httpStatus.running,
            port: httpStatus.port,
            target: httpStatus.target,
          },
        },
        server: {
          version: '0.3.0',
          uptimeSeconds: Math.floor(process.uptime()),
        },
        schema: {
          loaded: schemaLoaded,
          tableCount: schemaLoaded ? await this.repo.getTableCount() : 0,
          hasGroups: schemaLoaded ? await this.repo.hasGroups() : false,
        },
      }),
    )
  }
}
```

> 注意：`repo.exists()`、`repo.getTableCount()`、`repo.hasGroups()` 和 `service.getHttpProxyStatus()` 需在 Task 3 / Task 4 中補實作。

- [ ] **Step 4: RecordingRepository 新增輔助方法**

在 `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` 補充：

```typescript
// 加在 listSessions() 之後：

async exists(): Promise<boolean> {
  return existsSync(this.baseDir)
}

async getTableCount(): Promise<number> {
  // 讀取 archivolt.json（不在 recording repo 職責內，回傳 0 即可）
  return 0
}

async hasGroups(): Promise<boolean> {
  return false
}
```

> 這三個方法在此先回傳保守預設值；Dashboard 的 schema 資訊由前端直接讀現有 `/api/schema` endpoint 判斷，這裡只做 placeholder。

- [ ] **Step 5: RecordingService 新增 getHttpProxyStatus()**

在 `src/Modules/Recording/Application/Services/RecordingService.ts`，在 `get proxyPort()` 之後新增：

```typescript
getHttpProxyStatus(): { running: boolean; port: number | null; target: string | null } {
  return {
    running: false,
    port: null,
    target: null,
  }
}
```

（Task 4 會替換為真正的 HTTP proxy 狀態）

- [ ] **Step 6: 掛路由**

在 `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` 新增 import 和路由：

```typescript
import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'
import type { StatusController } from '../Controllers/StatusController'

export function registerRecordingRoutes(
  router: IModuleRouter,
  controller: RecordingController,
  statusController: StatusController,
): void {
  router.group('/api', (r) => {
    r.get('/status', (ctx) => statusController.getStatus(ctx))          // 新增
    r.post('/recording/start', (ctx) => controller.start(ctx))
    r.post('/recording/stop', (ctx) => controller.stop(ctx))
    r.get('/recording/status', (ctx) => controller.status(ctx))
    r.get('/recordings', (ctx) => controller.list(ctx))
    r.get('/recordings/:id', (ctx) => controller.getSession(ctx))
    r.post('/recording/marker', (ctx) => controller.addMarker(ctx))
    r.get('/recordings/:id/markers', (ctx) => controller.getMarkers(ctx))
    r.get('/recordings/:id/chunks', (ctx) => controller.getChunks(ctx))
    r.get('/recordings/:id/chunks/:chunkId/queries', (ctx) => controller.getChunkQueries(ctx))
    r.get('/recordings/:id/manifest', (ctx) => controller.getManifest(ctx))
  })
}
```

- [ ] **Step 7: wiring/recording.ts 注入 StatusController**

```typescript
import type { PlanetCore } from '@gravito/core'
import { createGravitoModuleRouter } from '@/Shared/Infrastructure/Framework/GravitoModuleRouter'
import { RecordingController } from '@/Modules/Recording/Presentation/Controllers/RecordingController'
import { StatusController } from '@/Modules/Recording/Presentation/Controllers/StatusController'
import { registerRecordingRoutes } from '@/Modules/Recording/Presentation/Routes/Recording.routes'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'

export const registerRecording = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const service = core.container.make('recordingService') as RecordingService
  const repo = core.container.make('recordingRepository') as RecordingRepository
  const analyzer = new ChunkAnalyzerService()
  const controller = new RecordingController(service, repo, analyzer)
  const statusController = new StatusController(service, repo)
  registerRecordingRoutes(router, controller, statusController)
}
```

- [ ] **Step 8: 跑測試確認通過**

```bash
bun run test src/Modules/Recording/Presentation/Controllers/StatusController.test.ts
```

預期：PASS

- [ ] **Step 9: 手動驗證 endpoint**

```bash
bun run dev:all
# 另一個 terminal：
curl http://localhost:3100/api/status | jq
```

預期：回傳 `{ success: true, data: { proxy: { db: { running: false, ... }, http: { running: false, ... } }, server: { ... }, schema: { ... } } }`

- [ ] **Step 10: Commit**

```bash
git add src/Modules/Recording/Presentation/Controllers/StatusController.ts \
        src/Modules/Recording/Presentation/Controllers/StatusController.test.ts \
        src/Modules/Recording/Presentation/Routes/Recording.routes.ts \
        src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts \
        src/Modules/Recording/Application/Services/RecordingService.ts \
        src/wiring/recording.ts
git commit -m "feat: [dx] 新增 GET /api/status 快照 endpoint"
```

---

## Task 3：後端 SSE /api/recording/live

**Files:**
- Modify: `src/Modules/Recording/Application/Services/RecordingService.ts`
- Modify: `src/wiring/recording.ts`
- Create: `src/Modules/Recording/Application/Services/RecordingService.live.test.ts`

- [ ] **Step 1: 先寫 getLiveStats 測試**

新增 `src/Modules/Recording/Application/Services/RecordingService.live.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { RecordingService } from './RecordingService'

function makeRepo() {
  return {
    openStreams: () => {},
    closeStreams: async () => {},
    saveSession: async () => {},
    appendQueries: () => {},
    appendMarkers: () => {},
    appendHttpChunks: () => {},
    listSessions: async () => [],
  } as any
}

function makeParser() {
  return {} as any
}

describe('RecordingService.getLiveStats', () => {
  it('未錄製時回傳 null', () => {
    const service = new RecordingService(makeRepo(), makeParser())
    expect(service.getLiveStats()).toBeNull()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test src/Modules/Recording/Application/Services/RecordingService.live.test.ts
```

預期：FAIL — `getLiveStats` 不存在。

- [ ] **Step 3: RecordingService 新增 getLiveStats()**

在 `src/Modules/Recording/Application/Services/RecordingService.ts` 的 `getHttpProxyStatus()` 之後新增：

```typescript
getLiveStats(): {
  sessionId: string
  elapsedSeconds: number
  db: { qps: number; totalQueries: number }
  http: { chunksPerSecond: number; totalChunks: number } | null
} | null {
  if (!this.currentSession || !this.isRecording) return null

  const elapsedSeconds = Math.floor((Date.now() - this.currentSession.startedAt) / 1000)

  return {
    sessionId: this.currentSession.id,
    elapsedSeconds,
    db: {
      qps: elapsedSeconds > 0 ? Math.round(this.stats.totalQueries / elapsedSeconds) : 0,
      totalQueries: this.stats.totalQueries,
    },
    http: null, // Task 4 補充 HTTP proxy 統計
  }
}
```

- [ ] **Step 4: 確認測試通過**

```bash
bun run test src/Modules/Recording/Application/Services/RecordingService.live.test.ts
```

預期：PASS

- [ ] **Step 5: 修改 registerRecordingRoutes 簽名，加入 SSE 路由**

修改 `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`，在函式簽名加入 `service` 參數，並在路由群組內加入 SSE 路由：

```typescript
import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'
import type { StatusController } from '../Controllers/StatusController'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'

export function registerRecordingRoutes(
  router: IModuleRouter,
  controller: RecordingController,
  statusController: StatusController,
  service: RecordingService,
): void {
  router.group('/api', (r) => {
    r.get('/status', (ctx) => statusController.getStatus(ctx))
    r.post('/recording/start', (ctx) => controller.start(ctx))
    r.post('/recording/stop', (ctx) => controller.stop(ctx))
    r.get('/recording/status', (ctx) => controller.status(ctx))
    r.get('/recordings', (ctx) => controller.list(ctx))
    r.get('/recordings/:id', (ctx) => controller.getSession(ctx))
    r.post('/recording/marker', (ctx) => controller.addMarker(ctx))
    r.get('/recordings/:id/markers', (ctx) => controller.getMarkers(ctx))
    r.get('/recordings/:id/chunks', (ctx) => controller.getChunks(ctx))
    r.get('/recordings/:id/chunks/:chunkId/queries', (ctx) => controller.getChunkQueries(ctx))
    r.get('/recordings/:id/manifest', (ctx) => controller.getManifest(ctx))
    r.get('/report/:id/:type', async (ctx) => controller.getReport(ctx))

    // SSE — 直接回傳 raw Response（繞過 IHttpContext）
    r.get('/recording/live', (_ctx: any) => {
      let timer: ReturnType<typeof setInterval> | null = null
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            )
          }
          timer = setInterval(() => {
            const stats = service.getLiveStats()
            if (stats) send('stats', stats)
            else send('idle', { recording: false })
          }, 1000)
        },
        cancel() {
          if (timer) clearInterval(timer)
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    })
  })
}
```

同步更新 `src/wiring/recording.ts` 傳入 `service`：

```typescript
registerRecordingRoutes(router, controller, statusController, service)
```
```

- [ ] **Step 6: 手動驗證 SSE**

```bash
bun run dev:all
# 另一個 terminal：
curl -N http://localhost:3100/api/recording/live
```

預期：持續收到 `event: idle\ndata: {"recording":false}\n\n`（每秒一次）。

- [ ] **Step 7: Commit**

```bash
git add src/Modules/Recording/Application/Services/RecordingService.ts \
        src/Modules/Recording/Application/Services/RecordingService.live.test.ts \
        src/wiring/recording.ts
git commit -m "feat: [dx] 新增 SSE /api/recording/live 即時推送"
```

---

## Task 4：擴充 sessions list + start 支援 HTTP Proxy

**Files:**
- Modify: `src/Modules/Recording/Application/Services/RecordingService.ts`
- Modify: `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`
- Create: `src/Modules/Recording/Presentation/Controllers/RecordingController.start.test.ts`

- [ ] **Step 1: 先寫 list 測試**

新增 `src/Modules/Recording/Presentation/Controllers/RecordingController.start.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { RecordingController } from './RecordingController'

function makeCtx(body: unknown = {}) {
  return {
    getBody: async () => body,
    getParam: vi.fn(),
    getQuery: vi.fn(),
    json: vi.fn((data: unknown) => new Response(JSON.stringify(data))),
  } as any
}

function makeService() {
  return {
    isRecording: false,
    proxyPort: null,
    start: vi.fn(async () => ({ id: 'sess-1', status: 'recording', startedAt: Date.now(), proxy: {}, stats: {} })),
    stop: vi.fn(),
    status: vi.fn(() => null),
    addMarker: vi.fn(),
    getHttpProxyStatus: vi.fn(() => ({ running: false, port: null, target: null })),
    getLiveStats: vi.fn(() => null),
  } as any
}

function makeRepo() {
  return {
    listSessions: vi.fn(async () => [
      { id: 'sess-1', startedAt: Date.now(), status: 'stopped', stats: { totalQueries: 42 } },
    ]),
    loadSession: vi.fn(),
    loadQueries: vi.fn(async () => []),
    loadMarkers: vi.fn(async () => []),
  } as any
}

describe('RecordingController.list', () => {
  it('sessions 列表包含 httpChunkCount 和 hasManifest', async () => {
    const ctrl = new RecordingController(makeService(), makeRepo(), {} as any)
    const ctx = makeCtx()
    await ctrl.list(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.success).toBe(true)
    expect(call.data[0]).toHaveProperty('httpChunkCount')
    expect(call.data[0]).toHaveProperty('hasManifest')
    expect(call.data[0]).toHaveProperty('hasOptimizationReport')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test src/Modules/Recording/Presentation/Controllers/RecordingController.start.test.ts
```

預期：FAIL — `list()` 回傳值缺少 `httpChunkCount` 等欄位。

- [ ] **Step 3: 修改 RecordingController.list()**

在 `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` 修改 `list()` 方法：

```typescript
async list(ctx: IHttpContext): Promise<Response> {
  const sessions = await this.repo.listSessions()
  const analysisBaseDir = path.join(process.cwd(), 'data', 'analysis')

  const enriched = await Promise.all(
    sessions.map(async (session) => {
      const sessionAnalysisDir = path.join(analysisBaseDir, session.id)
      const hasManifest = existsSync(path.join(sessionAnalysisDir, 'manifest.md'))
      const hasOptimizationReport = existsSync(path.join(sessionAnalysisDir, 'optimization-report.md'))
      const httpChunks = await this.repo.loadHttpChunks(session.id)
      return {
        ...session,
        httpChunkCount: httpChunks.length,
        hasManifest,
        hasOptimizationReport,
      }
    }),
  )

  return ctx.json(ApiResponse.success(enriched))
}
```

在檔案頂部新增 import：

```typescript
import path from 'node:path'
import { existsSync } from 'node:fs'
```

同時確認 `RecordingRepository` 已有 `loadHttpChunks()` 方法（已存在於 Task 2 的探索中）。

- [ ] **Step 4: 修改 RecordingController.start() 支援 httpProxy**

```typescript
async start(ctx: IHttpContext): Promise<Response> {
  const body = await ctx.getBody<{
    targetHost: string
    targetPort: number
    listenPort?: number
    httpProxy?: {
      enabled: boolean
      port: number
      target: string
    }
  }>()

  try {
    const session = await this.service.start({
      listenPort: body.listenPort ?? 13306,
      targetHost: body.targetHost,
      targetPort: body.targetPort,
    })

    if (body.httpProxy?.enabled) {
      await this.service.startHttpProxy({
        port: body.httpProxy.port ?? 18080,
        target: body.httpProxy.target,
        sessionId: session.id,
      })
    }

    return ctx.json(
      ApiResponse.success({
        ...session,
        proxyPort: this.service.proxyPort,
        httpProxy: this.service.getHttpProxyStatus(),
      }),
      201,
    )
  } catch (error: any) {
    return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
  }
}
```

- [ ] **Step 5: RecordingService 新增 HTTP proxy 欄位與方法**

在 `src/Modules/Recording/Application/Services/RecordingService.ts` 修改 class：

```typescript
import { HttpProxyService } from '@/Modules/Recording/Infrastructure/Proxy/HttpProxy'

// 在 class body 加入欄位：
private httpProxy: HttpProxyService | null = null
private _httpChunkCount = 0

// 替換 getHttpProxyStatus() 為：
getHttpProxyStatus(): { running: boolean; port: number | null; target: string | null } {
  if (!this.httpProxy) return { running: false, port: null, target: null }
  return {
    running: true,
    port: this.httpProxy.port,
    target: null, // HttpProxyService 不暴露 target，先用 null
  }
}

// 新增 startHttpProxy()：
async startHttpProxy(config: { port: number; target: string; sessionId: string }): Promise<void> {
  this.httpProxy = new HttpProxyService({
    listenPort: config.port,
    targetUrl: config.target,
    sessionId: config.sessionId,
    onChunk: (chunks) => {
      this._httpChunkCount += chunks.length
      this.repo.appendHttpChunks(config.sessionId, chunks)
    },
  })
  await this.httpProxy.start()
}

// 修改 getLiveStats() 的 http 部分：
// 將 http: null 改為：
http: this.httpProxy
  ? {
      chunksPerSecond: elapsedSeconds > 0 ? Math.round(this._httpChunkCount / elapsedSeconds) : 0,
      totalChunks: this._httpChunkCount,
    }
  : null,
```

也在 `stop()` 方法中加入 HTTP proxy 清理邏輯（在現有 `this.proxy = null` 之後）：

```typescript
// HttpProxyService 沒有公開 stop()，停止錄製時讓 GC 回收 server
// 並重設狀態
this.httpProxy = null
this._httpChunkCount = 0
```

> `HttpProxyService` 底層是 `Bun.serve()`，不接受新連線後 Bun 的 HTTP server 會在請求耗盡後自動關閉。若未來需要主動停止，可在 `HttpProxy.ts` 加 `stop() { this.server?.stop() }` 方法。

- [ ] **Step 6: 確認測試通過**

```bash
bun run test src/Modules/Recording/Presentation/Controllers/RecordingController.start.test.ts
```

預期：PASS

- [ ] **Step 7: Commit**

```bash
git add src/Modules/Recording/Application/Services/RecordingService.ts \
        src/Modules/Recording/Presentation/Controllers/RecordingController.ts \
        src/Modules/Recording/Presentation/Controllers/RecordingController.start.test.ts
git commit -m "feat: [dx] sessions list 加入 httpChunkCount/hasManifest，start 支援 HTTP proxy"
```

---

## Task 5：後端報告 JSON Renderer + GET /api/report

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.ts`
- Modify: `src/CLI/AnalyzeCommand.ts`
- Modify: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`
- Create: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.test.ts`

- [ ] **Step 1: 先寫 JSON renderer 測試**

新增 `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { renderOptimizationReportJson } from './OptimizationReportJsonRenderer'
import type { OptimizationReportData } from './OptimizationReportRenderer'

const sampleData: OptimizationReportData = {
  sessionId: 'test-123',
  generatedAt: '2026-04-04T00:00:00.000Z',
  enabledLayers: ['pattern'],
  readWriteReport: {
    tables: [{ table: 'orders', reads: 10, writes: 2, readRatio: 0.83 }],
    suggestions: [],
  },
  n1Findings: [],
  fragmentationFindings: [],
}

describe('renderOptimizationReportJson', () => {
  it('產出合法 JSON 字串', () => {
    const result = renderOptimizationReportJson(sampleData)
    const parsed = JSON.parse(result)
    expect(parsed.sessionId).toBe('test-123')
    expect(parsed.readWriteReport.tables).toHaveLength(1)
    expect(parsed.n1Findings).toEqual([])
  })

  it('包含所有 OptimizationReportData 欄位', () => {
    const result = renderOptimizationReportJson(sampleData)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty('enabledLayers')
    expect(parsed).toHaveProperty('readWriteReport')
    expect(parsed).toHaveProperty('n1Findings')
    expect(parsed).toHaveProperty('fragmentationFindings')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.test.ts
```

預期：FAIL

- [ ] **Step 3: 實作 OptimizationReportJsonRenderer**

新增 `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.ts`：

```typescript
import type { OptimizationReportData } from './OptimizationReportRenderer'

export function renderOptimizationReportJson(data: OptimizationReportData): string {
  return JSON.stringify(data, null, 2)
}
```

- [ ] **Step 4: 確認測試通過**

```bash
bun run test src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.test.ts
```

預期：PASS

- [ ] **Step 5: 修改 AnalyzeCommand 同時寫 JSON**

在 `src/CLI/AnalyzeCommand.ts` 第 14 行 import 區加入：

```typescript
import { renderOptimizationReportJson } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer'
```

在第 176 行（`await writeFile(outPath, md, 'utf-8')`）之後、`console.log(...)` 之前加入：

```typescript
const jsonOutPath = outPath.replace('.md', '.json')
await writeFile(jsonOutPath, renderOptimizationReportJson(reportData), 'utf-8')
```

完整修改後的第 173-178 行：

```typescript
const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/optimization-report.md`)
const dir = path.dirname(outPath)
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
await writeFile(outPath, md, 'utf-8')
const jsonOutPath = outPath.replace('.md', '.json')
await writeFile(jsonOutPath, renderOptimizationReportJson(reportData), 'utf-8')
console.log(`Optimization report written to: ${outPath}`)
```

- [ ] **Step 6: 在 RecordingController 加入 getReport() 方法**

`/api/report/:id/:type` 路由已在 Task 3 的 `Recording.routes.ts` 中宣告（`r.get('/report/:id/:type', async (ctx) => controller.getReport(ctx))`）。現在補實作：

在 `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` 的最後一個方法後新增：

```typescript
async getReport(ctx: IHttpContext): Promise<Response> {
  const id = ctx.getParam('id')!
  const type = ctx.getParam('type') as 'manifest' | 'optimize'

  const analysisDir = path.join(process.cwd(), 'data', 'analysis', id)
  const filename = type === 'optimize' ? 'optimization-report.json' : 'manifest.json'
  const filePath = path.join(analysisDir, filename)

  if (!existsSync(filePath)) {
    return ctx.json(ApiResponse.error('NOT_FOUND', `Report not found for session ${id}`), 404)
  }

  const { readFile } = await import('node:fs/promises')
  const content = await readFile(filePath, 'utf-8')
  return ctx.json(ApiResponse.success(JSON.parse(content)))
}
```

（`path` 和 `existsSync` 的 import 已在 Task 4 新增至 RecordingController 頂部）

- [ ] **Step 7: 手動驗證（跑一次 analyze 產生 JSON 再確認 API）**

```bash
# 先跑 analyze（假設有 session-xxx）
bun run src/index.ts analyze session-xxx --format optimize-md
# 應該多一個 optimization-report.json

curl http://localhost:3100/api/report/session-xxx/optimize | jq '.data.sessionId'
```

預期：回傳 session ID。

- [ ] **Step 8: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.ts \
        src/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer.test.ts \
        src/CLI/AnalyzeCommand.ts \
        src/Modules/Recording/Presentation/Routes/Recording.routes.ts
git commit -m "feat: [dx] optimize-md 同時輸出 JSON + GET /api/report/:id/:type"
```

---

## Task 6：前端 dashboardStore + API client

**Files:**
- Create: `web/src/api/dashboard.ts`
- Create: `web/src/stores/dashboardStore.ts`

- [ ] **Step 1: 建立 dashboard API client**

新增 `web/src/api/dashboard.ts`：

```typescript
const BASE = ''

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()
  return json.data as T
}

export interface DbProxyStatus {
  running: boolean
  port: number | null
  protocol: 'mysql' | 'postgres' | null
  sessionId: string | null
}

export interface HttpProxyStatus {
  running: boolean
  port: number | null
  target: string | null
}

export interface SystemStatus {
  proxy: {
    db: DbProxyStatus
    http: HttpProxyStatus
  }
  server: { version: string; uptimeSeconds: number }
  schema: { loaded: boolean; tableCount: number; hasGroups: boolean }
}

export interface SessionSummary {
  id: string
  startedAt: number
  stoppedAt?: number
  status: 'recording' | 'stopped'
  stats: { totalQueries: number; byOperation: Record<string, number> }
  httpChunkCount: number
  hasManifest: boolean
  hasOptimizationReport: boolean
}

export interface LiveStats {
  sessionId: string
  elapsedSeconds: number
  db: { qps: number; totalQueries: number }
  http: { chunksPerSecond: number; totalChunks: number } | null
}

export interface OptimizationReportJson {
  sessionId: string
  generatedAt: string
  enabledLayers: string[]
  readWriteReport: {
    tables: { table: string; reads: number; writes: number; readRatio: number }[]
    suggestions: { table: string; type: string; reason: string; sql: string }[]
  }
  n1Findings: { apiPath: string; sql: string; count: number; batchSql?: string }[]
  fragmentationFindings: { sql: string; count: number }[]
  indexGapFindings?: { table: string; column: string; createIndexSql: string }[]
  fullScanFindings?: { sql: string; table: string; createIndexSql: string }[]
}

export const dashboardApi = {
  getStatus: () => request<SystemStatus>('/api/status'),
  getSessions: () => request<SessionSummary[]>('/api/recordings'),
  getReport: (sessionId: string, type: 'manifest' | 'optimize') =>
    request<OptimizationReportJson>(`/api/report/${sessionId}/${type}`),
  startRecording: (body: {
    targetHost: string
    targetPort: number
    listenPort?: number
    httpProxy?: { enabled: boolean; port: number; target: string }
  }) =>
    fetch('/api/recording/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
}
```

- [ ] **Step 2: 建立 dashboardStore**

新增 `web/src/stores/dashboardStore.ts`：

```typescript
import { create } from 'zustand'
import { dashboardApi, type SystemStatus, type SessionSummary, type LiveStats } from '@/api/dashboard'

interface DashboardStore {
  status: SystemStatus | null
  sessions: SessionSummary[]
  liveStats: LiveStats | null
  wizardOpen: boolean
  wizardStep: number
  loading: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  fetchSessions: () => Promise<void>
  openWizard: () => void
  closeWizard: () => void
  setWizardStep: (step: number) => void
  connectSSE: () => () => void  // 回傳 cleanup fn
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  status: null,
  sessions: [],
  liveStats: null,
  wizardOpen: false,
  wizardStep: (() => {
    const saved = localStorage.getItem('archivolt_wizard_step')
    return saved ? parseInt(saved, 10) : 1
  })(),
  loading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const status = await dashboardApi.getStatus()
      set({ status })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  fetchSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await dashboardApi.getSessions()
      set({ sessions, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  openWizard: () => set({ wizardOpen: true }),
  closeWizard: () => set({ wizardOpen: false }),

  setWizardStep: (step) => {
    localStorage.setItem('archivolt_wizard_step', String(step))
    set({ wizardStep: step })
  },

  connectSSE: () => {
    const es = new EventSource('/api/recording/live')
    es.addEventListener('stats', (e) => {
      set({ liveStats: JSON.parse(e.data) })
    })
    es.addEventListener('idle', () => {
      set({ liveStats: null })
    })
    return () => es.close()
  },
}))
```

- [ ] **Step 3: Commit**

```bash
git add web/src/api/dashboard.ts web/src/stores/dashboardStore.ts
git commit -m "feat: [dx] 新增 dashboardStore + dashboard API client"
```

---

## Task 7：Dashboard 頁 — 狀態區 + 工作流程區

**Files:**
- Create: `web/src/components/Dashboard/StatusSection.tsx`
- Create: `web/src/components/Dashboard/WorkflowSection.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: 建立 StatusSection**

新增 `web/src/components/Dashboard/StatusSection.tsx`：

```typescript
import type { SystemStatus, LiveStats } from '@/api/dashboard'

interface Props {
  status: SystemStatus | null
  liveStats: LiveStats | null
}

function ProxyCard({
  label,
  running,
  detail,
  extra,
}: {
  label: string
  running: boolean
  detail: string
  extra?: string
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
      running
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        : 'bg-white/5 border-white/10 text-muted'
    }`}>
      <div className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-xs font-mono truncate">{detail}</div>
      </div>
      {extra && <div className="text-[10px] font-mono text-right opacity-70">{extra}</div>}
    </div>
  )
}

export function StatusSection({ status, liveStats }: Props) {
  const db = status?.proxy.db
  const http = status?.proxy.http

  const dbDetail = db?.running
    ? `Port ${db.port} · ${db.protocol ?? '?'}`
    : '未運行'
  const dbExtra = liveStats ? `${liveStats.db.qps} QPS · ${liveStats.db.totalQueries} queries` : undefined

  const httpDetail = http?.running
    ? `Port ${http.port} → ${http.target ?? '?'}`
    : '未啟動（選用）'
  const httpExtra = liveStats?.http
    ? `${liveStats.http.totalChunks} chunks`
    : undefined

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">系統狀態</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProxyCard label="DB Proxy" running={db?.running ?? false} detail={dbDetail} extra={dbExtra} />
        <ProxyCard label="HTTP Proxy" running={http?.running ?? false} detail={httpDetail} extra={httpExtra} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 建立 WorkflowSection**

新增 `web/src/components/Dashboard/WorkflowSection.tsx`：

```typescript
import { useNavigate } from 'react-router-dom'
import type { SystemStatus, SessionSummary } from '@/api/dashboard'

interface Props {
  status: SystemStatus | null
  sessions: SessionSummary[]
}

interface Stage {
  label: string
  done: boolean
  active: boolean
  hint: string
}

export function WorkflowSection({ status, sessions }: Props) {
  const navigate = useNavigate()
  const schemaLoaded = status?.schema.loaded ?? false
  const hasGroups = status?.schema.hasGroups ?? false
  const isRecording = status?.proxy.db.running ?? false
  const hasSessions = sessions.length > 0
  const hasAnalysis = sessions.some((s) => s.hasManifest || s.hasOptimizationReport)

  const stages: Stage[] = [
    { label: '提取 Schema', done: schemaLoaded, active: !schemaLoaded, hint: 'dbcli schema --format json' },
    { label: '整理視覺化', done: hasGroups, active: schemaLoaded && !hasGroups, hint: '前往 Canvas 分組' },
    { label: '錄製查詢', done: hasSessions, active: schemaLoaded && !hasSessions, hint: 'archivolt record start' },
    { label: '執行分析', done: hasAnalysis, active: hasSessions && !hasAnalysis, hint: 'archivolt analyze <id>' },
    { label: '匯出', done: false, active: hasAnalysis, hint: 'archivolt export ...' },
  ]

  const nextStage = stages.find((s) => s.active && !s.done)

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">工作流程</h2>
      <div className="flex items-center gap-2 flex-wrap">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              stage.done
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                : stage.active
                  ? 'bg-primary/20 text-primary border border-primary/30 animate-pulse'
                  : 'bg-white/5 text-muted border border-white/5'
            }`}>
              <span>{stage.done ? '✓' : `${i + 1}`}</span>
              <span>{stage.label}</span>
            </div>
            {i < stages.length - 1 && <div className="text-white/20 text-xs">→</div>}
          </div>
        ))}
      </div>
      {nextStage && (
        <div className="mt-4 flex items-center gap-3">
          {nextStage.label === '整理視覺化' ? (
            <button
              onClick={() => navigate('/canvas')}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              前往 Canvas →
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-white/5 rounded-lg font-mono text-xs text-text-dim">
              {nextStage.hint}
            </div>
          )}
        </div>
      )}
      {isRecording && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          錄製進行中 — 完成後執行 archivolt analyze
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: 更新 Dashboard.tsx**

```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from '@/stores/dashboardStore'
import { StatusSection } from '@/components/Dashboard/StatusSection'
import { WorkflowSection } from '@/components/Dashboard/WorkflowSection'

export default function Dashboard() {
  const navigate = useNavigate()
  const { status, sessions, liveStats, fetchStatus, fetchSessions, connectSSE, openWizard } =
    useDashboardStore()

  useEffect(() => {
    fetchStatus()
    fetchSessions()
    const cleanup = connectSSE()
    const interval = setInterval(() => {
      fetchStatus()
      fetchSessions()
    }, 10_000)
    return () => {
      cleanup()
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="min-h-screen bg-surface text-text font-sans p-6 pt-20 max-w-4xl mx-auto">
      {/* Navbar */}
      <div className="fixed top-4 left-4 right-4 h-12 backdrop-blur-md border border-white/10 shadow-glass rounded-xl z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-[10px] font-bold">A</span>
          </div>
          <h1 className="text-sm font-bold tracking-tight">Archivolt</h1>
        </div>
        <button
          onClick={() => navigate('/canvas')}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
        >
          開啟 Canvas →
        </button>
      </div>

      <div className="space-y-4">
        <StatusSection status={status} liveStats={liveStats} />
        <WorkflowSection status={status} sessions={sessions} />
        {/* SessionList + Wizard button — Task 8 */}
        <div className="flex justify-center pt-2">
          <button
            onClick={openWizard}
            className="px-6 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            🧙 新手引導 Wizard
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 驗證畫面**

```bash
bun run dev:all
```

開瀏覽器 `http://localhost:5173/`，應看到：系統狀態卡（DB Proxy 未運行）、工作流程（依現有狀態顯示進度）、Wizard 按鈕。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Dashboard/ web/src/pages/Dashboard.tsx
git commit -m "feat: [dx] Dashboard 狀態區與工作流程區"
```

---

## Task 8：Dashboard — Session 列表

**Files:**
- Create: `web/src/components/Dashboard/SessionList.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: 建立 SessionList**

新增 `web/src/components/Dashboard/SessionList.tsx`：

```typescript
import { useNavigate } from 'react-router-dom'
import type { SessionSummary } from '@/api/dashboard'

interface Props {
  sessions: SessionSummary[]
  loading: boolean
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function SessionList({ sessions, loading }: Props) {
  const navigate = useNavigate()
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10)

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">
        最近 Session
        {loading && <span className="ml-2 text-primary animate-pulse">·</span>}
      </h2>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">尚無錄製紀錄</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    session.status === 'recording'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-muted border border-white/10'
                  }`}>
                    {session.status === 'recording' ? '● 錄製中' : '停止'}
                  </span>
                  <span className="text-[10px] font-mono text-muted truncate">{session.id}</span>
                </div>
                <div className="text-[10px] text-muted">
                  {formatDate(session.startedAt)} ·
                  {session.stats.totalQueries} queries
                  {session.httpChunkCount > 0 && ` · ${session.httpChunkCount} HTTP chunks`}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {(session.hasManifest || session.hasOptimizationReport) && (
                  <button
                    onClick={() => navigate(`/report/${session.id}`)}
                    className="text-[10px] px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors cursor-pointer"
                  >
                    查看報告
                  </button>
                )}
                {!session.hasManifest && !session.hasOptimizationReport && (
                  <span className="text-[10px] text-muted px-2">尚未分析</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: 加入 Dashboard.tsx**

在 `web/src/pages/Dashboard.tsx` 加入 SessionList（位於 WorkflowSection 和 Wizard 按鈕之間）：

```typescript
import { SessionList } from '@/components/Dashboard/SessionList'
// ...在 WorkflowSection 之後：
<SessionList sessions={sessions} loading={loading} />
```

確認從 dashboardStore 取出 `loading`：

```typescript
const { status, sessions, liveStats, loading, fetchStatus, fetchSessions, connectSSE, openWizard } =
  useDashboardStore()
```

- [ ] **Step 3: 確認畫面**

開啟 `http://localhost:5173/`，Session 列表應列出現有 sessions，有分析報告者顯示「查看報告」按鈕。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Dashboard/SessionList.tsx web/src/pages/Dashboard.tsx
git commit -m "feat: [dx] Dashboard Session 列表"
```

---

## Task 9：Wizard Drawer（5 步驟）

**Files:**
- Create: `web/src/components/Wizard/WizardDrawer.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: 建立 WizardDrawer**

新增 `web/src/components/Wizard/WizardDrawer.tsx`：

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from '@/stores/dashboardStore'
import { dashboardApi } from '@/api/dashboard'

const STEPS = [
  { title: '提取 Schema', subtitle: '從資料庫匯出 Schema' },
  { title: '整理視覺化', subtitle: '在 Canvas 上整理資料表分組' },
  { title: '啟動錄製 Proxy', subtitle: '攔截 DB 查詢（和 HTTP API）' },
  { title: '執行分析', subtitle: '將查詢轉化為結構化報告' },
  { title: '匯出', subtitle: '產出 ORM 模型或文件' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[9px] px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-muted hover:text-text transition-colors cursor-pointer"
    >
      {copied ? '✓' : '複製'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start gap-2 bg-surface/50 rounded-lg px-3 py-2 border border-white/5">
      <code className="text-[11px] font-mono text-text-dim flex-1 break-all">{code}</code>
      <CopyButton text={code} />
    </div>
  )
}

export function WizardDrawer() {
  const navigate = useNavigate()
  const { wizardOpen, wizardStep, closeWizard, setWizardStep, status } = useDashboardStore()

  const [startForm, setStartForm] = useState({
    targetHost: 'localhost',
    targetPort: '3306',
    listenPort: '13306',
    httpEnabled: false,
    httpPort: '18080',
    httpTarget: 'http://localhost:8000',
  })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  if (!wizardOpen) return null

  const handleStart = async () => {
    setStarting(true)
    setStartError(null)
    try {
      await dashboardApi.startRecording({
        targetHost: startForm.targetHost,
        targetPort: parseInt(startForm.targetPort),
        listenPort: parseInt(startForm.listenPort),
        httpProxy: startForm.httpEnabled
          ? { enabled: true, port: parseInt(startForm.httpPort), target: startForm.httpTarget }
          : undefined,
      })
    } catch (e: any) {
      setStartError(e.message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={closeWizard}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-96 bg-surface border-l border-white/10 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-sm font-bold">新手引導</h2>
            <p className="text-[10px] text-muted mt-0.5">步驟 {wizardStep} / {STEPS.length}</p>
          </div>
          <button onClick={closeWizard} className="text-muted hover:text-text transition-colors cursor-pointer text-lg leading-none">×</button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setWizardStep(i + 1)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i + 1 === wizardStep ? 'w-6 bg-primary' : i + 1 < wizardStep ? 'w-3 bg-emerald-400' : 'w-3 bg-white/15'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-base font-bold mb-1">{STEPS[wizardStep - 1].title}</h3>
          <p className="text-xs text-muted mb-5">{STEPS[wizardStep - 1].subtitle}</p>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">使用 dbcli 掃描你的資料庫並匯入：</p>
              <CodeBlock code="dbcli schema --format json > my-database.json" />
              <CodeBlock code="archivolt --input my-database.json" />
              {status?.schema.loaded && (
                <div className="flex items-center gap-2 text-xs text-emerald-300 mt-2">
                  <span>✓</span> archivolt.json 已載入（{status.schema.tableCount} 個資料表）
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">在 Canvas 上拖曳資料表、建立分組，讓結構一目了然。</p>
              <button
                onClick={() => { closeWizard(); navigate('/canvas') }}
                className="w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                前往 Canvas →
              </button>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">設定 DB Proxy，讓 Archivolt 攔截應用程式的 SQL 查詢。</p>
              
              {/* DB Proxy */}
              <div className="space-y-2">
                <label className="text-[10px] text-muted uppercase font-bold block">DB Target</label>
                <div className="flex gap-2">
                  <input
                    value={startForm.targetHost}
                    onChange={(e) => setStartForm((f) => ({ ...f, targetHost: e.target.value }))}
                    placeholder="localhost"
                    className="flex-1 bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
                  />
                  <input
                    value={startForm.targetPort}
                    onChange={(e) => setStartForm((f) => ({ ...f, targetPort: e.target.value }))}
                    placeholder="3306"
                    className="w-20 bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">Proxy Port（你的 app 改連這個）</label>
                  <input
                    value={startForm.listenPort}
                    onChange={(e) => setStartForm((f) => ({ ...f, listenPort: e.target.value }))}
                    placeholder="13306"
                    className="w-28 bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* HTTP Proxy (optional) */}
              <div className="border border-white/5 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={startForm.httpEnabled}
                    onChange={(e) => setStartForm((f) => ({ ...f, httpEnabled: e.target.checked }))}
                    className="accent-primary"
                  />
                  <span className="text-xs text-text-dim">同時啟動 HTTP Proxy（選用）</span>
                </label>
                {startForm.httpEnabled && (
                  <div className="space-y-2 pl-5">
                    <input
                      value={startForm.httpTarget}
                      onChange={(e) => setStartForm((f) => ({ ...f, httpTarget: e.target.value }))}
                      placeholder="http://localhost:8000"
                      className="w-full bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
                    />
                    <input
                      value={startForm.httpPort}
                      onChange={(e) => setStartForm((f) => ({ ...f, httpPort: e.target.value }))}
                      placeholder="18080"
                      className="w-24 bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
                    />
                  </div>
                )}
              </div>

              {startError && <p className="text-xs text-red-400">{startError}</p>}

              {status?.proxy.db.running ? (
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  DB Proxy 運行中 — Port {status.proxy.db.port}
                </div>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  {starting ? '啟動中...' : '啟動 Proxy'}
                </button>
              )}
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">錄製完成後，執行分析將查詢轉為報告：</p>
              <CodeBlock code="archivolt analyze <session-id>" />
              <CodeBlock code="archivolt analyze <session-id> --format optimize-md" />
              <p className="text-[10px] text-muted">加上 --ddl schema.sql 可分析索引缺口。</p>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">將 vFK 標註匯出為 ORM 模型或文件：</p>
              <CodeBlock code="archivolt export eloquent --laravel /path/to/project" />
              <CodeBlock code="archivolt export prisma" />
              <CodeBlock code="archivolt export mermaid" />
              <CodeBlock code="archivolt export dbml" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
          <button
            onClick={() => setWizardStep(Math.max(1, wizardStep - 1))}
            disabled={wizardStep === 1}
            className="px-4 py-2 text-xs text-muted hover:text-text disabled:opacity-30 transition-colors cursor-pointer"
          >
            ← 上一步
          </button>
          {wizardStep < STEPS.length ? (
            <button
              onClick={() => setWizardStep(wizardStep + 1)}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={closeWizard}
              className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/20 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              完成 ✓
            </button>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 在 Dashboard.tsx 加入 WizardDrawer**

```typescript
import { WizardDrawer } from '@/components/Wizard/WizardDrawer'

// 在 return 的最外層 div 結尾加入：
<WizardDrawer />
```

- [ ] **Step 3: 驗證 Wizard**

開啟 `http://localhost:5173/`，點「新手引導 Wizard」，確認：
- Drawer 從右側滑入
- 5 個步驟可透過進度點切換
- Step 3 有表單，Step 1/4/5 有可複製指令

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Wizard/ web/src/pages/Dashboard.tsx
git commit -m "feat: [dx] Wizard Drawer（5 步驟含 HTTP proxy 表單）"
```

---

## Task 10：分析報告檢視器

**Files:**
- Create: `web/src/components/Report/FindingCard.tsx`
- Modify: `web/src/pages/ReportViewer.tsx`

- [ ] **Step 1: 建立 FindingCard**

新增 `web/src/components/Report/FindingCard.tsx`：

```typescript
import { useState } from 'react'

interface Props {
  severity: 'red' | 'orange' | 'yellow'
  title: string
  subtitle?: string
  sql?: string
  extraSql?: string
  extraSqlLabel?: string
}

const severityStyles = {
  red: 'border-red-500/20 bg-red-500/5 text-red-300',
  orange: 'border-orange-500/20 bg-orange-500/5 text-orange-300',
  yellow: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[9px] px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-muted hover:text-text transition-colors cursor-pointer"
    >
      {copied ? '✓' : '複製 SQL'}
    </button>
  )
}

export function FindingCard({ severity, title, subtitle, sql, extraSql, extraSqlLabel }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-xl border p-4 cursor-pointer transition-colors ${severityStyles[severity]} hover:brightness-110`}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">{title}</div>
          {subtitle && <div className="text-[10px] opacity-70 mt-0.5">{subtitle}</div>}
        </div>
        <div className="text-[10px] opacity-50">{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && sql && (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-2">
            <pre className="flex-1 text-[10px] font-mono bg-black/20 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">{sql}</pre>
            <CopyButton text={sql} />
          </div>
          {extraSql && (
            <div>
              <div className="text-[9px] text-muted uppercase font-bold mb-1">{extraSqlLabel ?? '建議 SQL'}</div>
              <div className="flex items-start gap-2">
                <pre className="flex-1 text-[10px] font-mono bg-black/20 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">{extraSql}</pre>
                <CopyButton text={extraSql} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 實作 ReportViewer.tsx**

```typescript
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { dashboardApi, type OptimizationReportJson } from '@/api/dashboard'
import { FindingCard } from '@/components/Report/FindingCard'

export default function ReportViewer() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<OptimizationReportJson | null>(null)
  const [rawMd, setRawMd] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    dashboardApi.getReport(sessionId, 'optimize')
      .then((data) => { setReport(data); setLoading(false) })
      .catch(() => {
        // Fall back to manifest
        return dashboardApi.getReport(sessionId, 'manifest')
          .then((data) => { setReport(data as any); setLoading(false) })
          .catch((e) => { setError(e.message); setLoading(false) })
      })
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex h-screen bg-surface text-text items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-screen bg-surface text-text items-center justify-center flex-col gap-3">
        <p className="text-muted text-sm">報告不存在</p>
        <p className="text-[10px] text-muted/60">請先執行 archivolt analyze {sessionId} --format optimize-md</p>
        <button onClick={() => navigate('/')} className="text-xs text-primary underline cursor-pointer">← 返回</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-text font-sans">
      {/* Header */}
      <div className="sticky top-0 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-muted hover:text-text transition-colors cursor-pointer text-sm">←</button>
          <div>
            <div className="text-sm font-bold">分析報告</div>
            <div className="text-[10px] font-mono text-muted">{sessionId}</div>
          </div>
        </div>
        <button
          onClick={() => setShowRaw((r) => !r)}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
        >
          {showRaw ? '結構化檢視' : 'Raw MD'}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {showRaw ? (
          <div className="prose prose-invert prose-sm max-w-none">
            {rawMd ? (
              <ReactMarkdown>{rawMd}</ReactMarkdown>
            ) : (
              <p className="text-muted text-sm">Markdown 版本需執行 archivolt analyze 產生</p>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* N+1 */}
            {report.n1Findings && report.n1Findings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
                  🔴 N+1 問題 ({report.n1Findings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.n1Findings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="red"
                      title={`${f.apiPath} — 重複 ${f.count} 次`}
                      sql={f.sql}
                      extraSql={f.batchSql}
                      extraSqlLabel="建議批次查詢"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Index gaps */}
            {report.indexGapFindings && report.indexGapFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-3">
                  🟠 索引缺失 ({report.indexGapFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.indexGapFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="orange"
                      title={`${f.table}.${f.column} 無索引`}
                      sql={f.createIndexSql}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Fragmentation */}
            {report.fragmentationFindings && report.fragmentationFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3">
                  🟡 查詢碎片化 ({report.fragmentationFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.fragmentationFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="yellow"
                      title={`重複 ${f.count} 次`}
                      sql={f.sql}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Full scans */}
            {report.fullScanFindings && report.fullScanFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
                  🔴 全表掃描 ({report.fullScanFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.fullScanFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="red"
                      title={`${f.table} 全表掃描`}
                      sql={f.sql}
                      extraSql={f.createIndexSql}
                      extraSqlLabel="建議索引"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Read/Write ratio */}
            {report.readWriteReport && (
              <section>
                <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">
                  📊 讀寫比分析
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] text-muted uppercase">
                        <th className="px-4 py-2 text-left font-semibold">資料表</th>
                        <th className="px-4 py-2 text-right font-semibold">讀</th>
                        <th className="px-4 py-2 text-right font-semibold">寫</th>
                        <th className="px-4 py-2 text-right font-semibold">讀佔比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.readWriteReport.tables.map((t, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                          <td className="px-4 py-2 font-mono">{t.table}</td>
                          <td className="px-4 py-2 text-right text-emerald-400">{t.reads}</td>
                          <td className="px-4 py-2 text-right text-amber-400">{t.writes}</td>
                          <td className="px-4 py-2 text-right">{Math.round(t.readRatio * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 驗證報告檢視器**

```bash
# 假設已有 optimize-report.json：
open http://localhost:5173/report/<session-id>
```

確認：結構化卡片顯示，點擊展開 SQL，[複製 SQL] 有效，[Raw MD] 切換。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Report/ web/src/pages/ReportViewer.tsx
git commit -m "feat: [dx] 分析報告檢視器（結構化卡片 + Raw MD 切換）"
```

---

## Task 11：CLI 啟動後自動開瀏覽器

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 在 index.ts 的 Start server 區塊後新增 open browser**

在 `src/index.ts` 的 `const server = core.liftoff(port)` 之後，`const schemaExists = await repo.exists()` 之前，新增：

```typescript
// 自動開啟瀏覽器
const openBrowser = (url: string) => {
  const platform = process.platform
  const cmd =
    platform === 'darwin' ? 'open' :
    platform === 'win32'  ? 'start' :
    'xdg-open'
  Bun.spawn([cmd, url], { stdout: 'ignore', stderr: 'ignore' })
}

// 稍微延遲確保伺服器就緒
setTimeout(() => openBrowser(`http://localhost:${port}`), 500)
```

- [ ] **Step 2: 驗證**

```bash
bun run src/index.ts
```

預期：終端顯示啟動訊息後，瀏覽器自動開啟 `http://localhost:3100`（指向 production build 或 proxy 到 dev server）。

> **注意**：development 模式下前端在 5173，production build 則直接在 3100。開發時開瀏覽器到 5173 仍需手動，或可改為偵測 `NODE_ENV` 決定 port。

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: [dx] CLI 啟動後自動開啟瀏覽器"
```

---

## Task 12：全面測試驗收

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: 跑現有單元測試確認沒有 regression**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bun run check
```

預期：typecheck + lint + tests 全部通過。

- [ ] **Step 2: 寫 E2E 測試（Playwright）**

```bash
# 確認 playwright 已安裝
cd /Users/carl/Dev/CMG/Archivolt
ls web/playwright.config.ts 2>/dev/null || echo "需安裝 playwright"
```

若未安裝：
```bash
cd web && bun add -d @playwright/test && bunx playwright install chromium
```

新增 `tests/e2e/dashboard.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

test.describe('Dashboard', () => {
  test('首頁顯示 Dashboard 三個區塊', async ({ page }) => {
    await page.goto(BASE)
    await expect(page.getByText('系統狀態')).toBeVisible()
    await expect(page.getByText('工作流程')).toBeVisible()
    await expect(page.getByText('最近 Session')).toBeVisible()
  })

  test('開啟 Wizard Drawer 並可切換步驟', async ({ page }) => {
    await page.goto(BASE)
    await page.getByText('新手引導 Wizard').click()
    await expect(page.getByText('提取 Schema')).toBeVisible()
    await page.getByText('下一步').click()
    await expect(page.getByText('整理視覺化')).toBeVisible()
  })

  test('[Open Canvas →] 跳轉到 /canvas', async ({ page }) => {
    await page.goto(BASE)
    await page.getByText('開啟 Canvas').click()
    await expect(page).toHaveURL(`${BASE}/canvas`)
  })
})
```

- [ ] **Step 3: 跑 E2E 測試**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bun run dev:all &
sleep 3
cd web && bunx playwright test tests/e2e/dashboard.spec.ts
```

預期：3 個 test 通過。

- [ ] **Step 4: 最終 Commit**

```bash
git add tests/
git commit -m "test: [dx] E2E 測試覆蓋 Dashboard 核心流程"
```

---

## 實作順序總覽

| Task | 主要交付 | 依賴 |
|------|----------|------|
| 1 | 路由骨架 | — |
| 2 | GET /api/status | 1 |
| 3 | SSE /api/recording/live | 2 |
| 4 | sessions list + start with HTTP proxy | 3 |
| 5 | JSON 報告 renderer + GET /api/report | 4 |
| 6 | dashboardStore + API client | 1 |
| 7 | Dashboard 狀態區 + 工作流程 | 6 |
| 8 | Dashboard Session 列表 | 7 |
| 9 | Wizard Drawer | 8 |
| 10 | Report Viewer | 5, 6 |
| 11 | CLI 自動開瀏覽器 | — |
| 12 | E2E 測試 | 全部 |
