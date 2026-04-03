# Operation Manifest 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將側錄的 QueryChunk 資料進行語義分析，產出 Operation Manifest 中間文件（Markdown + JSON），並改善 Chrome extension 的側錄品質。

**Architecture:** Domain Service（`ChunkAnalyzerService`）負責核心分析邏輯，CLI（`archivolt analyze`）和 API（`GET /api/recordings/:id/manifest`）為雙入口。Chrome extension 同步改善 describeElement、navigate title、GET API 捕捉。

**Tech Stack:** TypeScript, Bun, Vitest, Chrome Extension Manifest V3

---

## 檔案結構

### 新建檔案

| 檔案 | 職責 |
|------|------|
| `src/Modules/Recording/Domain/OperationManifest.ts` | Manifest 型別定義 |
| `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts` | 核心分析：chunk → manifest |
| `src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts` | SQL 模式匹配 → 語義標籤 |
| `src/Modules/Recording/Application/Strategies/RelationInferrer.ts` | SQL JOIN/WHERE → 關係推斷 |
| `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts` | Manifest → Markdown 字串 |
| `src/CLI/AnalyzeCommand.ts` | CLI `archivolt analyze` 入口 |
| `test/unit/Recording/Application/SqlSemanticInferrer.test.ts` | 語義推斷測試 |
| `test/unit/Recording/Application/RelationInferrer.test.ts` | 關係推斷測試 |
| `test/unit/Recording/Application/ChunkAnalyzerService.test.ts` | 核心分析測試 |
| `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts` | Markdown 渲染測試 |
| `test/unit/Recording/CLI/AnalyzeCommand.test.ts` | CLI 整合測試 |
| `test/unit/Extension/describeElement.test.ts` | 元素描述改善測試 |
| `test/unit/Extension/isApiUrl.test.ts` | API URL 判定測試 |
| `test/fixtures/recordings/mock-ecommerce/session.json` | Mock session 元資料 |
| `test/fixtures/recordings/mock-ecommerce/queries.jsonl` | Mock SQL query 流 |
| `test/fixtures/recordings/mock-ecommerce/markers.jsonl` | Mock browser marker |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `src/index.ts` | 新增 `analyze` 子命令分支 |
| `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` | 新增 `getManifest()` handler |
| `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` | 新增 manifest route |
| `src/wiring/recording.ts` | 注入 `ChunkAnalyzerService` |
| `extension/src/content.ts` | describeElement 文字、isApiUrl、GET 捕捉 |
| `extension/src/background.ts` | sendMarker 加 label 參數、SPA_NAVIGATE 傳 label |

---

## Task 1: Mock 測試資料

**Files:**
- Create: `test/fixtures/recordings/mock-ecommerce/session.json`
- Create: `test/fixtures/recordings/mock-ecommerce/queries.jsonl`
- Create: `test/fixtures/recordings/mock-ecommerce/markers.jsonl`

- [ ] **Step 1: 建立 session.json**

```json
{
  "id": "rec_mock_ecommerce",
  "startedAt": 1712180000000,
  "endedAt": 1712180900000,
  "status": "stopped",
  "proxy": {
    "listenPort": 13306,
    "targetHost": "localhost",
    "targetPort": 3306
  },
  "stats": {
    "totalQueries": 12,
    "byOperation": { "SELECT": 7, "INSERT": 3, "UPDATE": 2 },
    "tablesAccessed": ["cart_items", "categories", "inventory", "order_items", "orders", "product_images", "products", "sessions"],
    "connectionCount": 1
  }
}
```

- [ ] **Step 2: 建立 markers.jsonl**

每行一筆 JSON，模擬使用者操作流程：

```jsonl
{"id":"mk_1712180001000_0","sessionId":"rec_mock_ecommerce","timestamp":1712180001000,"url":"/products","action":"navigate","label":"商品列表 - MyShop"}
{"id":"mk_1712180002000_1","sessionId":"rec_mock_ecommerce","timestamp":1712180002000,"url":"/products","action":"request","target":"GET /api/products","request":{"method":"GET","url":"/api/products"}}
{"id":"mk_1712180004000_2","sessionId":"rec_mock_ecommerce","timestamp":1712180004000,"url":"/products","action":"request","target":"GET /api/products/images","request":{"method":"GET","url":"/api/products/images"}}
{"id":"mk_1712180010000_3","sessionId":"rec_mock_ecommerce","timestamp":1712180010000,"url":"/products/123","action":"navigate","label":"商品詳情 - Widget A"}
{"id":"mk_1712180020000_4","sessionId":"rec_mock_ecommerce","timestamp":1712180020000,"url":"/products/123","action":"click","target":"button.add-to-cart \"加入購物車\""}
{"id":"mk_1712180030000_5","sessionId":"rec_mock_ecommerce","timestamp":1712180030000,"url":"/checkout","action":"navigate","label":"結帳 - MyShop"}
{"id":"mk_1712180040000_6","sessionId":"rec_mock_ecommerce","timestamp":1712180040000,"url":"/checkout","action":"request","target":"POST /api/orders","request":{"method":"POST","url":"/api/orders","body":"{\"productId\":5,\"qty\":2}"}}
```

- [ ] **Step 3: 建立 queries.jsonl**

每行一筆 JSON，模擬 DB query 流（timestamp 在對應 marker 之後）：

```jsonl
{"id":"q_1712180002010_0","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180002010,"duration":12,"sql":"SELECT products.*, categories.name as category_name FROM products JOIN categories ON products.category_id = categories.id LIMIT 20","operation":"SELECT","tables":["products","categories"]}
{"id":"q_1712180002025_1","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180002025,"duration":5,"sql":"SELECT COUNT(*) FROM products","operation":"SELECT","tables":["products"]}
{"id":"q_1712180004010_2","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180004010,"duration":8,"sql":"SELECT * FROM product_images WHERE product_id IN (1, 2, 3, 4, 5)","operation":"SELECT","tables":["product_images"]}
{"id":"q_1712180010010_3","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180010010,"duration":3,"sql":"SELECT * FROM products WHERE id = 123","operation":"SELECT","tables":["products"]}
{"id":"q_1712180010020_4","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180010020,"duration":6,"sql":"SELECT * FROM product_images WHERE product_id = 123","operation":"SELECT","tables":["product_images"]}
{"id":"q_1712180020010_5","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180020010,"duration":4,"sql":"INSERT INTO cart_items (user_id, product_id, qty) VALUES (1, 123, 2)","operation":"INSERT","tables":["cart_items"]}
{"id":"q_1712180040010_6","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180040010,"duration":2,"sql":"INSERT INTO orders (user_id, total, status) VALUES (1, 599.00, 'pending')","operation":"INSERT","tables":["orders"]}
{"id":"q_1712180040020_7","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180040020,"duration":3,"sql":"INSERT INTO order_items (order_id, product_id, qty, price) VALUES (1, 123, 2, 299.50)","operation":"INSERT","tables":["order_items"]}
{"id":"q_1712180040030_8","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180040030,"duration":5,"sql":"UPDATE inventory SET quantity = quantity - 2 WHERE product_id = 123","operation":"UPDATE","tables":["inventory"]}
{"id":"q_1712180041000_9","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180041000,"duration":1,"sql":"UPDATE orders SET status = 'confirmed' WHERE id = 1","operation":"UPDATE","tables":["orders"]}
{"id":"q_1712180050000_10","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180050000,"duration":2,"sql":"SELECT * FROM sessions WHERE token = 'abc123'","operation":"SELECT","tables":["sessions"]}
{"id":"q_1712180050010_11","sessionId":"rec_mock_ecommerce","connectionId":1,"timestamp":1712180050010,"duration":1,"sql":"SELECT * FROM products WHERE featured = 1 LIMIT 5","operation":"SELECT","tables":["products"]}
```

