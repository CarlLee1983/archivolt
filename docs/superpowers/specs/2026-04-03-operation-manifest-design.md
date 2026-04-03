# Operation Manifest — Chunk 語義分析與結構化匯出

## 背景

Archivolt 透過 TCP proxy 側錄 DB query，搭配 browser marker 切分成邏輯 chunk（第一階段已完成）。下一步是把這些 chunk 資料進行語義分析，產出一份 **Operation Manifest** 中間文件，讓人類開發者和 AI agent 都能消費，用於逆向工程和快速開發應用。

## 目標

1. **語義分析**：每個 chunk 自動推斷操作含義（如「查詢商品列表」、「建立訂單並扣減庫存」）
2. **結構化匯出**：產出同時人類可讀（Markdown）和機器可解析（JSON）的中間文件
3. **通用消費**：Claude Code、Cursor、Copilot、或人類開發者皆可使用此文件衍生 CRUD 骨架、migration、ORM model、API spec 等

## 架構決策

- **方案**：Domain Service + CLI + API 雙入口
- **分析邏輯**放在 Application 層（`ChunkAnalyzerService`），CLI 和 API 只是呼叫入口
- **語義推斷**使用 SQL 模式匹配，不依賴 LLM — 產出機械式描述（SQL 動詞 + table 名），不做業務語義推斷
- **單一 `.md` 檔案**包含 Markdown 正文 + 尾部 JSON code block，不拆分雙檔案
- **Mock 資料先行**，用 fixture 開發測試，等實際側錄後再驗證
- **同步改善 Chrome extension 側錄品質**，提升 manifest 的可讀性和完整性

## Operation Manifest 文件格式

一個 session 分析後產出一份 manifest。語義欄位為機械式描述（SQL 動詞 + table 名），人類可讀性主要來自 marker 的 url、action、target、label。

範例：

```markdown
# Operation Manifest — Session: rec_abc123
> 錄製時間: 2026-04-03 14:30 ~ 14:45 | Chunks: 8 | Tables: 6

## Operations

### 1. navigate /products — "商品列表 - MyShop"
- **Chunk ID**: chunk-001
- **Pattern**: read
- **Marker**: navigate — /products
- **Tables**: (無直接 query，僅頁面切換)

### 2. request GET /api/products (on /products)
- **Chunk ID**: chunk-002
- **Pattern**: read
- **Marker**: request — GET /api/products
- **Tables**: `products`, `categories`
- **SQL 摘要**:
  - `SELECT * FROM products JOIN categories ON products.category_id = categories.id LIMIT ?`
- **推斷關係**: products → categories (category_id)
- **語義**: SELECT products, categories

### 3. request GET /api/products/images (on /products)
- **Chunk ID**: chunk-003
- **Pattern**: read
- **Marker**: request — GET /api/products/images
- **Tables**: `product_images`
- **SQL 摘要**:
  - `SELECT * FROM product_images WHERE product_id IN (?, ?, ?)`
- **語義**: SELECT product_images

### 4. click button.add-to-cart "加入購物車" (on /products/123)
- **Chunk ID**: chunk-004
- **Pattern**: write
- **Marker**: click — button.add-to-cart "加入購物車"
- **Tables**: `cart_items`
- **SQL 摘要**:
  - `INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)`
- **語義**: INSERT cart_items

### 5. request POST /api/orders (on /checkout)
- **Chunk ID**: chunk-005
- **Pattern**: write
- **Marker**: request — POST /api/orders
- **Request Body**: `{"productId":5,"qty":2}`
- **Tables**: `orders`, `order_items`, `inventory`
- **SQL 摘要**:
  - `INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)`
  - `INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?, ?, ?, ?)`
  - `UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?`
- **推斷關係**: orders → order_items (order_id), order_items → inventory (product_id)
- **語義**: INSERT orders, order_items; UPDATE inventory

### 6. (silence-based split)
- **Chunk ID**: chunk-006
- **Pattern**: read
- **Tables**: `sessions`
- **SQL 摘要**:
  - `SELECT * FROM sessions WHERE token = ?`
- **語義**: SELECT sessions

## Table Involvement Matrix

| Table | Read | Write | Operations |
|-------|------|-------|------------|
| products | 2 | 0 | #2, #3 |
| categories | 1 | 0 | #2 |
| product_images | 1 | 0 | #3 |
| cart_items | 0 | 1 | #4 |
| orders | 0 | 1 | #5 |
| order_items | 0 | 1 | #5 |
| inventory | 0 | 1 | #5 |
| sessions | 1 | 0 | #6 |

## Inferred Relations (Virtual FK Candidates)

| Source Table | Column | Target Table | Column | Confidence | Evidence |
|-------------|--------|-------------|--------|------------|----------|
| products | category_id | categories | id | high | JOIN ON in chunk-002 |
| order_items | order_id | orders | id | high | INSERT 同 chunk-005 |
| order_items | product_id | products | id | medium | 同 chunk INSERT pattern |
| product_images | product_id | products | id | medium | WHERE IN chunk-003 |

## Machine-Readable Summary
\```json
{
  "sessionId": "rec_abc123",
  "operations": [...],
  "tableMatrix": [...],
  "inferredRelations": [...],
  "stats": { "totalChunks": 8, "readOps": 4, "writeOps": 2, "mixedOps": 0, "silenceSplit": 2 }
}
\```
```

