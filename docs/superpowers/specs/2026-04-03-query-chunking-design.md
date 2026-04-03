# Query Chunking — 側錄行為與使用者操作連結

> 將 TCP proxy 側錄的原始 DB query 流與使用者的瀏覽器操作標記（marker）關聯，形成帶有語義的邏輯事件（chunk），在 ER 圖上視覺化呈現。

## 背景

Archivolt 現有 Recording 模組透過 TCP proxy 攔截應用程式與資料庫之間的 query。但原始 query 流是扁平的時間序列，缺乏「使用者做了什麼」的語境。本設計將瀏覽器操作標記與 DB query 串聯，讓開發者看到「在 /product/3 按儲存時，資料庫發生了什麼」。

## 架構決策

- **方案 C：Recording 模組 + Domain Service 分離** — marker 儲存在 session 內，chunking 演算法作為純函數放在 Domain 層，不持久化 chunk。
- Chrome 擴充與 proxy 獨立啟動 — 擴充只負責送 marker，不管 proxy 生命週期。
- 擴充透過 `GET /api/recording/status` 自動取得 active session ID。
- 分兩階段實作。

## 第一階段：核心可用

### Domain 層

#### OperationMarker

```typescript
interface OperationMarker {
  readonly id: string
  readonly sessionId: string
  readonly timestamp: number
  readonly url: string                    // /login, /product/3
  readonly action: 'navigate' | 'submit' | 'click' | 'request'
  readonly target?: string               // form#login-form, button.save-btn, POST /api/orders
  readonly label?: string                // 使用者自訂標籤
}
```

#### QueryChunk

```typescript
interface QueryChunk {
  readonly id: string
  readonly sessionId: string
  readonly startTime: number
  readonly endTime: number
  readonly queries: readonly CapturedQuery[]
  readonly tables: readonly string[]     // 聯集
  readonly operations: readonly string[] // 聯集: SELECT, INSERT...
  readonly pattern: 'read' | 'write' | 'mixed'
  readonly marker?: OperationMarker      // 觸發此 chunk 的 marker（如有）
}
```

#### buildChunks() 演算法

純函數：

```typescript
function buildChunks(
  queries: readonly CapturedQuery[],
  markers: readonly OperationMarker[],
  config: { silenceThresholdMs: number }  // 預設 500
): readonly QueryChunk[]
```

邏輯：

1. 把 queries 和 markers 合併成一條時間線，按 timestamp 排序
2. 遇到 marker → 切新 chunk，附上該 marker
3. 遇到 query 且距離前一筆 query 超過 `silenceThresholdMs` → 切新 chunk（無 marker）
4. 否則 → 歸入當前 chunk
5. 計算每個 chunk 的 `tables`（聯集）、`operations`（聯集）、`pattern`

pattern 判定：

- 全是 SELECT → `read`
- 全是 INSERT/UPDATE/DELETE → `write`
- 混合 → `mixed`

### 持久化層

現有 session 目錄結構擴展：

```
data/recordings/<session-id>/
  session.json      # 既有
  queries.jsonl     # 既有
  markers.jsonl     # 新增：逐筆 OperationMarker
```

RecordingRepository 新增：

```typescript
async appendMarkers(sessionId: string, markers: readonly OperationMarker[]): Promise<void>
async loadMarkers(sessionId: string): Promise<OperationMarker[]>
```

RecordingService 新增：

```typescript
addMarker(params: { url: string; action: string; target?: string; label?: string }): OperationMarker
```

- 檢查是否有 active session，沒有就拋錯
- 建立 OperationMarker（附上 timestamp 和 sessionId）
- 寫入 repository

Chunk 不持久化，查詢時即時呼叫 `buildChunks()` 計算。

### API 層

新增 endpoints：

| Method | Path | 用途 |
|--------|------|------|
| POST | `/api/recording/marker` | Chrome 擴充送 marker |
| GET | `/api/recordings/:id/chunks` | 取得某 session 的 chunk 列表 |
| GET | `/api/recordings/:id/markers` | 取得某 session 的原始 marker |

#### POST /api/recording/marker

```typescript
// Request
{ url: string, action: string, target?: string, label?: string }

// Success
{ success: true, data: OperationMarker }

// Error: 沒有 active session
{ success: false, error: { code: 'NO_ACTIVE_SESSION', message: '...' } }
```

#### GET /api/recordings/:id/chunks