- [ ] **Step 4: 驗證 fixture 可被 buildChunks 正確處理**

建立一個快速驗證腳本確認 fixture 格式正確：

```bash
bun run -e "
const fs = require('fs');
const path = 'test/fixtures/recordings/mock-ecommerce';
const queries = fs.readFileSync(path + '/queries.jsonl', 'utf-8').trim().split('\n').map(JSON.parse);
const markers = fs.readFileSync(path + '/markers.jsonl', 'utf-8').trim().split('\n').map(JSON.parse);
const session = JSON.parse(fs.readFileSync(path + '/session.json', 'utf-8'));
console.log('Session:', session.id);
console.log('Queries:', queries.length);
console.log('Markers:', markers.length);
console.log('OK');
"
```

Expected: `Session: rec_mock_ecommerce`, `Queries: 12`, `Markers: 7`, `OK`

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/recordings/mock-ecommerce/
git commit -m "test: [recording] 新增 mock 電商 session fixture"
```

---

## Task 2: Domain 型別 — OperationManifest

**Files:**
- Create: `src/Modules/Recording/Domain/OperationManifest.ts`

- [ ] **Step 1: 建立型別定義**

```typescript
// src/Modules/Recording/Domain/OperationManifest.ts

import type { ChunkPattern } from '@/Modules/Recording/Domain/QueryChunk'
import type { MarkerAction } from '@/Modules/Recording/Domain/OperationMarker'

export interface InferredRelation {
  readonly sourceTable: string
  readonly sourceColumn: string
  readonly targetTable: string
  readonly targetColumn: string
  readonly confidence: 'high' | 'medium' | 'low'
  readonly evidence: string
}