**格式說明：**
- 有 marker 的 chunk：標題為 `action target (on url)`，如 `request GET /api/products (on /products)`
- 無 marker 的 chunk（silence-based split）：標題為 `(silence-based split)`
- 語義欄位為機械式列舉：`SELECT products, categories` 或 `INSERT orders; UPDATE inventory`
- Request Body 僅在 write 操作且有 body 時顯示（已由 extension 截斷至 8KB）

## Chrome Extension 側錄改善

為了提升 manifest 品質，需同步改善 extension 的側錄能力。

### 改善 1：describeElement 加上元素文字

**檔案**：`extension/src/content.ts` — `describeElement()`

現行產出：`button.add-to-cart`
改善產出：`button.add-to-cart "加入購物車"`

```typescript
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
```

文字截取 40 字元，避免長文本污染 marker。

### 改善 2：navigate 加上 document.title

**檔案**：`extension/src/content.ts` — SPA history interception 區塊

在 `SPA_NAVIGATE` 訊息中加入 `label: document.title`：

```typescript
history.pushState = function (...args) {
  originalPushState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}
```

**檔案**：`extension/src/background.ts` — `SPA_NAVIGATE` handler

將 `label` 傳入 `sendMarker()`：

```typescript
if (message.type === 'SPA_NAVIGATE') {
  if (!state.connected) return false
  if (sender.tab?.id !== state.lockedTabId) return false
  sendMarker(message.url, 'navigate', undefined, undefined, message.label)
  return false
}
```

### 改善 3：捕捉 GET API 呼叫

**檔案**：`extension/src/content.ts` — fetch/XHR interception 區塊

目前 `method !== 'GET'` 過濾掉了所有 GET 請求。改為：對符合 API pattern 的 GET 也送出 marker。

```typescript
// 判斷是否為 API 呼叫（非靜態資源）
function isApiUrl(url: string): boolean {
  try {
    const pathname = new URL(url, location.origin).pathname
    return pathname.startsWith('/api/') || pathname.startsWith('/graphql')
  } catch {
    return false
  }
}
```

fetch 攔截改為：
```typescript
window.fetch = function (input, init) {
  const method = ...
  const shouldCapture = method !== 'GET' || isApiUrl(reqUrl)

  if (shouldCapture) {
    // 送出 marker（同現有邏輯）
  }
  return originalFetch.call(this, input, init)
}
```

XHR 同理。

**過濾規則**：
- 非 GET → 一律捕捉（維持現行行為）
- GET → 僅捕捉 URL 符合 `/api/*` 或 `/graphql` 的請求
- 未來可在 popup 中讓使用者自訂 include/exclude pattern

### 改善對 OperationMarker 型別的影響

無需修改。現有 `OperationMarker` 已有 `label?: string` 欄位，navigate 的 `document.title` 直接填入此欄位。`describeElement` 的改善只影響 `target` 欄位的值，型別不變。`isApiUrl` 過濾是 extension 內部邏輯，不影響 domain 型別。

## 型別定義 — `OperationManifest.ts`

放在 `src/Modules/Recording/Domain/OperationManifest.ts`。

```typescript
export interface OperationEntry {
  readonly chunkId: string
  readonly index: number
  readonly label: string
  readonly pattern: ChunkPattern
  readonly marker?: { type: string; label: string }
  readonly tables: readonly string[]
  readonly sqlSummaries: readonly string[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly semantic: string
}

export interface InferredRelation {
  readonly sourceTable: string
  readonly sourceColumn: string
  readonly targetTable: string
  readonly targetColumn: string
  readonly confidence: 'high' | 'medium' | 'low'
  readonly evidence: string
}

export interface TableInvolvement {
  readonly table: string
  readonly readCount: number
  readonly writeCount: number
  readonly operationIndices: readonly number[]
}

export interface OperationManifest {
  readonly sessionId: string
  readonly recordedAt: { start: number; end: number }
  readonly operations: readonly OperationEntry[]
  readonly tableMatrix: readonly TableInvolvement[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly stats: {
    readonly totalChunks: number
    readonly readOps: number
    readonly writeOps: number
    readonly mixedOps: number
    readonly silenceSplit: number
  }
}
```

