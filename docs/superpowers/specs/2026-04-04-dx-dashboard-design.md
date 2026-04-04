# DX Dashboard 設計文件

**日期**：2026-04-04  
**狀態**：已核准，待實作  
**範疇**：前端 Dashboard 頁、後端 Status/SSE API、Wizard Overlay、分析報告檢視器

---

## 問題陳述

Archivolt 目前以 CLI 為主，使用者需要記住完整工作流程（提取 → 整理 → 錄製 → 分析 → 匯出）和對應指令。痛點涵蓋所有階段：

- **錄製前**：設定 proxy 參數需記指令
- **錄製中**：無法即時確認 proxy 是否正常接收數據
- **錄製後**：需記得跑 analyze、apply 等後續步驟，流程分散
- **分析結果**：只能在終端或文字編輯器閱讀 Markdown 報告

---

## 目標

1. 啟動 `archivolt` 後自動開瀏覽器到 Dashboard，一頁掌握系統狀態
2. 新手透過 Wizard Overlay 完成完整工作流程，不需記指令
3. 老手在 Dashboard 快速確認 proxy 狀態、管理 session、查看報告
4. 分析報告在瀏覽器內結構化呈現，關鍵 SQL 一鍵複製

---

## 方案選擇

選擇**方案 A：Home Dashboard 頁**，理由：
- 利用現有 React + Vite + Zustand 基礎設施
- 不破壞現有 ER Canvas 功能
- SSE 與 Bun `serve()` 相容，實作簡單

---

## 架構設計

### 路由結構

```
/              → Dashboard（新首頁）
/canvas        → ER Canvas（現有畫布移至此路由）
/report/:sessionId → 分析報告檢視器（新）
```

### CLI 行為變更

`archivolt`（不帶參數）啟動伺服器後，自動執行：
```bash
open http://localhost:3100      # macOS
xdg-open http://localhost:3100  # Linux
start http://localhost:3100     # Windows
```

跨平台實作：使用 Bun 的 `Bun.spawn` 搭配 `process.platform` 判斷。

### 首次使用判斷

不做自動判斷新手/老手。**永遠顯示 Dashboard**，提供「新手引導 Wizard」按鈕讓使用者主動開啟。

---

## 前端元件設計

### Dashboard（`web/src/pages/Dashboard.tsx`）

單頁垂直排列，四個區塊：

```
┌─────────────────────────────────────────┐
│  Archivolt  v0.3.0        [Open Canvas] │  ← Navbar
├─────────────────────────────────────────┤
│  🟢 系統狀態區                           │
│  DB Proxy:   🟢 運行中  Port: 13306  QPS: 42/s    │  ← SSE 即時更新
│  HTTP Proxy: 🟡 未啟動  (選用)                     │
├─────────────────────────────────────────┤
│  📋 工作流程區                           │
│  ① 提取 ✅  ② 整理 ✅  ③ 錄製 🔵        │
│  ④ 分析 ⬜  ⑤ 匯出 ⬜                   │
│  [下一步：停止錄製並分析 →]              │
├─────────────────────────────────────────┤
│  📁 最近 Session 列表                    │
│  session-abc  2026-04-04  234 queries   │
│  [Analyze ▾] [Apply] [查看報告]          │
├─────────────────────────────────────────┤
│  [🧙 新手引導 Wizard]                    │
└─────────────────────────────────────────┘
```

**工作流程進度判斷邏輯**：

| 階段 | 判斷依據 |
|------|----------|
| ① 提取 | `archivolt.json` 存在 |
| ② 整理 | schema 有 group 資料 |
| ③ 錄製 | 有 session 且 proxy 運行中 |
| ④ 分析 | 有 session 且有對應的 report 檔案 |
| ⑤ 匯出 | 不追蹤（匯出為一次性操作） |

### Wizard Overlay（`web/src/components/Wizard/WizardDrawer.tsx`）

從右側滑出的 Drawer，不遮蔽 Dashboard。5 步驟，不強迫順序：

**Step 1：提取 Schema**
- 顯示 `dbcli` 指令範例（可複製）
- 自動偵測狀態：`archivolt.json` 存在則打勾

**Step 2：整理視覺化**
- [前往 Canvas →] 按鈕，跳轉 `/canvas`

**Step 3：啟動錄製 Proxy**
- DB Proxy（必填）：Target Host、Port、Protocol（或貼 `.env` 路徑）、Proxy Port（預設 13306）
- HTTP Proxy（選用）：☐ 同時啟動 HTTP Proxy — Port（預設 18080）、Target URL（上游 API，如 `http://localhost:8000`）
- [啟動] → 呼叫 `POST /api/recording/start`
- 即時顯示 DB Proxy + HTTP Proxy 各自狀態（共用 SSE）

**Step 4：執行分析**
- Session 下拉選擇
- 勾選項：☐ DDL 對比（需提供 `.sql` 路徑）、☐ EXPLAIN 驗證（需提供 DB URL）
- [執行 Analyze]

**Step 5：匯出**
- 格式選擇：Eloquent / Prisma / Mermaid / DBML
- [匯出]

**狀態持久化**：Wizard 進度存於 `localStorage`，關掉再開不重置。

### 分析報告檢視器（`web/src/pages/ReportViewer.tsx`）

路由：`/report/:sessionId`

```
┌─────────────────────────────────────────────────┐
│ ← 返回  session-abc  2026-04-04      [Raw MD] │
├─────────────────────────────────────────────────┤
│ [Operation Manifest] [Optimization Report ▾]    │
├─────────────────────────────────────────────────┤
│  🔴 N+1 問題  3 處                              │
│  ┌──────────────────────────────────────────┐  │
│  │ GET /api/orders — orders 重複 47 次      │  │
│  │ SELECT * FROM orders WHERE user_id = ?  │  │
│  │ [複製 SQL]  [建議批次查詢 ▾]             │  │
│  └──────────────────────────────────────────┘  │
│  🟠 索引缺失  🟡 查詢碎片化  🔴 全表掃描        │
└─────────────────────────────────────────────────┘
```