export interface OperationEntry {
  readonly chunkId: string
  readonly index: number
  readonly label: string
  readonly pattern: ChunkPattern
  readonly marker?: {
    readonly action: MarkerAction
    readonly url: string
    readonly target?: string
    readonly label?: string
  }
  readonly tables: readonly string[]
  readonly sqlSummaries: readonly string[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly semantic: string
  readonly requestBody?: string
}

export interface TableInvolvement {
  readonly table: string
  readonly readCount: number
  readonly writeCount: number
  readonly operationIndices: readonly number[]
}

export interface OperationManifest {
  readonly sessionId: string
  readonly recordedAt: { readonly start: number; readonly end: number }
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

- [ ] **Step 2: 驗證 TypeScript 編譯**

Run: `bunx tsc --noEmit src/Modules/Recording/Domain/OperationManifest.ts`
Expected: 無錯誤

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Recording/Domain/OperationManifest.ts
git commit -m "feat: [recording] 新增 OperationManifest domain 型別定義"
```

---

## Task 3: SqlSemanticInferrer — SQL 語義推斷

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts`
- Create: `test/unit/Recording/Application/SqlSemanticInferrer.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Recording/Application/SqlSemanticInferrer.test.ts

import { describe, it, expect } from 'vitest'
import {
  inferSemantic,
  buildLabel,
  skeletonizeSql,
} from '@/Modules/Recording/Application/Strategies/SqlSemanticInferrer'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

describe('skeletonizeSql', () => {
  it('replaces numeric values with ?', () => {
    expect(skeletonizeSql('SELECT * FROM users WHERE id = 123')).toBe(
      'SELECT * FROM users WHERE id = ?',
    )
  })

  it('replaces string values with ?', () => {
    expect(skeletonizeSql("INSERT INTO users (name) VALUES ('alice')")).toBe(
      'INSERT INTO users (name) VALUES (?)',
    )
  })

  it('replaces IN list with ?', () => {
    expect(skeletonizeSql('SELECT * FROM products WHERE id IN (1, 2, 3)')).toBe(
      'SELECT * FROM products WHERE id IN (?)',
    )
  })

  it('preserves table and column names', () => {
    const sql = 'SELECT users.name, orders.id FROM users JOIN orders ON users.id = orders.user_id'
    const result = skeletonizeSql(sql)
    expect(result).toContain('users.name')
    expect(result).toContain('orders.id')
    expect(result).toContain('JOIN orders ON')
  })
})

describe('inferSemantic', () => {
  it('returns SQL verb + table for single SELECT', () => {
    expect(inferSemantic(['SELECT'], ['products'])).toBe('SELECT products')
  })

  it('returns SQL verb + tables for multi-table SELECT', () => {
    expect(inferSemantic(['SELECT'], ['products', 'categories'])).toBe(
      'SELECT products, categories',
    )
  })

  it('returns SQL verb + table for INSERT', () => {
    expect(inferSemantic(['INSERT'], ['orders'])).toBe('INSERT orders')
  })

  it('joins multiple operations with semicolon', () => {
    expect(inferSemantic(['INSERT', 'UPDATE'], ['orders', 'inventory'])).toBe(
      'INSERT orders; UPDATE inventory',
    )
  })

  it('deduplicates operations per table', () => {
    expect(inferSemantic(['SELECT', 'SELECT'], ['users'])).toBe('SELECT users')
  })
})

describe('buildLabel', () => {
  it('uses marker action + target when marker has target', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'request', target: 'GET /api/products',
    }
    expect(buildLabel(marker)).toBe('request GET /api/products (on /products)')
  })

  it('uses marker action + url + label when navigate with label', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'navigate', label: '商品列表 - MyShop',
    }
    expect(buildLabel(marker)).toBe('navigate /products — "商品列表 - MyShop"')
  })

  it('uses marker action + url when navigate without label', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'navigate',
    }
    expect(buildLabel(marker)).toBe('navigate /products')
  })

  it('returns (silence-based split) for undefined marker', () => {
    expect(buildLabel(undefined)).toBe('(silence-based split)')
  })

  it('uses click target with quotes for click action', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products/123', action: 'click', target: 'button.add-to-cart "加入購物車"',
    }
    expect(buildLabel(marker)).toBe('click button.add-to-cart "加入購物車" (on /products/123)')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test test/unit/Recording/Application/SqlSemanticInferrer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 SqlSemanticInferrer**

```typescript
// src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts

import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

/**
 * 將 SQL 參數值替換為 ?，保留結構骨架
 */
export function skeletonizeSql(sql: string): string {
  return sql
    .replace(/\bIN\s*\([^)]+\)/gi, 'IN (?)')       // IN (1, 2, 3) → IN (?)
    .replace(/'[^']*'/g, '?')                         // 'string' → ?
    .replace(/\b\d+(\.\d+)?\b/g, '?')                // 123, 299.50 → ?
}

/**
 * 根據 SQL 操作和 table 名產生機械式語義描述
 */
export function inferSemantic(
  operations: readonly string[],
  tables: readonly string[],
): string {
  const uniqueOps = [...new Set(operations)]

  if (uniqueOps.length === 1) {
    return `${uniqueOps[0]} ${tables.join(', ')}`
  }

  // 多操作：嘗試將每個操作配對到對應的 table
  // 簡化處理：按操作分組
  return uniqueOps.map((op) => `${op} ${tables.join(', ')}`).join('; ')
}

/**
 * 根據 marker 資訊建立 chunk 標題
 */
export function buildLabel(marker: OperationMarker | undefined): string {
  if (!marker) return '(silence-based split)'

  const { action, url, target, label } = marker

  if (action === 'navigate') {
    return label ? `navigate ${url} — "${label}"` : `navigate ${url}`
  }

  if (target) {
    return `${action} ${target} (on ${url})`
  }

  return `${action} ${url}`
}

/**
 * 從 chunk 的 queries 中提取去重的 SQL 骨架
 */
export function extractSqlSummaries(queries: readonly CapturedQuery[]): readonly string[] {
  const seen = new Set<string>()
  const summaries: string[] = []

  for (const q of queries) {
    const skeleton = skeletonizeSql(q.sql)
    if (!seen.has(skeleton)) {
      seen.add(skeleton)
      summaries.push(skeleton)
    }
  }

  return summaries
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test test/unit/Recording/Application/SqlSemanticInferrer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts test/unit/Recording/Application/SqlSemanticInferrer.test.ts
git commit -m "feat: [recording] 新增 SqlSemanticInferrer — SQL 語義推斷"
```

---

## Task 4: RelationInferrer — 關係推斷

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/RelationInferrer.ts`
- Create: `test/unit/Recording/Application/RelationInferrer.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Recording/Application/RelationInferrer.test.ts

import { describe, it, expect } from 'vitest'
import { inferRelations } from '@/Modules/Recording/Application/Strategies/RelationInferrer'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeQuery(sql: string, tables: string[], operation: CapturedQuery['operation'] = 'SELECT'): CapturedQuery {
  return {
    id: `q_${Date.now()}`, sessionId: 'rec_1', connectionId: 1,
    timestamp: Date.now(), duration: 5, sql, operation, tables,
  }
}

describe('inferRelations', () => {
  it('detects JOIN ON relation as high confidence', () => {
    const queries = [
      makeQuery(
        'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        ['products', 'categories'],
      ),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations).toHaveLength(1)
    expect(relations[0]).toEqual({
      sourceTable: 'products',
      sourceColumn: 'category_id',
      targetTable: 'categories',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'JOIN ON in chunk-1',
    })
  })

  it('detects WHERE IN subquery as medium confidence', () => {
    const queries = [
      makeQuery(
        'SELECT * FROM product_images WHERE product_id IN (SELECT id FROM products)',
        ['product_images', 'products'],
      ),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations.some((r) => r.confidence === 'medium')).toBe(true)
    expect(relations.some((r) => r.sourceTable === 'product_images' && r.sourceColumn === 'product_id')).toBe(true)
  })

  it('detects co-occurring tables in INSERT as low confidence', () => {
    const queries = [
      makeQuery('INSERT INTO orders (user_id, total) VALUES (1, 100)', ['orders'], 'INSERT'),
      makeQuery('INSERT INTO order_items (order_id, product_id) VALUES (1, 5)', ['order_items'], 'INSERT'),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    const lowRels = relations.filter((r) => r.confidence === 'low')
    expect(lowRels.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplicates identical relations', () => {
    const queries = [
      makeQuery('SELECT * FROM orders JOIN users ON orders.user_id = users.id', ['orders', 'users']),
      makeQuery('SELECT * FROM orders JOIN users ON orders.user_id = users.id', ['orders', 'users']),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    const highRels = relations.filter((r) => r.confidence === 'high')
    expect(highRels).toHaveLength(1)
  })

  it('returns empty array for single-table queries', () => {
    const queries = [makeQuery('SELECT * FROM users WHERE id = 1', ['users'])]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations).toEqual([])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test test/unit/Recording/Application/RelationInferrer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 RelationInferrer**

```typescript
// src/Modules/Recording/Application/Strategies/RelationInferrer.ts

import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

// JOIN ... ON a.col = b.col
const JOIN_ON_PATTERN = /\bJOIN\s+`?(\w+)`?\s+(?:\w+\s+)?ON\s+`?(\w+)`?\.`?(\w+)`?\s*=\s*`?(\w+)`?\.`?(\w+)`?/gi

// WHERE col IN (SELECT ... FROM table)
const WHERE_IN_SUBQUERY = /\bWHERE\s+`?(\w+)`?\s+IN\s*\(\s*SELECT\s+`?(\w+)`?\s+FROM\s+`?(\w+)`?/gi

function relationKey(r: InferredRelation): string {
  return `${r.sourceTable}.${r.sourceColumn}->${r.targetTable}.${r.targetColumn}`
}

export function inferRelations(
  queries: readonly CapturedQuery[],
  chunkId: string,
): readonly InferredRelation[] {
  const seen = new Map<string, InferredRelation>()

  for (const q of queries) {
    // High confidence: explicit JOIN ON
    JOIN_ON_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = JOIN_ON_PATTERN.exec(q.sql)) !== null) {
      const [, , leftTable, leftCol, rightTable, rightCol] = match
      const rel: InferredRelation = {
        sourceTable: leftTable,
        sourceColumn: leftCol,
        targetTable: rightTable,
        targetColumn: rightCol,
        confidence: 'high',
        evidence: `JOIN ON in ${chunkId}`,
      }
      const key = relationKey(rel)
      if (!seen.has(key)) seen.set(key, rel)
    }

    // Medium confidence: WHERE col IN (SELECT col FROM table)
    WHERE_IN_SUBQUERY.lastIndex = 0
    while ((match = WHERE_IN_SUBQUERY.exec(q.sql)) !== null) {
      const [, whereCol, selectCol, subTable] = match
      // Source is the outer table (first table in query)
      const outerTable = q.tables[0]
      if (outerTable && outerTable !== subTable) {
        const rel: InferredRelation = {
          sourceTable: outerTable,
          sourceColumn: whereCol,
          targetTable: subTable,
          targetColumn: selectCol,
          confidence: 'medium',
          evidence: `WHERE IN subquery in ${chunkId}`,
        }
        const key = relationKey(rel)
        if (!seen.has(key)) seen.set(key, rel)
      }
    }
  }

  // Low confidence: co-occurring tables in same chunk with _id columns
  const allTables = [...new Set(queries.flatMap((q) => q.tables))]
  if (allTables.length >= 2) {
    for (const q of queries) {
      // Look for columns that reference other tables: e.g., order_id in order_items → orders
      const colMatches = q.sql.matchAll(/\b(\w+)_id\b/gi)
      for (const colMatch of colMatches) {
        const colName = colMatch[1].toLowerCase()
        // Find a table that matches the column prefix (singular or plural)
        const candidates = allTables.filter(
          (t) => t.toLowerCase() === colName || t.toLowerCase() === `${colName}s`,
        )
        for (const targetTable of candidates) {
          for (const sourceTable of q.tables) {
            if (sourceTable === targetTable) continue
            const rel: InferredRelation = {
              sourceTable,
              sourceColumn: `${colName}_id`,
              targetTable,
              targetColumn: 'id',
              confidence: 'low',
              evidence: `co-occurring tables in ${chunkId}`,
            }
            const key = relationKey(rel)
            if (!seen.has(key)) seen.set(key, rel)
          }
        }
      }
    }
  }

  return [...seen.values()]
}

/**
 * 合併多個 chunk 的 relations，去重並保留最高 confidence
 */
export function mergeRelations(
  allRelations: readonly InferredRelation[],
): readonly InferredRelation[] {
  const best = new Map<string, InferredRelation>()
  const confidenceRank = { high: 3, medium: 2, low: 1 }

  for (const rel of allRelations) {
    const key = relationKey(rel)
    const existing = best.get(key)
    if (!existing || confidenceRank[rel.confidence] > confidenceRank[existing.confidence]) {
      best.set(key, rel)
    }
  }

  return [...best.values()]
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test test/unit/Recording/Application/RelationInferrer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/RelationInferrer.ts test/unit/Recording/Application/RelationInferrer.test.ts
git commit -m "feat: [recording] 新增 RelationInferrer — SQL 關係推斷"
```

---

## Task 5: ChunkAnalyzerService — 核心分析

**Files:**
- Create: `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts`
- Create: `test/unit/Recording/Application/ChunkAnalyzerService.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Recording/Application/ChunkAnalyzerService.test.ts

import { describe, it, expect } from 'vitest'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { RecordingSession } from '@/Modules/Recording/Domain/Session'

function makeQuery(overrides: {
  timestamp: number
  sql: string
  tables: string[]
  operation: CapturedQuery['operation']
}): CapturedQuery {
  return {
    id: `q_${overrides.timestamp}`,
    sessionId: 'rec_1',
    connectionId: 1,
    duration: 5,
    ...overrides,
  }
}

function makeMarker(overrides: {
  timestamp: number
  url: string
  action: OperationMarker['action']
  target?: string
  label?: string
  request?: OperationMarker['request']
}): OperationMarker {
  return {
    id: `mk_${overrides.timestamp}`,
    sessionId: 'rec_1',
    ...overrides,
  }
}

const mockSession: RecordingSession = {
  id: 'rec_1',
  startedAt: 1000,
  endedAt: 2000,
  status: 'stopped',
  proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
  stats: { totalQueries: 0, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
}

describe('ChunkAnalyzerService', () => {
  const service = new ChunkAnalyzerService()

  it('produces a manifest with correct stats', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'INSERT INTO orders (user_id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/checkout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    expect(manifest.sessionId).toBe('rec_1')
    expect(manifest.stats.totalChunks).toBe(2)
    expect(manifest.stats.readOps).toBe(1)
    expect(manifest.stats.writeOps).toBe(1)
  })

  it('builds correct labels from markers', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate', label: '商品列表' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    expect(manifest.operations[0].label).toBe('navigate /products — "商品列表"')
  })

  it('counts silence-based splits', () => {
    const queries = [
      makeQuery({ timestamp: 1000, sql: 'SELECT 1', tables: ['a'], operation: 'SELECT' }),
      makeQuery({ timestamp: 5000, sql: 'SELECT 2', tables: ['b'], operation: 'SELECT' }),
    ]
    const manifest = service.analyze(mockSession, queries, [])

    expect(manifest.stats.silenceSplit).toBe(2)
    expect(manifest.operations[0].label).toBe('(silence-based split)')
  })

  it('produces table matrix with correct counts', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 1020, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'INSERT INTO orders (id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/checkout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    const productsEntry = manifest.tableMatrix.find((t) => t.table === 'products')
    expect(productsEntry?.readCount).toBe(1)
    expect(productsEntry?.operationIndices).toEqual([0])

    const ordersEntry = manifest.tableMatrix.find((t) => t.table === 'orders')
    expect(ordersEntry?.writeCount).toBe(1)
    expect(ordersEntry?.operationIndices).toEqual([1])
  })

  it('includes requestBody from marker when present', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'INSERT INTO orders (id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({
        timestamp: 1000, url: '/checkout', action: 'request', target: 'POST /api/orders',
        request: { method: 'POST', url: '/api/orders', body: '{"productId":5}' },
      }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    expect(manifest.operations[0].requestBody).toBe('{"productId":5}')
  })

  it('merges inferred relations across chunks', () => {
    const queries = [
      makeQuery({
        timestamp: 1010,
        sql: 'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        tables: ['products', 'categories'],
        operation: 'SELECT',
      }),
      makeQuery({
        timestamp: 2010,
        sql: 'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        tables: ['products', 'categories'],
        operation: 'SELECT',
      }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/a', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/b', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    // Should be deduplicated across chunks
    const highRels = manifest.inferredRelations.filter((r) => r.confidence === 'high')
    expect(highRels).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test test/unit/Recording/Application/ChunkAnalyzerService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 ChunkAnalyzerService**

```typescript
// src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts

import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'
import type { CapturedQuery, RecordingSession } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type {
  OperationManifest,
  OperationEntry,
  TableInvolvement,
  InferredRelation,
} from '@/Modules/Recording/Domain/OperationManifest'
import {
  inferSemantic,
  buildLabel,
  extractSqlSummaries,
} from '@/Modules/Recording/Application/Strategies/SqlSemanticInferrer'
import {
  inferRelations,
  mergeRelations,
} from '@/Modules/Recording/Application/Strategies/RelationInferrer'

const DEFAULT_SILENCE_MS = 500

export class ChunkAnalyzerService {
  analyze(
    session: RecordingSession,
    queries: readonly CapturedQuery[],
    markers: readonly OperationMarker[],
    silenceThresholdMs: number = DEFAULT_SILENCE_MS,
  ): OperationManifest {
    const chunks = buildChunks(queries, markers, { silenceThresholdMs })

    let readOps = 0
    let writeOps = 0
    let mixedOps = 0
    let silenceSplit = 0
    const allRelations: InferredRelation[] = []
    const tableMap = new Map<string, { read: number; write: number; ops: Set<number> }>()

    const operations: OperationEntry[] = chunks.map((chunk, index) => {
      // Stats
      if (chunk.pattern === 'read') readOps++
      else if (chunk.pattern === 'write') writeOps++
      else mixedOps++

      if (!chunk.marker) silenceSplit++

      // Relation inference
      const chunkRelations = inferRelations(chunk.queries, chunk.id)
      allRelations.push(...chunkRelations)

      // Table matrix
      for (const table of chunk.tables) {
        const entry = tableMap.get(table) ?? { read: 0, write: 0, ops: new Set<number>() }
        if (chunk.pattern === 'read') entry.read++
        else entry.write++
        entry.ops.add(index)
        tableMap.set(table, entry)
      }

      // Request body
      const requestBody = chunk.marker?.request?.body

      return {
        chunkId: chunk.id,
        index,
        label: buildLabel(chunk.marker),
        pattern: chunk.pattern,
        marker: chunk.marker
          ? {
              action: chunk.marker.action,
              url: chunk.marker.url,
              target: chunk.marker.target,
              label: chunk.marker.label,
            }
          : undefined,
        tables: chunk.tables,
        sqlSummaries: extractSqlSummaries(chunk.queries),
        inferredRelations: chunkRelations,
        semantic: inferSemantic(chunk.operations, chunk.tables),
        requestBody,
      }
    })

    const tableMatrix: TableInvolvement[] = [...tableMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, entry]) => ({
        table,
        readCount: entry.read,
        writeCount: entry.write,
        operationIndices: [...entry.ops].sort((a, b) => a - b),
      }))

    return {
      sessionId: session.id,
      recordedAt: {
        start: session.startedAt,
        end: session.endedAt ?? session.startedAt,
      },
      operations,
      tableMatrix,
      inferredRelations: mergeRelations(allRelations),
      stats: {
        totalChunks: chunks.length,
        readOps,
        writeOps,
        mixedOps,
        silenceSplit,
      },
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test test/unit/Recording/Application/ChunkAnalyzerService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts test/unit/Recording/Application/ChunkAnalyzerService.test.ts
git commit -m "feat: [recording] 新增 ChunkAnalyzerService — chunk 語義分析核心"
```

---

## Task 6: ManifestMarkdownRenderer

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts`
- Create: `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts

import { describe, it, expect } from 'vitest'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import type { OperationManifest } from '@/Modules/Recording/Domain/OperationManifest'

const sampleManifest: OperationManifest = {
  sessionId: 'rec_test',
  recordedAt: { start: 1712180000000, end: 1712180900000 },
  operations: [
    {
      chunkId: 'chunk_1', index: 0,
      label: 'navigate /products — "商品列表"',
      pattern: 'read',
      marker: { action: 'navigate', url: '/products', label: '商品列表' },
      tables: ['products', 'categories'],
      sqlSummaries: ['SELECT * FROM products JOIN categories ON products.category_id = categories.id LIMIT ?'],
      inferredRelations: [{ sourceTable: 'products', sourceColumn: 'category_id', targetTable: 'categories', targetColumn: 'id', confidence: 'high', evidence: 'JOIN ON in chunk_1' }],
      semantic: 'SELECT products, categories',
    },
    {
      chunkId: 'chunk_2', index: 1,
      label: 'request POST /api/orders (on /checkout)',
      pattern: 'write',
      marker: { action: 'request', url: '/checkout', target: 'POST /api/orders' },
      tables: ['orders'],
      sqlSummaries: ['INSERT INTO orders (user_id, total) VALUES (?, ?)'],
      inferredRelations: [],
      semantic: 'INSERT orders',
      requestBody: '{"productId":5}',
    },
  ],
  tableMatrix: [
    { table: 'categories', readCount: 1, writeCount: 0, operationIndices: [0] },
    { table: 'orders', readCount: 0, writeCount: 1, operationIndices: [1] },
    { table: 'products', readCount: 1, writeCount: 0, operationIndices: [0] },
  ],
  inferredRelations: [
    { sourceTable: 'products', sourceColumn: 'category_id', targetTable: 'categories', targetColumn: 'id', confidence: 'high', evidence: 'JOIN ON in chunk_1' },
  ],
  stats: { totalChunks: 2, readOps: 1, writeOps: 1, mixedOps: 0, silenceSplit: 0 },
}

describe('renderManifest', () => {
  it('produces valid markdown with session header', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('# Operation Manifest — Session: rec_test')
    expect(md).toContain('Chunks: 2')
    expect(md).toContain('Tables: 3')
  })

  it('includes operation sections with correct labels', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('### 1. navigate /products — "商品列表"')
    expect(md).toContain('### 2. request POST /api/orders (on /checkout)')
  })

  it('includes SQL summaries', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('SELECT * FROM products JOIN categories')
    expect(md).toContain('INSERT INTO orders')
  })

  it('includes request body for write operations', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('**Request Body**: `{"productId":5}`')
  })

  it('includes table involvement matrix', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('## Table Involvement Matrix')
    expect(md).toContain('| products |')
    expect(md).toContain('| orders |')
  })

  it('includes inferred relations table', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('## Inferred Relations')
    expect(md).toContain('products')
    expect(md).toContain('category_id')
    expect(md).toContain('high')
  })

  it('includes parseable JSON block at the end', () => {
    const md = renderManifest(sampleManifest)
    const jsonMatch = md.match(/```json\n([\s\S]+?)\n```/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1])
    expect(parsed.sessionId).toBe('rec_test')
    expect(parsed.stats.totalChunks).toBe(2)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 ManifestMarkdownRenderer**

```typescript
// src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts

import type {
  OperationManifest,
  OperationEntry,
} from '@/Modules/Recording/Domain/OperationManifest'

function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

function renderOperation(op: OperationEntry): string {
  const lines: string[] = []
  lines.push(`### ${op.index + 1}. ${op.label}`)
  lines.push(`- **Chunk ID**: ${op.chunkId}`)
  lines.push(`- **Pattern**: ${op.pattern}`)

  if (op.marker) {
    const markerDesc = op.marker.target
      ? `${op.marker.action} — ${op.marker.target}`
      : `${op.marker.action} — ${op.marker.url}`
    lines.push(`- **Marker**: ${markerDesc}`)
  }

  if (op.tables.length === 0) {
    lines.push('- **Tables**: (無直接 query)')
  } else {
    lines.push(`- **Tables**: ${op.tables.map((t) => `\`${t}\``).join(', ')}`)
  }

  if (op.requestBody) {
    lines.push(`- **Request Body**: \`${op.requestBody}\``)
  }

  if (op.sqlSummaries.length > 0) {
    lines.push('- **SQL 摘要**:')
    for (const sql of op.sqlSummaries) {
      lines.push(`  - \`${sql}\``)
    }
  }

  if (op.inferredRelations.length > 0) {
    const relStr = op.inferredRelations
      .map((r) => `${r.sourceTable} → ${r.targetTable} (${r.sourceColumn})`)
      .join(', ')
    lines.push(`- **推斷關係**: ${relStr}`)
  }

  lines.push(`- **語義**: ${op.semantic}`)

  return lines.join('\n')
}