```typescript
// Query params
?silenceThresholdMs=500   // 可選，預設 500
?cursor=<chunkId>         // 分頁游標，從該 chunk 之後開始
?limit=50                 // 每頁筆數，預設 50

// Response
{
  success: true,
  data: {
    chunks: QueryChunk[],
    stats: { totalChunks: number, withMarker: number, withoutMarker: number },
    nextCursor: string | null   // null 表示沒有下一頁
  }
}
```

#### GET /api/recordings/:id/markers

```typescript
// Query params
?cursor=<markerId>
?limit=100                // 預設 100

// Response
{
  success: true,
  data: {
    markers: OperationMarker[],
    nextCursor: string | null
  }
}
```

#### 現有 GET /api/recordings/:id 擴展

回傳新增 `markers` 欄位：`{ session, queries, markers }`

#### 大量資料防護

- **buildChunks() 串流化**：JSONL 逐行讀取，不一次載入全部 query 到記憶體。演算法本身是單次遍歷（O(n)），可以邊讀邊切 chunk。
- **分頁**：chunks 和 markers endpoints 都支援 cursor-based 分頁，避免一次回傳過大 payload。
- **QueryChunk 內不含完整 query 內容**：API 回傳的 chunk 預設只含 query 的 `id`、`operation`、`tables`、`timestamp`、`duration`，不含完整 `sql` 和 `resultSummary`。需要看某個 chunk 的完整 query 時，用 `GET /api/recordings/:id/chunks/:chunkId/queries` 單獨取。
- **GET /api/recordings/:id 的 queries/markers 欄位**：改為只回傳總數，不回傳完整內容。需要明細時走各自的分頁 endpoint。

新增 endpoint：

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/recordings/:id/chunks/:chunkId/queries` | 取得單一 chunk 的完整 query 內容 |

### 前端

#### 新增檔案

```
web/src/
  components/Timeline/
    TimelinePanel.tsx      # 側邊面板容器（可收合，ER 圖右側）
    ChunkCard.tsx          # 單一 chunk 卡片
  stores/
    recordingStore.ts      # Zustand store
  api/
    recording.ts           # 後端 API 呼叫
```

#### recordingStore

```typescript
interface RecordingState {
  sessions: RecordingSession[]
  selectedSessionId: string | null
  chunks: QueryChunk[]
  activeChunkId: string | null
  fetchSessions: () => Promise<void>
  fetchChunks: (sessionId: string) => Promise<void>
  setActiveChunk: (chunkId: string | null) => void
}
```

#### TimelinePanel

- 頂部：session 選擇器下拉選單
- 主體：垂直 ChunkCard 列表，按時間順序

#### ChunkCard

- 有 marker：action icon + URL + target
- 無 marker：pattern icon + 涉及的 tables
- 副標：時間戳、query 數量、duration
- 點擊 → ER 圖高亮該 chunk 涉及的 table nodes 和 edges，其餘降低 opacity
- 再點擊 → 取消高亮

#### ERCanvas 整合

讀取 `recordingStore.activeChunkId`，有值時：

- chunk 涉及的 tables → node 高亮樣式
- 涉及 tables 之間的 FK/vFK edges → edge 高亮樣式
- 其餘 → 降低 opacity

不改動 `schemaStore`，由 `recordingStore` 驅動。

## 第二階段：Chrome 擴充 + 回放

### Chrome 擴充

- Manifest V3，權限：`activeTab`、`webNavigation`
- Popup：輸入 Archivolt API 位址 → 開始側錄 → 呼叫 `GET /api/recording/status` 取得 session → 鎖定 tab
- Content Script：監聽 submit、click（button/a/input[submit]）、攔截 fetch/XHR
- Background Service Worker：監聽 `webNavigation.onCompleted`（限定 tabId）、SPA pushState/replaceState
- 每個事件 → `POST /api/recording/marker`

自動捕捉四種事件：

| 事件 | 來源 | marker action |
|------|------|---------------|
| 頁面導航 | webNavigation + pushState/replaceState | navigate |
| 表單送出 | content script submit 監聽 | submit |
| 按鈕/連結點擊 | content script click 監聽 | click |
| AJAX 請求 | content script fetch/XHR 攔截 | request |

### 回放模式

- TimelinePanel 頂部新增播放控制列：play/pause、上一步/下一步、速度調節
- 自動按時間順序逐 chunk 切換 `activeChunkId`
- chunk 間隔等比壓縮

### 為什麼第一階段不會擋路

- `OperationMarker.action` 已涵蓋四種事件類型
- `POST /api/recording/marker` 是擴充需要的唯一 endpoint
- `recordingStore.activeChunkId` 支援外部切換，回放只是加 timer