- **結構化模式**（預設）：findings 以卡片呈現，每張卡片可展開，附「複製 SQL」按鈕
- **Raw Markdown 模式**：`[Raw MD]` 切換，用 `react-markdown` 渲染
- Optimization Report findings 透過後端新增 `--format optimize-json` 輸出，或後端直接 parse Markdown

---

## 後端 API 設計

### `GET /api/status`（新增）

一次性快照，Dashboard 初始載入時呼叫。

```typescript
interface StatusResponse {
  proxy: {
    db: {
      running: boolean
      port: number | null
      protocol: 'mysql' | 'postgres' | null
      sessionId: string | null
    }
    http: {
      running: boolean
      port: number | null
      target: string | null  // upstream API URL
    }
  }
  server: {
    version: string
    uptimeSeconds: number
  }
  schema: {
    loaded: boolean
    tableCount: number
    hasGroups: boolean
  }
}
```

### `GET /api/recording/live`（新增）

SSE 串流，proxy 運行時每秒推送。

```
event: stats
data: {
  "sessionId": "abc",
  "elapsedSeconds": 87,
  "db": { "qps": 42, "totalQueries": 1203 },
  "http": { "chunksPerSecond": 3, "totalChunks": 241 }
}

event: stopped
data: {"sessionId":"abc","totalQueries":1203,"totalChunks":241}
```

實作：直接讀 `RecordingService` 的 `IncrementalStats`（DB）與 `HttpProxy` 的 chunk 計數，無額外 overhead。HTTP Proxy 未啟動時，`http` 欄位為 `null`。

### `GET /api/recording/sessions`（新增）

Session 列表，包裝現有 `record list` 邏輯。

```typescript
interface SessionSummary {
  id: string
  startedAt: string
  stoppedAt: string | null
  queryCount: number
  httpChunkCount: number  // HTTP proxy 錄製的 chunk 數，無 HTTP proxy 則為 0
  hasManifest: boolean
  hasOptimizationReport: boolean
}
```

### `POST /api/recording/start`（新增）

Wizard Step 3 呼叫，觸發 proxy 啟動。

```typescript
interface StartRecordingRequest {
  target: string                   // "host:port"（DB）
  protocol?: 'mysql' | 'postgres'
  proxyPort?: number               // 預設 13306
  httpProxy?: {
    enabled: boolean
    port: number                   // 預設 18080
    target: string                 // 上游 API URL，如 "http://localhost:8000"
  }
}
```

### `GET /api/report/:sessionId/:type`（新增）

type: `manifest` | `optimize`，回傳 JSON 格式的結構化 findings。

後端實作策略：`AnalyzeCommand` 執行後在 `data/analysis/<sessionId>/` 同時寫入 `.md` 和 `.json`（新增 `OptimizationReportJsonRenderer`）。API 直接讀取 JSON 檔案，不重新分析。若 JSON 不存在則回傳 404，前端提示「尚未分析，請先執行 Analyze」。

---

## 資料流

```
Browser (SSE client)
  ↕  GET /api/recording/live
Backend SSE handler
  ↕  reads every 1s
RecordingService.getIncrementalStats()
  ↕  accumulates
TcpProxy / HttpProxy (WriteStream)
```

---

## 前端狀態管理

新增 `web/src/stores/dashboardStore.ts`（Zustand）：

```typescript
interface DashboardStore {
  // 系統狀態
  proxyStatus: {
    db: DbProxyStatus | null
    http: HttpProxyStatus | null
  }
  liveStats: {
    db: { qps: number; totalQueries: number } | null
    http: { chunksPerSecond: number; totalChunks: number } | null
  } | null
  
  // Session 列表
  sessions: SessionSummary[]
  
  // Wizard
  wizardOpen: boolean
  wizardStep: number  // 1-5
  
  // SSE 連線
  sseConnection: EventSource | null
  connectSSE: () => void
  disconnectSSE: () => void
}
```

---

## 測試策略

### Unit Tests（Vitest）

- `GET /api/status` response mapping
- `GET /api/recording/sessions` data transformation
- Optimization report JSON parser（Markdown → structured findings）
- `dashboardStore` SSE 事件處理邏輯

### Integration Tests

- Proxy 啟動 → SSE 推送 QPS → Dashboard store 更新

### E2E Tests（Playwright）

- 開啟 `http://localhost:3100` → 看到 Dashboard
- 點「新手引導 Wizard」→ Drawer 開啟
- Wizard Step 3：填表 → [啟動 Proxy] → 狀態變綠
- Session 列表 → [查看報告] → 跳轉 `/report/:id` → 看到 N+1 cards
- 切換 [Raw MD] → 看到 Markdown 渲染

---

## 實作順序建議

1. **後端 API**：`/api/status`、`/api/recording/sessions`、SSE `/api/recording/live`
2. **路由重構**：Canvas 移到 `/canvas`，新增 `/` Dashboard 骨架
3. **Dashboard 四區塊**：狀態區、工作流程區、Session 列表
4. **Wizard Drawer**：5 步驟，`POST /api/recording/start` 串接
5. **報告檢視器**：`/report/:id`，結構化卡片 + Raw MD 切換
6. **CLI 自動開瀏覽器**：`archivolt` 啟動後 `open localhost:3100`
7. **測試補全**

---

## 不在範疇內

- 桌面 app / Electron / 系統托盤
- 多使用者 / 認證機制
- Cloud 部署或遠端存取
- Canvas 本身的任何修改