export function renderManifest(manifest: OperationManifest): string {
  const uniqueTables = new Set(manifest.tableMatrix.map((t) => t.table))
  const startDate = formatDate(manifest.recordedAt.start)
  const endDate = formatDate(manifest.recordedAt.end)

  const sections: string[] = []

  // Header
  sections.push(`# Operation Manifest — Session: ${manifest.sessionId}`)
  sections.push(`> 錄製時間: ${startDate} ~ ${endDate} | Chunks: ${manifest.stats.totalChunks} | Tables: ${uniqueTables.size}`)

  // Operations
  sections.push('')
  sections.push('## Operations')
  sections.push('')
  for (const op of manifest.operations) {
    sections.push(renderOperation(op))
    sections.push('')
  }

  // Table Involvement Matrix
  sections.push('## Table Involvement Matrix')
  sections.push('')
  sections.push('| Table | Read | Write | Operations |')
  sections.push('|-------|------|-------|------------|')
  for (const t of manifest.tableMatrix) {
    const ops = t.operationIndices.map((i) => `#${i + 1}`).join(', ')
    sections.push(`| ${t.table} | ${t.readCount} | ${t.writeCount} | ${ops} |`)
  }

  // Inferred Relations
  if (manifest.inferredRelations.length > 0) {
    sections.push('')
    sections.push('## Inferred Relations (Virtual FK Candidates)')
    sections.push('')
    sections.push('| Source Table | Column | Target Table | Column | Confidence | Evidence |')
    sections.push('|-------------|--------|-------------|--------|------------|----------|')
    for (const r of manifest.inferredRelations) {
      sections.push(`| ${r.sourceTable} | ${r.sourceColumn} | ${r.targetTable} | ${r.targetColumn} | ${r.confidence} | ${r.evidence} |`)
    }
  }

  // Machine-readable JSON
  sections.push('')
  sections.push('## Machine-Readable Summary')
  sections.push('')
  sections.push('```json')
  sections.push(JSON.stringify(manifest, null, 2))
  sections.push('```')

  return sections.join('\n')
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts
git commit -m "feat: [recording] 新增 ManifestMarkdownRenderer — Markdown 渲染"
```

---

## Task 7: CLI — `archivolt analyze` 命令

**Files:**
- Create: `src/CLI/AnalyzeCommand.ts`
- Create: `test/unit/Recording/CLI/AnalyzeCommand.test.ts`
- Modify: `src/index.ts:7-12`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Recording/CLI/AnalyzeCommand.test.ts

import { describe, it, expect } from 'vitest'
import { parseAnalyzeArgs } from '@/CLI/AnalyzeCommand'

describe('parseAnalyzeArgs', () => {
  it('parses session-id from first argument', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.sessionId).toBe('rec_123')
  })

  it('throws when session-id is missing', () => {
    expect(() => parseAnalyzeArgs(['analyze'])).toThrow('session-id')
  })

  it('defaults format to md', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.format).toBe('md')
  })

  it('parses --format json', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'json'])
    expect(args.format).toBe('json')
  })

  it('parses --stdout flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--stdout'])
    expect(args.stdout).toBe(true)
  })

  it('parses --output path', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--output', '/tmp/out.md'])
    expect(args.output).toBe('/tmp/out.md')
  })

  it('defaults stdout to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.stdout).toBe(false)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test test/unit/Recording/CLI/AnalyzeCommand.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 AnalyzeCommand**

```typescript
// src/CLI/AnalyzeCommand.ts

import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'

export interface AnalyzeArgs {
  readonly sessionId: string
  readonly output?: string
  readonly format: 'md' | 'json'
  readonly stdout: boolean
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt analyze <session-id> [--output path] [--format md|json] [--stdout]')
  }

  const formatIdx = rest.indexOf('--format')
  const format = formatIdx !== -1 ? (rest[formatIdx + 1] as 'md' | 'json') : 'md'

  const stdout = rest.includes('--stdout')

  const outputIdx = rest.indexOf('--output')
  const altOutputIdx = rest.indexOf('-o')
  const output = outputIdx !== -1
    ? rest[outputIdx + 1]
    : altOutputIdx !== -1
      ? rest[altOutputIdx + 1]
      : undefined

  return { sessionId, output, format, stdout }
}