## ChunkAnalyzerService 分析流程

放在 `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts`。

```
chunks = buildChunks(queries, markers)
    |
for each chunk:
  1. 解析 SQL -> 提取 tables, columns, JOIN 條件
  2. SQL 骨架化（移除參數值，保留結構）
  3. 從 JOIN/WHERE 條件推斷 table 關係 + confidence
  4. 根據 pattern + tables + marker 產生語義標籤和描述
    |
彙總 table matrix（各表的讀寫次數）
合併去重 inferred relations
    |
回傳 OperationManifest
```

### SqlSemanticInferrer 策略

放在 `src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts`。

- **有 marker** -> 直接用 marker label 作為操作名稱
- **無 marker** -> 根據 pattern + table 名稱推斷：
  - `SELECT products` -> "查詢商品"
  - `INSERT orders + UPDATE inventory` -> "建立訂單並更新庫存"
- 推斷規則是簡單的模式匹配，不依賴 LLM

### 關係推斷 confidence 判定

- `high`：明確 JOIN ON a.col = b.col
- `medium`：WHERE 子句中 a.col IN (SELECT b.col ...)
- `low`：同一 chunk 中出現的 table 共現，但無明確 JOIN

## CLI 命令 — `archivolt analyze`

放在 `src/CLI/AnalyzeCommand.ts`。

```
archivolt analyze <session-id> [options]

Options:
  --output, -o <path>    輸出路徑（預設 data/analysis/<session-id>/manifest.md）
  --format <md|json>     輸出格式（預設 md，含嵌入 JSON）
  --stdout               輸出到 stdout（方便 pipe 給 agent）
```

產出檔案位置：
```
data/analysis/
  <session-id>/
    manifest.md
```

## API 入口 — `GET /api/recordings/:id/manifest`

在現有 `RecordingController` 新增 handler，回傳 `OperationManifest` JSON。

```
GET /api/recordings/:id/manifest

Response: {
  success: true,
  data: OperationManifest
}
```

## Manifest 渲染

放在 `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts`。

- `render(manifest: OperationManifest): string` -> Markdown 文字（含尾部 JSON block）
- API 直接回傳 JSON，不需要 renderer

## 檔案結構總覽

```
src/Modules/Recording/
  Domain/
    OperationManifest.ts              # 型別定義
  Application/
    Services/
      ChunkAnalyzerService.ts         # 核心分析邏輯
    Strategies/
      SqlSemanticInferrer.ts          # SQL -> 語義推斷
  Infrastructure/
    Renderers/
      ManifestMarkdownRenderer.ts     # Manifest -> Markdown
  Presentation/
    Controllers/
      RecordingController.ts          # 新增 manifest endpoint

src/CLI/
  AnalyzeCommand.ts                   # CLI 入口

data/analysis/                        # 分析產出目錄
```

## Mock 資料與測試策略

### Mock Session Fixture

```
tests/fixtures/recordings/mock-ecommerce/
  session.json
  queries.jsonl
  markers.jsonl
```

覆蓋電商情境（約 15 個 chunk）：
1. 首頁載入（read: products, categories）
2. 商品搜尋（read: products, product_images）
3. 商品詳情（read: products, reviews, inventory）
4. 加入購物車（write: cart_items）
5. 查看購物車（read: cart_items, products）
6. 下單（write: orders, order_items, 扣減 inventory）
7. 無 marker 的背景 query（silence-based 切分）

### 測試範圍

```
tests/unit/
  ChunkAnalyzerService.test.ts
  SqlSemanticInferrer.test.ts
  ManifestMarkdownRenderer.test.ts

tests/integration/
  AnalyzeCommand.test.ts
  ManifestEndpoint.test.ts
```

關鍵斷言：
- `ChunkAnalyzerService`：fixture 輸入 -> 正確的 OperationManifest 結構、table matrix 計數、relation confidence
- `SqlSemanticInferrer`：各種 SQL pattern -> 正確語義標籤
- `ManifestMarkdownRenderer`：manifest -> 合法 Markdown、JSON block 可 parse
- CLI：`--stdout` 輸出的尾部 JSON block 可被 `JSON.parse()` 解析
- API：回傳符合 `OperationManifest` schema

### Chrome Extension 改善測試

```
tests/unit/
  describeElement.test.ts        # 元素文字截取、特殊字元處理
  isApiUrl.test.ts               # API URL 判定邏輯
```

關鍵斷言：
- `describeElement`：含文字的 button -> `button.cls "按鈕文字"`、文字超過 40 字截斷、無文字元素不加引號
- `isApiUrl`：`/api/products` -> true、`/static/logo.png` -> false、`/graphql` -> true
- navigate marker 包含 `label: document.title`
- GET `/api/products` 被捕捉、GET `/static/logo.png` 被過濾
