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
- **語義推斷**使用 SQL 模式匹配，不依賴 LLM
- **單一 `.md` 檔案**包含 Markdown 正文 + 尾部 JSON code block，不拆分雙檔案
- **Mock 資料先行**，用 fixture 開發測試，等實際側錄後再驗證

## Operation Manifest 文件格式

一個 session 分析後產出一份 manifest，範例：

```markdown
# Operation Manifest — Session: <session-id>
> 錄製時間: 2026-04-03 14:30 ~ 14:45 | Chunks: 12 | Tables: 8

## Operations

### 1. 查詢商品列表
- **Chunk ID**: chunk-001
- **Pattern**: read
- **Marker**: click — "商品列表頁"
- **Tables**: `products`, `categories`, `product_images`
- **SQL 摘要**:
  - `SELECT * FROM products JOIN categories ...`
  - `SELECT * FROM product_images WHERE product_id IN (...)`
- **推斷關係**: products → categories (category_id), products → product_images (product_id)
- **語義**: 讀取商品及其分類和圖片，典型的列表頁 eager loading 模式

### 2. 建立訂單
- **Chunk ID**: chunk-005
- **Pattern**: write
- **Marker**: click — "確認下單"
- **Tables**: `orders`, `order_items`, `inventory`
- **SQL 摘要**:
  - `INSERT INTO orders ...`
  - `INSERT INTO order_items ...`
  - `UPDATE inventory SET quantity = quantity - ? ...`
- **推斷關係**: orders → order_items (order_id), order_items → inventory (product_id)
- **語義**: 建立訂單的交易操作，含庫存扣減

## Table Involvement Matrix

| Table | Read | Write | Operations |
|-------|------|-------|------------|
| products | 5 | 0 | #1, #3, #7 |
| orders | 1 | 2 | #2, #5 |
| inventory | 1 | 2 | #2, #5 |

## Inferred Relations (Virtual FK Candidates)

| Source Table | Column | Target Table | Column | Confidence | Evidence |
|-------------|--------|-------------|--------|------------|----------|
| orders | user_id | users | id | high | JOIN in chunk-002, chunk-005 |
| order_items | product_id | products | id | high | JOIN + INSERT pattern |

## Machine-Readable Summary
\```json
{ "sessionId": "...", "operations": [...], ... }
\```
```

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