export async function runAnalyzeCommand(argv: string[]): Promise<void> {
  const args = parseAnalyzeArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)

  const session = await repo.loadSession(args.sessionId)
  if (!session) {
    console.error(`Session not found: ${args.sessionId}`)
    process.exit(1)
  }

  const queries = await repo.loadQueries(args.sessionId)
  const markers = await repo.loadMarkers(args.sessionId)

  const analyzer = new ChunkAnalyzerService()
  const manifest = analyzer.analyze(session, queries, markers)

  if (args.format === 'json' || args.stdout) {
    const json = JSON.stringify(manifest, null, 2)
    if (args.stdout) {
      console.log(json)
      return
    }
    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/manifest.json`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, json, 'utf-8')
    console.log(`Manifest (JSON) written to: ${outPath}`)
    return
  }

  const md = renderManifest(manifest)
  const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/manifest.md`)
  const dir = path.dirname(outPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(outPath, md, 'utf-8')
  console.log(`Manifest written to: ${outPath}`)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test test/unit/Recording/CLI/AnalyzeCommand.test.ts`
Expected: PASS

- [ ] **Step 5: 在 src/index.ts 註冊 analyze 子命令**

在 `src/index.ts` 的 `if (args[0] === 'doctor')` 區塊之後加入：

```typescript
  if (args[0] === 'analyze') {
    const { runAnalyzeCommand } = await import('@/CLI/AnalyzeCommand')
    await runAnalyzeCommand(['analyze', ...args.slice(1)])
    process.exit(0)
  }
```

- [ ] **Step 6: 驗證 TypeScript 編譯**

Run: `bunx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 7: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts test/unit/Recording/CLI/AnalyzeCommand.test.ts src/index.ts
git commit -m "feat: [recording] 新增 archivolt analyze CLI 命令"
```

---

## Task 8: API endpoint — `GET /api/recordings/:id/manifest`

**Files:**
- Modify: `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`
- Modify: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`
- Modify: `src/wiring/recording.ts`

- [ ] **Step 1: 修改 RecordingController 加入 ChunkAnalyzerService 依賴**

在 `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` 的 constructor 加入第三個參數：

```typescript
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'

export class RecordingController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
    private readonly analyzer: ChunkAnalyzerService,
  ) {}
```

- [ ] **Step 2: 新增 getManifest handler**

在 `RecordingController` 中新增方法（放在 `getChunkQueries` 之後）：

```typescript
  async getManifest(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!

    const session = await this.repo.loadSession(id)
    if (!session) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
    }

    const queries = await this.repo.loadQueries(id)
    const markers = await this.repo.loadMarkers(id)
    const manifest = this.analyzer.analyze(session, queries, markers)

    return ctx.json(ApiResponse.success(manifest))
  }
```

- [ ] **Step 3: 註冊路由**

在 `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` 的 `router.group` 內新增：

```typescript
    r.get('/recordings/:id/manifest', (ctx) => controller.getManifest(ctx))
```

放在 `r.get('/recordings/:id/chunks/:chunkId/queries', ...)` 之後。

- [ ] **Step 4: 更新 wiring 注入**

在 `src/wiring/recording.ts` 中加入 `ChunkAnalyzerService` 的建立與注入：

```typescript
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'

export const registerRecording = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const service = core.container.make('recordingService') as RecordingService
  const repo = core.container.make('recordingRepository') as RecordingRepository
  const analyzer = new ChunkAnalyzerService()
  const controller = new RecordingController(service, repo, analyzer)
  registerRecordingRoutes(router, controller)
}
```

- [ ] **Step 5: 驗證 TypeScript 編譯**

Run: `bunx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Presentation/Controllers/RecordingController.ts src/Modules/Recording/Presentation/Routes/Recording.routes.ts src/wiring/recording.ts
git commit -m "feat: [recording] 新增 GET /api/recordings/:id/manifest API endpoint"
```

---

## Task 9: Chrome Extension — describeElement 加上元素文字

**Files:**
- Modify: `extension/src/content.ts:21-28`
- Create: `test/unit/Extension/describeElement.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```typescript
// test/unit/Extension/describeElement.test.ts

import { describe, it, expect } from 'vitest'

// 直接測試函數邏輯（因為 extension content script 依賴 DOM，
// 我們提取純函數版本測試）
function describeElement(tag: string, id: string, classes: string[], textContent: string): string {
  const idPart = id ? `#${id}` : ''
  const clsPart = classes.length > 0 ? `.${classes.slice(0, 2).join('.')}` : ''
  const text = textContent.trim().slice(0, 40)
  const textPart = text ? ` "${text}"` : ''
  return `${tag}${idPart}${clsPart}${textPart}`
}

describe('describeElement', () => {
  it('includes tag, id, class, and text', () => {
    expect(describeElement('button', 'submit-btn', ['primary'], '送出')).toBe(
      'button#submit-btn.primary "送出"',
    )
  })

  it('truncates text to 40 characters', () => {
    const longText = '這是一段很長的文字用來測試截斷邏輯是否正常運作的字串需要超過四十個字'
    const result = describeElement('button', '', [], longText)
    const quoted = result.match(/"(.+)"/)![1]
    expect(quoted.length).toBeLessThanOrEqual(40)
  })

  it('omits text part when text is empty', () => {
    expect(describeElement('div', '', ['icon'], '')).toBe('div.icon')
  })

  it('limits to first 2 classes', () => {
    expect(describeElement('a', '', ['btn', 'primary', 'large'], 'Click')).toBe(
      'a.btn.primary "Click"',
    )
  })

  it('handles element with only tag', () => {
    expect(describeElement('span', '', [], '')).toBe('span')
  })
})
```

- [ ] **Step 2: 執行測試確認通過**

Run: `bun run test test/unit/Extension/describeElement.test.ts`
Expected: PASS（這測試的是純函數邏輯，直接在測試中定義）

- [ ] **Step 3: 更新 extension/src/content.ts 中的 describeElement**

將 `extension/src/content.ts` 第 21-28 行的 `describeElement` 函數替換為：

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

- [ ] **Step 4: 建置 extension 確認無錯誤**

Run: `cd extension && bun run build.ts`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add extension/src/content.ts test/unit/Extension/describeElement.test.ts
git commit -m "feat: [extension] describeElement 加上元素文字（最多 40 字）"
```

---

## Task 10: Chrome Extension — navigate 加上 document.title

**Files:**
- Modify: `extension/src/content.ts:235-250`
- Modify: `extension/src/background.ts:53-63,107-111`

- [ ] **Step 1: 更新 content.ts 的 SPA 導航事件送出 label**

將 `extension/src/content.ts` 第 235-250 行替換為：

```typescript
const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function (...args: Parameters<typeof history.pushState>) {
  originalPushState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  originalReplaceState.apply(this, args)
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
}

window.addEventListener('popstate', () => {
  sendToBackground('SPA_NAVIGATE', { url: location.pathname, label: document.title })
})
```

- [ ] **Step 2: 更新 background.ts 的 sendMarker 接受 label 參數**

在 `extension/src/background.ts` 第 55-63 行，更新 `sendMarker` 函數簽名：

```typescript
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
```

- [ ] **Step 3: 更新 background.ts 的 SPA_NAVIGATE handler**

將 `extension/src/background.ts` 第 107-111 行替換為：

```typescript
  if (message.type === 'SPA_NAVIGATE') {
    if (!state.connected) return false
    if (sender.tab?.id !== state.lockedTabId) return false
    sendMarker(message.url, 'navigate', undefined, undefined, message.label)
    return false
  }
```

- [ ] **Step 4: 更新 background.ts 的 webNavigation listener 加上 tab title**

將 `extension/src/background.ts` 第 67-72 行替換為：

```typescript
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!state.connected) return
  if (details.tabId !== state.lockedTabId) return
  if (details.frameId !== 0) return // main frame only
  const tab = await chrome.tabs.get(details.tabId)
  sendMarker(new URL(details.url).pathname, 'navigate', undefined, undefined, tab.title)
})
```

- [ ] **Step 5: 建置 extension 確認無錯誤**

Run: `cd extension && bun run build.ts`
Expected: 無錯誤

- [ ] **Step 6: Commit**

```bash
git add extension/src/content.ts extension/src/background.ts
git commit -m "feat: [extension] navigate marker 加上 document.title 作為 label"
```

---

## Task 11: Chrome Extension — 捕捉 GET API 呼叫

**Files:**
- Modify: `extension/src/content.ts:137-176,179-231`
- Create: `test/unit/Extension/isApiUrl.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// test/unit/Extension/isApiUrl.test.ts

import { describe, it, expect } from 'vitest'

function isApiUrl(url: string, origin: string = 'http://localhost:3000'): boolean {
  try {
    const pathname = new URL(url, origin).pathname
    return pathname.startsWith('/api/') || pathname.startsWith('/graphql')
  } catch {
    return false
  }
}

describe('isApiUrl', () => {
  it('returns true for /api/ paths', () => {
    expect(isApiUrl('/api/products')).toBe(true)
  })

  it('returns true for /api/ with nested paths', () => {
    expect(isApiUrl('/api/products/123/reviews')).toBe(true)
  })

  it('returns true for /graphql', () => {
    expect(isApiUrl('/graphql')).toBe(true)
  })

  it('returns false for static assets', () => {
    expect(isApiUrl('/static/logo.png')).toBe(false)
  })

  it('returns false for regular page paths', () => {
    expect(isApiUrl('/products')).toBe(false)
  })

  it('returns false for root', () => {
    expect(isApiUrl('/')).toBe(false)
  })

  it('handles full URLs', () => {
    expect(isApiUrl('http://localhost:3000/api/users')).toBe(true)
  })

  it('returns false for malformed URLs', () => {
    expect(isApiUrl('')).toBe(false)
  })
})
```

- [ ] **Step 2: 執行測試確認通過**

Run: `bun run test test/unit/Extension/isApiUrl.test.ts`
Expected: PASS

- [ ] **Step 3: 在 content.ts 新增 isApiUrl 函數**

在 `extension/src/content.ts` 的 `// ── Helpers ──` 區塊末尾（`parseQueryParams` 之後）加入：

```typescript
function isApiUrl(url: string): boolean {
  try {
    const pathname = new URL(url, location.origin).pathname
    return pathname.startsWith('/api/') || pathname.startsWith('/graphql')
  } catch {
    return false
  }
}
```

- [ ] **Step 4: 修改 fetch 攔截以捕捉 GET API 呼叫**

將 `extension/src/content.ts` 中的 fetch 攔截（約第 137-177 行）替換為：

```typescript
const originalFetch = window.fetch
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const isRequest = input instanceof Request
  const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase()

  const shouldCapture = method !== 'GET' || isApiUrl(reqUrl)

  if (shouldCapture) {
    const headers = init?.headers
      ? extractHeadersFromObj(init.headers)
      : isRequest
        ? extractHeadersFromObj((input as Request).headers)
        : undefined

    const bodySource = init?.body !== undefined
      ? init.body
      : isRequest
        ? (input as Request).clone().body
        : null

    const bodyPromise = method === 'GET'
      ? Promise.resolve(undefined)
      : bodySource instanceof ReadableStream
        ? new Response(bodySource).text().then(truncateBody).catch(() => '[unreadable]')
        : extractBody(bodySource as BodyInit | null | undefined)

    bodyPromise.then((body) => {
      const request: RequestDetail = {
        method,
        url: reqUrl,
        headers,
        body,
        queryParams: parseQueryParams(reqUrl),
      }
      sendToBackground('MARKER', {
        url: location.pathname,
        action: 'request',
        target: `${method} ${reqUrl}`,
        request,
      })
    })
  }
  return originalFetch.call(this, input, init)
}
```

- [ ] **Step 5: 修改 XHR 攔截以捕捉 GET API 呼叫**

將 `extension/src/content.ts` 中 `XMLHttpRequest.prototype.send` 的條件判斷改為：

```typescript
XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
  const meta = (this as any).__archivolt
  if (meta) {
    const shouldCapture = meta.method !== 'GET' || isApiUrl(meta.url)

    if (shouldCapture) {
      let bodyStr: string | undefined
      if (meta.method === 'GET') {
        bodyStr = undefined
      } else if (body == null) bodyStr = undefined
      else if (typeof body === 'string') bodyStr = truncateBody(body)
      else if (body instanceof URLSearchParams) bodyStr = truncateBody(body.toString())
      else if (body instanceof FormData) {
        const obj: Record<string, string> = {}
        body.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[File: ${v.name}]` })
        bodyStr = truncateBody(JSON.stringify(obj))
      } else {
        bodyStr = '[binary]'
      }

      const headers = Object.keys(meta.headers).length > 0 ? redactHeaders(meta.headers) : undefined
      const request: RequestDetail = {
        method: meta.method,
        url: meta.url,
        headers,
        body: bodyStr,
        queryParams: parseQueryParams(meta.url),
      }

      sendToBackground('MARKER', {
        url: location.pathname,
        action: 'request',
        target: `${meta.method} ${meta.url}`,
        request,
      })
    }
  }
  return originalXHRSend.call(this, body)
}
```

- [ ] **Step 6: 建置 extension 確認無錯誤**

Run: `cd extension && bun run build.ts`
Expected: 無錯誤

- [ ] **Step 7: Commit**

```bash
git add extension/src/content.ts test/unit/Extension/isApiUrl.test.ts
git commit -m "feat: [extension] 捕捉 GET API 呼叫（/api/*, /graphql）"
```

---

## Task 12: 整合驗證 — fixture 端到端測試

**Files:**
- Create: `test/integration/AnalyzeCommand.test.ts`

- [ ] **Step 1: 寫整合測試**

```typescript
// test/integration/AnalyzeCommand.test.ts

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/recordings/mock-ecommerce')

describe('Operation Manifest — fixture 端到端', () => {
  let session: RecordingSession
  let queries: CapturedQuery[]
  let markers: OperationMarker[]

  beforeAll(() => {
    session = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'session.json'), 'utf-8'))
    queries = readFileSync(path.join(FIXTURE_DIR, 'queries.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line))
    markers = readFileSync(path.join(FIXTURE_DIR, 'markers.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line))
  })

  it('produces a manifest with all chunks', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    expect(manifest.sessionId).toBe('rec_mock_ecommerce')
    expect(manifest.stats.totalChunks).toBeGreaterThan(0)
    expect(manifest.operations.length).toBe(manifest.stats.totalChunks)
  })

  it('table matrix covers all tables in queries', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    const matrixTables = manifest.tableMatrix.map((t) => t.table).sort()
    const queryTables = [...new Set(queries.flatMap((q) => q.tables))].sort()
    expect(matrixTables).toEqual(queryTables)
  })

  it('infers relations from JOIN queries', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    const highRels = manifest.inferredRelations.filter((r) => r.confidence === 'high')
    expect(highRels.length).toBeGreaterThan(0)
    // Should find products → categories from the JOIN query
    expect(highRels.some((r) => r.sourceTable === 'products' && r.targetTable === 'categories')).toBe(true)
  })

  it('renders valid markdown with parseable JSON block', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)
    const md = renderManifest(manifest)

    expect(md).toContain('# Operation Manifest')
    expect(md).toContain('## Operations')
    expect(md).toContain('## Table Involvement Matrix')

    // JSON block should be parseable
    const jsonMatch = md.match(/```json\n([\s\S]+?)\n```/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1])
    expect(parsed.sessionId).toBe('rec_mock_ecommerce')
  })

  it('manifest JSON round-trips correctly', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)
    const json = JSON.stringify(manifest)
    const parsed = JSON.parse(json)
    expect(parsed.sessionId).toBe(manifest.sessionId)
    expect(parsed.stats.totalChunks).toBe(manifest.stats.totalChunks)
  })
})
```

- [ ] **Step 2: 執行整合測試**

Run: `bun run test test/integration/AnalyzeCommand.test.ts`
Expected: PASS

- [ ] **Step 3: 執行全部測試確認無回歸**

Run: `bun run test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add test/integration/AnalyzeCommand.test.ts
git commit -m "test: [recording] 新增 Operation Manifest fixture 端到端測試"
```

---

## 任務執行順序

```
Task 1 (Mock 資料)
  ↓
Task 2 (型別定義)
  ↓
Task 3 (SqlSemanticInferrer) ──┐
Task 4 (RelationInferrer)   ──┤ 可平行
  ↓                           ↓
Task 5 (ChunkAnalyzerService) ← 依賴 Task 3, 4
  ↓
Task 6 (ManifestMarkdownRenderer)
  ↓
Task 7 (CLI analyze) ──────┐
Task 8 (API endpoint) ─────┤ 可平行
  ↓                        ↓
Task 9 (describeElement) ──┐
Task 10 (navigate label) ──┤ 可平行（extension 改善）
Task 11 (GET API 捕捉)  ──┘
  ↓
Task 12 (整合驗證)
```
