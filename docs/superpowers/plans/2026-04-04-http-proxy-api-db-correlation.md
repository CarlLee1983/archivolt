# HTTP Proxy + API↔DB 相關性分析 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Archivolt 內建 HTTP reverse proxy，側錄 API 呼叫並與 DB query patterns 做時間窗口對齊，輸出每個 endpoint 的完整行為模型（DB queries、N+1 候選）。

**Architecture:** Bun HTTP Proxy 捕捉 request/response pairs，寫入 `http_chunks.jsonl`（與現有 `queries.jsonl` 同目錄）；`HttpFlowGrouper` 配對並正規化 path；`UnifiedCorrelationService` 以 500ms 時間窗口將 `ApiCallFlow` 與 `CapturedQuery` 對齊；`ManifestMarkdownRenderer` 延伸以輸出 API 段落。

**Tech Stack:** Bun 1.x, TypeScript, `node:crypto` (SHA256), Vitest (test runner `bun test`)

---

## 檔案結構

### 新建

| 路徑 | 職責 |
|------|------|
| `src/Modules/Recording/Domain/HttpChunk.ts` | `HttpChunk` 型別（request/response JSONL 記錄） |
| `src/Modules/Recording/Domain/ApiCallFlow.ts` | `ApiCallFlow`, `DbOperationRef` 型別 |
| `src/Modules/Recording/Application/Strategies/HttpFlowGrouper.ts` | 配對 HTTP chunks，path normalization，輸出 ApiCallFlow |
| `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts` | 時間窗口對齊 HTTP flows 與 DB queries，N+1 偵測 |
| `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts` | Bun HTTP reverse proxy（`Bun.serve()`） |
| `test/unit/Recording/Application/HttpFlowGrouper.test.ts` | HttpFlowGrouper 單元測試 |
| `test/unit/Recording/Application/UnifiedCorrelationService.test.ts` | UnifiedCorrelationService 單元測試 |
| `test/unit/Recording/Infrastructure/HttpProxy.test.ts` | HttpProxy 整合測試 |
| `test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts` | Repository HTTP chunks 持久化測試 |
| `test/unit/Recording/CLI/RecordCommand.http.test.ts` | CLI 旗標解析測試 |

### 修改

| 路徑 | 修改內容 |
|------|---------|
| `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` | 加入 `appendHttpChunks`, `loadHttpChunks` |
| `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts` | 加入 `renderApiCallFlows`，延伸 `renderManifest` 接受選填 `apiFlows` |
| `src/CLI/RecordCommand.ts` | 加入 `--http-proxy`, `--http-port` 旗標，啟動 `HttpProxyService` |
| `src/CLI/AnalyzeCommand.ts` | 載入 HTTP chunks，執行 flow grouping + correlation，傳入 renderer |

---

## Task 1: 定義 HttpChunk 與 ApiCallFlow 領域型別

**Files:**
- Create: `src/Modules/Recording/Domain/HttpChunk.ts`
- Create: `src/Modules/Recording/Domain/ApiCallFlow.ts`

- [ ] **Step 1: 建立 HttpChunk 型別**

建立 `src/Modules/Recording/Domain/HttpChunk.ts`：

```typescript
export interface HttpChunk {
  readonly type: 'http_request' | 'http_response'
  readonly timestamp: number        // Date.now() 毫秒
  readonly sessionId: string
  readonly requestId: string        // crypto.randomUUID()
  readonly method: string
  readonly url: string              // 完整 URL（含 query string）
  readonly path: string             // pathname only，e.g., "/users/123"
  readonly statusCode?: number      // 僅 http_response 有值
  readonly durationMs?: number      // 僅 http_response 有值
  readonly requestHeaders: Record<string, string>
  readonly responseHeaders?: Record<string, string>  // 僅 http_response
  readonly requestBody?: string
  readonly responseBody?: string
  readonly bodyTruncated?: boolean  // body 超過 10MB 時截斷並設為 true
}
```

- [ ] **Step 2: 建立 ApiCallFlow 與 DbOperationRef 型別**

建立 `src/Modules/Recording/Domain/ApiCallFlow.ts`：

```typescript
export interface DbOperationRef {
  readonly queryHash: string          // 正規化 SQL SHA256 前 16 chars
  readonly offsetMs: number           // 相對於 API call startTimestamp 的延遲
  readonly tableTouched: readonly string[]
  readonly isN1Candidate: boolean     // 同一 requestId 內相同 queryHash 出現 2+ 次
}

export interface ApiCallFlow {
  readonly requestId: string
  readonly sessionId: string
  readonly method: string
  readonly path: string               // 正規化後（/users/123 → /users/:id）
  readonly statusCode: number
  readonly startTimestamp: number     // Date.now() 毫秒
  readonly durationMs: number
  readonly requestBodySize: number
  readonly responseBodySize: number
  readonly dbQueries: readonly DbOperationRef[]
}
```

- [ ] **Step 3: 執行 typecheck 確認型別定義無誤**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run typecheck
```

Expected: 無錯誤（這兩個檔案只有型別，無 import，不會有依賴問題）

- [ ] **Step 4: Commit**

```bash
git add src/Modules/Recording/Domain/HttpChunk.ts src/Modules/Recording/Domain/ApiCallFlow.ts
git commit -m "feat: [recording] 加入 HttpChunk 與 ApiCallFlow 領域型別"
```

---

## Task 2: 延伸 RecordingRepository 支援 HTTP chunk 持久化

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts`
- Create: `test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts`

- [ ] **Step 1: 撰寫失敗測試**

建立 `test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts`：

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

const TEST_DIR = '/tmp/archivolt-test-repo-http'

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
}

afterEach(cleanup)

function makeHttpChunk(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_request',
    timestamp: 1000,
    sessionId: 'rec_1',
    requestId: 'req-abc',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    requestHeaders: { 'content-type': 'application/json' },
    ...overrides,
  }
}

describe('RecordingRepository HTTP chunks', () => {
  it('appendHttpChunks writes to http_chunks.jsonl and loadHttpChunks reads them back', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })

    const chunk1 = makeHttpChunk({ requestId: 'req-1' })
    const chunk2 = makeHttpChunk({ requestId: 'req-2', type: 'http_response', statusCode: 200 })

    await repo.appendHttpChunks('rec_1', [chunk1, chunk2])
    const loaded = await repo.loadHttpChunks('rec_1')

    expect(loaded).toHaveLength(2)
    expect(loaded[0].requestId).toBe('req-1')
    expect(loaded[1].requestId).toBe('req-2')
    expect(loaded[1].statusCode).toBe(200)
  })

  it('loadHttpChunks returns empty array when file does not exist', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })
    const loaded = await repo.loadHttpChunks('rec_1')
    expect(loaded).toEqual([])
  })

  it('appendHttpChunks is idempotent — multiple calls append, not overwrite', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })

    await repo.appendHttpChunks('rec_1', [makeHttpChunk({ requestId: 'a' })])
    await repo.appendHttpChunks('rec_1', [makeHttpChunk({ requestId: 'b' })])

    const loaded = await repo.loadHttpChunks('rec_1')
    expect(loaded).toHaveLength(2)
    expect(loaded.map(c => c.requestId)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts
```

Expected: FAIL — `appendHttpChunks is not a function`

- [ ] **Step 3: 實作 appendHttpChunks 與 loadHttpChunks**

在 `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` 加入以下方法（在 `listSessions` 之前）：

```typescript
// 在現有 import 後加入
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

// 在 class 內部，appendMarkers 方法之後加入：

  private httpChunksFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'http_chunks.jsonl')
  }

  async appendHttpChunks(sessionId: string, chunks: readonly HttpChunk[]): Promise<void> {
    if (chunks.length === 0) return
    const lines = chunks.map((c) => JSON.stringify(c)).join('\n') + '\n'
    const filePath = this.httpChunksFile(sessionId)
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing + lines, 'utf-8')
  }

  async loadHttpChunks(sessionId: string): Promise<HttpChunk[]> {
    const filePath = this.httpChunksFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as HttpChunk)
  }
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts
```

Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts test/unit/Recording/Infrastructure/RecordingRepository.http.test.ts
git commit -m "feat: [recording] RecordingRepository 加入 HTTP chunk 持久化方法"
```

---

## Task 3: 實作 HttpFlowGrouper（path normalization + request/response 配對）

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/HttpFlowGrouper.ts`
- Create: `test/unit/Recording/Application/HttpFlowGrouper.test.ts`

- [ ] **Step 1: 撰寫失敗測試**

建立 `test/unit/Recording/Application/HttpFlowGrouper.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { normalizePath, pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

function makeRequest(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_request',
    timestamp: 1000,
    sessionId: 'rec_1',
    requestId: 'req-1',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    requestHeaders: {},
    ...overrides,
  }
}

function makeResponse(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_response',
    timestamp: 1050,
    sessionId: 'rec_1',
    requestId: 'req-1',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    statusCode: 200,
    durationMs: 50,
    requestHeaders: {},
    responseHeaders: {},
    ...overrides,
  }
}

describe('normalizePath', () => {
  it('replaces numeric segments with :id', () => {
    expect(normalizePath('/users/123')).toBe('/users/:id')
    expect(normalizePath('/orders/456/items')).toBe('/orders/:id/items')
  })

  it('replaces UUID segments with :uuid', () => {
    expect(normalizePath('/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/users/:uuid')
  })

  it('leaves non-dynamic segments unchanged', () => {
    expect(normalizePath('/users')).toBe('/users')
    expect(normalizePath('/api/v1/users')).toBe('/api/v1/users')
  })

  it('handles mixed segments', () => {
    expect(normalizePath('/users/123/orders/456')).toBe('/users/:id/orders/:id')
  })

  it('handles root path', () => {
    expect(normalizePath('/')).toBe('/')
  })
})

describe('pairHttpChunks', () => {
  it('pairs request and response by requestId', () => {
    const req = makeRequest({ requestId: 'req-1', timestamp: 1000, method: 'GET', path: '/users/123' })
    const res = makeResponse({ requestId: 'req-1', timestamp: 1050, statusCode: 200, durationMs: 50 })
    const flows = pairHttpChunks([req, res])
    expect(flows).toHaveLength(1)
    expect(flows[0].requestId).toBe('req-1')
    expect(flows[0].method).toBe('GET')
    expect(flows[0].path).toBe('/users/:id')
    expect(flows[0].statusCode).toBe(200)
    expect(flows[0].durationMs).toBe(50)
    expect(flows[0].startTimestamp).toBe(1000)
    expect(flows[0].dbQueries).toEqual([])
  })

  it('skips requests with no matching response', () => {
    const req = makeRequest({ requestId: 'req-orphan' })
    const flows = pairHttpChunks([req])
    expect(flows).toHaveLength(0)
  })

  it('handles multiple request-response pairs sorted by startTimestamp', () => {
    const req1 = makeRequest({ requestId: 'req-1', timestamp: 2000 })
    const res1 = makeResponse({ requestId: 'req-1', timestamp: 2050, durationMs: 50 })
    const req2 = makeRequest({ requestId: 'req-2', timestamp: 1000, path: '/orders/99' })
    const res2 = makeResponse({ requestId: 'req-2', timestamp: 1030, durationMs: 30, path: '/orders/99' })

    const flows = pairHttpChunks([req1, res1, req2, res2])
    expect(flows).toHaveLength(2)
    expect(flows[0].startTimestamp).toBe(1000)  // sorted ascending
    expect(flows[1].startTimestamp).toBe(2000)
  })

  it('normalizes path in the flow', () => {
    const req = makeRequest({ requestId: 'req-1', path: '/orders/789/items' })
    const res = makeResponse({ requestId: 'req-1' })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].path).toBe('/orders/:id/items')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/HttpFlowGrouper.test.ts
```

Expected: FAIL — `Cannot find module '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'`

- [ ] **Step 3: 實作 HttpFlowGrouper**

建立 `src/Modules/Recording/Application/Strategies/HttpFlowGrouper.ts`：

```typescript
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'

/**
 * 正規化 URL path 中的動態 segment：
 * 1. UUID（36 chars）→ :uuid
 * 2. 純數字 → :id
 * 其餘保留原值
 */
export function normalizePath(rawPath: string): string {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const NUMERIC_RE = /^\d+$/

  return rawPath
    .split('/')
    .map((seg) => {
      if (UUID_RE.test(seg)) return ':uuid'
      if (NUMERIC_RE.test(seg) && seg.length > 0) return ':id'
      return seg
    })
    .join('/')
}

/**
 * 將 HttpChunk[] 配對成 ApiCallFlow[]
 * - 按 requestId 配對 request / response
 * - 無匹配 response 的 request 略過（錄製中斷時）
 * - 結果按 startTimestamp 升冪排列
 */
export function pairHttpChunks(chunks: readonly HttpChunk[]): readonly ApiCallFlow[] {
  const requests = new Map<string, HttpChunk>()
  const responses = new Map<string, HttpChunk>()

  for (const chunk of chunks) {
    if (chunk.type === 'http_request') {
      requests.set(chunk.requestId, chunk)
    } else {
      responses.set(chunk.requestId, chunk)
    }
  }

  const flows: ApiCallFlow[] = []

  for (const [requestId, req] of requests) {
    const res = responses.get(requestId)
    if (!res) continue

    flows.push({
      requestId,
      sessionId: req.sessionId,
      method: req.method,
      path: normalizePath(req.path),
      statusCode: res.statusCode ?? 0,
      startTimestamp: req.timestamp,
      durationMs: res.durationMs ?? 0,
      requestBodySize: req.requestBody?.length ?? 0,
      responseBodySize: res.responseBody?.length ?? 0,
      dbQueries: [],
    })
  }

  return flows.sort((a, b) => a.startTimestamp - b.startTimestamp)
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/HttpFlowGrouper.test.ts
```

Expected: PASS — 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/HttpFlowGrouper.ts test/unit/Recording/Application/HttpFlowGrouper.test.ts
git commit -m "feat: [recording] 實作 HttpFlowGrouper（path normalization + request/response 配對）"
```

---

## Task 4: 實作 UnifiedCorrelationService（SQL hash + 時間窗口對齊）

**Files:**
- Create: `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts`
- Create: `test/unit/Recording/Application/UnifiedCorrelationService.test.ts`

- [ ] **Step 1: 撰寫失敗測試**

建立 `test/unit/Recording/Application/UnifiedCorrelationService.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import {
  computeQueryHash,
  correlate,
} from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeFlow(overrides: Partial<ApiCallFlow> = {}): ApiCallFlow {
  return {
    requestId: 'req-1',
    sessionId: 'rec_1',
    method: 'GET',
    path: '/users/:id',
    statusCode: 200,
    startTimestamp: 1000,
    durationMs: 50,
    requestBodySize: 0,
    responseBodySize: 100,
    dbQueries: [],
    ...overrides,
  }
}

function makeQuery(overrides: Partial<CapturedQuery> = {}): CapturedQuery {
  return {
    id: 'q_1',
    sessionId: 'rec_1',
    connectionId: 1,
    timestamp: 1010,
    duration: 2,
    sql: 'SELECT * FROM users WHERE id = 123',
    operation: 'SELECT',
    tables: ['users'],
    ...overrides,
  }
}

describe('computeQueryHash', () => {
  it('strips numeric parameters and produces consistent hash', () => {
    const h1 = computeQueryHash('SELECT * FROM users WHERE id = 123')
    const h2 = computeQueryHash('SELECT * FROM users WHERE id = 456')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(16)
  })

  it('strips string parameters', () => {
    const h1 = computeQueryHash("SELECT * FROM users WHERE name = 'Alice'")
    const h2 = computeQueryHash("SELECT * FROM users WHERE name = 'Bob'")
    expect(h1).toBe(h2)
  })

  it('strips IN lists', () => {
    const h1 = computeQueryHash('SELECT * FROM orders WHERE id IN (1, 2, 3)')
    const h2 = computeQueryHash('SELECT * FROM orders WHERE id IN (4, 5, 6, 7)')
    expect(h1).toBe(h2)
  })

  it('produces different hash for structurally different queries', () => {
    const h1 = computeQueryHash('SELECT * FROM users WHERE id = 1')
    const h2 = computeQueryHash('SELECT * FROM orders WHERE id = 1')
    expect(h1).not.toBe(h2)
  })
})

describe('correlate', () => {
  it('associates queries within the time window to the matching flow', () => {
    const flow = makeFlow({ startTimestamp: 1000, durationMs: 50 })
    const query = makeQuery({ timestamp: 1020, sql: 'SELECT * FROM users WHERE id = 1', tables: ['users'] })

    const result = correlate([flow], [query])

    expect(result).toHaveLength(1)
    expect(result[0].dbQueries).toHaveLength(1)
    expect(result[0].dbQueries[0].tableTouched).toEqual(['users'])
    expect(result[0].dbQueries[0].offsetMs).toBe(20)
    expect(result[0].dbQueries[0].isN1Candidate).toBe(false)
  })

  it('excludes queries outside the time window', () => {
    const flow = makeFlow({ startTimestamp: 1000, durationMs: 50 })
    const queryBefore = makeQuery({ timestamp: 400 })   // 600ms before window start
    const queryAfter = makeQuery({ timestamp: 2000 })   // 1450ms after flow end

    const result = correlate([flow], [queryBefore, queryAfter])
    expect(result[0].dbQueries).toHaveLength(0)
  })

  it('detects N+1 when same query hash appears 2+ times', () => {
    const flow = makeFlow({ startTimestamp: 1000, durationMs: 100 })
    const q1 = makeQuery({ id: 'q1', timestamp: 1010, sql: 'SELECT * FROM orders WHERE user_id = 1' })
    const q2 = makeQuery({ id: 'q2', timestamp: 1020, sql: 'SELECT * FROM orders WHERE user_id = 2' })
    const q3 = makeQuery({ id: 'q3', timestamp: 1030, sql: 'SELECT * FROM orders WHERE user_id = 3' })

    const result = correlate([flow], [q1, q2, q3])

    expect(result[0].dbQueries).toHaveLength(3)
    expect(result[0].dbQueries.every(q => q.isN1Candidate)).toBe(true)
  })

  it('does not flag N+1 for single occurrence of a query hash', () => {
    const flow = makeFlow({ startTimestamp: 1000, durationMs: 100 })
    const q1 = makeQuery({ timestamp: 1010, sql: 'SELECT * FROM users WHERE id = 1' })
    const q2 = makeQuery({ timestamp: 1020, sql: 'SELECT * FROM orders WHERE id = 2' })

    const result = correlate([flow], [q1, q2])

    expect(result[0].dbQueries).toHaveLength(2)
    expect(result[0].dbQueries.every(q => q.isN1Candidate)).toBe(false)
  })

  it('handles multiple flows independently', () => {
    const flow1 = makeFlow({ requestId: 'req-1', startTimestamp: 1000, durationMs: 50 })
    const flow2 = makeFlow({ requestId: 'req-2', startTimestamp: 5000, durationMs: 50 })
    const q1 = makeQuery({ timestamp: 1010 })   // belongs to flow1
    const q2 = makeQuery({ timestamp: 5010 })   // belongs to flow2

    const result = correlate([flow1, flow2], [q1, q2])

    expect(result[0].dbQueries).toHaveLength(1)
    expect(result[1].dbQueries).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/UnifiedCorrelationService.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: 實作 UnifiedCorrelationService**

建立 `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts`：

```typescript
import { createHash } from 'node:crypto'
import type { ApiCallFlow, DbOperationRef } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

const DEFAULT_WINDOW_MS = 500

/**
 * 將 SQL 正規化並計算 SHA256 前 16 chars：
 * 1. 移除 IN 列表內容（整個 IN(...)→IN(?)）
 * 2. 將單引號字串替換為 ?
 * 3. 將數字常數替換為 ?
 * 4. 正規化空白，全部小寫
 * 5. SHA256 hex → 前 16 chars
 */
export function computeQueryHash(sql: string): string {
  let normalized = sql
    .replace(/IN\s*\([^)]*\)/gi, 'IN (?)')       // IN lists
    .replace(/'[^']*'/g, '?')                      // 單引號字串
    .replace(/\b\d+\b/g, '?')                      // 數字常數
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * 將每個 ApiCallFlow 與時間窗口內的 CapturedQuery 關聯：
 * - 窗口：[flow.startTimestamp - windowMs, flow.startTimestamp + flow.durationMs + windowMs]
 * - N+1 偵測：同一 flow 內相同 queryHash 出現 ≥ 2 次
 */
export function correlate(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
  windowMs: number = DEFAULT_WINDOW_MS,
): readonly ApiCallFlow[] {
  return flows.map((flow) => {
    const windowStart = flow.startTimestamp - windowMs
    const windowEnd = flow.startTimestamp + flow.durationMs + windowMs

    const relatedQueries = queries.filter(
      (q) => q.timestamp >= windowStart && q.timestamp <= windowEnd,
    )

    // 統計各 queryHash 出現次數（用於 N+1 偵測）
    const hashCounts = new Map<string, number>()
    for (const q of relatedQueries) {
      const hash = computeQueryHash(q.sql)
      hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1)
    }

    const dbQueries: DbOperationRef[] = relatedQueries.map((q) => {
      const hash = computeQueryHash(q.sql)
      return {
        queryHash: hash,
        offsetMs: q.timestamp - flow.startTimestamp,
        tableTouched: [...q.tables],
        isN1Candidate: (hashCounts.get(hash) ?? 0) >= 2,
      }
    })

    return { ...flow, dbQueries }
  })
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/UnifiedCorrelationService.test.ts
```

Expected: PASS — 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts test/unit/Recording/Application/UnifiedCorrelationService.test.ts
git commit -m "feat: [recording] 實作 UnifiedCorrelationService（SQL hash + 時間窗口 API↔DB 對齊）"
```

---

## Task 5: 實作 HttpProxyService（Bun HTTP reverse proxy）

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts`
- Create: `test/unit/Recording/Infrastructure/HttpProxy.test.ts`

- [ ] **Step 1: 撰寫失敗測試**

建立 `test/unit/Recording/Infrastructure/HttpProxy.test.ts`：

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { HttpProxyService } from '@/Modules/Recording/Infrastructure/Proxy/HttpProxy'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

let proxy: HttpProxyService | undefined
let mockServer: ReturnType<typeof Bun.serve> | undefined

afterEach(() => {
  proxy?.stop()
  mockServer?.stop(true)
  proxy = undefined
  mockServer = undefined
})

function findFreePort(): number {
  // 使用 0 讓 OS 分配，然後讀取實際 port
  const server = Bun.serve({ port: 0, fetch: () => new Response('') })
  const port = server.port
  server.stop(true)
  return port
}

describe('HttpProxyService', () => {
  it('captures request and response chunks when proxying', async () => {
    const targetPort = findFreePort()
    const proxyPort = findFreePort()

    // 啟動 mock target server
    mockServer = Bun.serve({
      port: targetPort,
      fetch(req) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const capturedChunks: HttpChunk[] = []

    proxy = new HttpProxyService({
      listenPort: proxyPort,
      targetUrl: `http://localhost:${targetPort}`,
      sessionId: 'rec_test',
      onChunk: async (chunks) => {
        capturedChunks.push(...chunks)
      },
    })

    await proxy.start()

    // 透過 proxy 發送請求
    const res = await fetch(`http://localhost:${proxyPort}/api/users/123`)
    expect(res.status).toBe(200)

    // 等待 onChunk 被呼叫
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedChunks).toHaveLength(2)

    const reqChunk = capturedChunks.find((c) => c.type === 'http_request')
    const resChunk = capturedChunks.find((c) => c.type === 'http_response')

    expect(reqChunk).toBeDefined()
    expect(reqChunk?.method).toBe('GET')
    expect(reqChunk?.path).toBe('/api/users/123')
    expect(reqChunk?.sessionId).toBe('rec_test')
    expect(reqChunk?.requestId).toBeDefined()

    expect(resChunk).toBeDefined()
    expect(resChunk?.statusCode).toBe(200)
    expect(resChunk?.durationMs).toBeGreaterThanOrEqual(0)
    expect(resChunk?.requestId).toBe(reqChunk?.requestId)
  })

  it('returns the target response body to the caller', async () => {
    const targetPort = findFreePort()
    const proxyPort = findFreePort()

    mockServer = Bun.serve({
      port: targetPort,
      fetch() {
        return new Response('hello world', { status: 201 })
      },
    })

    proxy = new HttpProxyService({
      listenPort: proxyPort,
      targetUrl: `http://localhost:${targetPort}`,
      sessionId: 'rec_2',
      onChunk: async () => {},
    })
    await proxy.start()

    const res = await fetch(`http://localhost:${proxyPort}/`)
    const body = await res.text()

    expect(res.status).toBe(201)
    expect(body).toBe('hello world')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/HttpProxy.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: 實作 HttpProxyService**

建立 `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts`：

```typescript
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

const MAX_BODY_SIZE = 10 * 1024 * 1024  // 10MB

export interface HttpProxyConfig {
  readonly listenPort: number
  readonly targetUrl: string    // e.g., "http://localhost:3000"
  readonly sessionId: string
  readonly onChunk: (chunks: HttpChunk[]) => Promise<void>
}

function shouldCaptureBody(headers: Headers): boolean {
  const ct = headers.get('content-type') ?? ''
  return ct.includes('application/json') || ct.includes('text/')
}

async function readBodyText(
  buffer: ArrayBuffer,
  headers: Headers,
): Promise<{ text: string; truncated: boolean }> {
  if (!shouldCaptureBody(headers)) return { text: '', truncated: false }
  if (buffer.byteLength > MAX_BODY_SIZE) {
    return {
      text: new TextDecoder().decode(buffer.slice(0, 1000)) + '...[truncated]',
      truncated: true,
    }
  }
  return { text: new TextDecoder().decode(buffer), truncated: false }
}

export class HttpProxyService {
  private server?: ReturnType<typeof Bun.serve>

  constructor(private readonly config: HttpProxyConfig) {}

  get port(): number {
    return this.server?.port ?? this.config.listenPort
  }

  async start(): Promise<void> {
    const { targetUrl, sessionId, onChunk } = this.config

    this.server = Bun.serve({
      port: this.config.listenPort,
      async fetch(req) {
        const requestId = crypto.randomUUID()
        const startMs = Date.now()

        // 讀取 request body
        const reqBuffer = await req.arrayBuffer()
        const { text: reqBody, truncated: reqTruncated } = await readBodyText(
          reqBuffer,
          req.headers,
        )

        const url = new URL(req.url)
        const targetFullUrl = targetUrl + url.pathname + url.search

        const requestChunk: HttpChunk = {
          type: 'http_request',
          timestamp: startMs,
          sessionId,
          requestId,
          method: req.method,
          url: req.url,
          path: url.pathname,
          requestHeaders: Object.fromEntries(req.headers.entries()),
          requestBody: reqBody || undefined,
          bodyTruncated: reqTruncated || undefined,
        }

        // 轉發到 target
        let targetResponse: Response
        try {
          targetResponse = await fetch(targetFullUrl, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : reqBuffer,
          })
        } catch (err) {
          // target 不可達時回傳 502
          await onChunk([requestChunk])
          return new Response('Bad Gateway', { status: 502 })
        }

        const endMs = Date.now()
        const durationMs = endMs - startMs

        // 讀取 response body
        const resBuffer = await targetResponse.arrayBuffer()
        const { text: resBody, truncated: resTruncated } = await readBodyText(
          resBuffer,
          targetResponse.headers,
        )

        const responseChunk: HttpChunk = {
          type: 'http_response',
          timestamp: endMs,
          sessionId,
          requestId,
          method: req.method,
          url: req.url,
          path: url.pathname,
          statusCode: targetResponse.status,
          durationMs,
          requestHeaders: Object.fromEntries(req.headers.entries()),
          responseHeaders: Object.fromEntries(targetResponse.headers.entries()),
          responseBody: resBody || undefined,
          bodyTruncated: resTruncated || undefined,
        }

        await onChunk([requestChunk, responseChunk])

        return new Response(resBuffer, {
          status: targetResponse.status,
          headers: targetResponse.headers,
        })
      },
    })
  }

  stop(): void {
    this.server?.stop(true)
    this.server = undefined
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/HttpProxy.test.ts
```

Expected: PASS — 2 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts test/unit/Recording/Infrastructure/HttpProxy.test.ts
git commit -m "feat: [recording] 實作 HttpProxyService（Bun HTTP reverse proxy）"
```

---

## Task 6: 延伸 ManifestMarkdownRenderer 加入 API 段落

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts`

> 此 task 為 renderer 純邏輯延伸，測試透過現有 snapshot 或手動驗證即可。函數簽名向後相容（`apiFlows` 為選填參數）。

- [ ] **Step 1: 加入 API import 與 renderApiCallFlow 函數**

在 `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts` 的最頂部 import 後加入：

```typescript
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
```

在 `renderFlow` 函數之後、`renderManifest` 之前加入：

```typescript
function renderApiCallFlow(flow: ApiCallFlow, index: number): string {
  const lines: string[] = []
  lines.push(`### API ${index + 1}: ${flow.method} ${flow.path}`)
  lines.push(`- **Status**: ${flow.statusCode}`)
  lines.push(`- **Duration**: ${flow.durationMs}ms`)
  lines.push(`- **DB Queries**: ${flow.dbQueries.length}`)

  const n1Queries = flow.dbQueries.filter((q) => q.isN1Candidate)
  if (n1Queries.length > 0) {
    const uniqueN1 = new Set(n1Queries.map((q) => q.queryHash))
    lines.push(`- **N+1 偵測**: ${uniqueN1.size} 個 query pattern 重複出現`)
  }

  const allTables = [...new Set(flow.dbQueries.flatMap((q) => q.tableTouched))].sort()
  if (allTables.length > 0) {
    lines.push(`- **Tables Touched**: ${allTables.map((t) => `\`${t}\``).join(', ')}`)
  }

  if (flow.dbQueries.length > 0) {
    lines.push('- **Query Timeline**:')
    for (const q of flow.dbQueries) {
      const n1Label = q.isN1Candidate ? ' ⚠️ N+1' : ''
      const tables = q.tableTouched.join(', ')
      lines.push(`  - \`${q.queryHash}\` +${q.offsetMs}ms [${tables}]${n1Label}`)
    }
  }

  return lines.join('\n')
}
```

- [ ] **Step 2: 延伸 renderManifest 簽名，加入 API 段落**

將 `renderManifest` 函數的簽名從：

```typescript
export function renderManifest(manifest: OperationManifest): string {
```

改為：

```typescript
export function renderManifest(
  manifest: OperationManifest,
  apiFlows?: readonly ApiCallFlow[],
): string {
```

在 `renderManifest` 函數內部，找到「`## Table Involvement Matrix`」段落之前、「`## Bootstrap`」段落之後（即 `sections.push('')` 後面），插入 API 段落：

```typescript
  if (apiFlows && apiFlows.length > 0) {
    sections.push('## API Call Flows')
    sections.push('')
    sections.push(
      `> ${apiFlows.length} 個 HTTP request，已對應 DB query patterns（時間窗口 500ms）`,
    )
    sections.push('')
    for (let i = 0; i < apiFlows.length; i++) {
      sections.push(renderApiCallFlow(apiFlows[i], i))
      sections.push('')
    }
  }
```

具體插入位置：在 `sections.push('## Bootstrap (Pre-Navigation)')` 區塊（包含 3 行 bootstrap 內容和最後的 `sections.push('')`）之後，在 `sections.push('## Table Involvement Matrix')` 之前。

- [ ] **Step 3: 執行 typecheck 與全部測試確認無迴歸**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run typecheck && bun run test
```

Expected: typecheck PASS，所有既有測試 PASS（`renderManifest` 第二參數為選填，不破壞現有呼叫）

- [ ] **Step 4: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts
git commit -m "feat: [recording] ManifestMarkdownRenderer 加入 API Call Flows 段落"
```

---

## Task 7: 延伸 RecordCommand CLI 加入 --http-proxy 旗標

**Files:**
- Modify: `src/CLI/RecordCommand.ts`
- Create: `test/unit/Recording/CLI/RecordCommand.http.test.ts`

- [ ] **Step 1: 撰寫失敗測試**

建立 `test/unit/Recording/CLI/RecordCommand.http.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { parseRecordArgs } from '@/CLI/RecordCommand'

describe('parseRecordArgs HTTP proxy flags', () => {
  it('parses --http-proxy flag', () => {
    const args = parseRecordArgs([
      'record', 'start',
      '--target', 'localhost:3306',
      '--http-proxy', 'http://localhost:3000',
    ])
    expect(args.httpProxyTarget).toBe('http://localhost:3000')
    expect(args.httpProxyPort).toBe(4000)  // default
  })

  it('parses --http-port flag', () => {
    const args = parseRecordArgs([
      'record', 'start',
      '--target', 'localhost:3306',
      '--http-proxy', 'http://localhost:8080',
      '--http-port', '5000',
    ])
    expect(args.httpProxyTarget).toBe('http://localhost:8080')
    expect(args.httpProxyPort).toBe(5000)
  })

  it('httpProxyTarget is undefined when --http-proxy not provided', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.httpProxyTarget).toBeUndefined()
    expect(args.httpProxyPort).toBe(4000)  // default still set
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/CLI/RecordCommand.http.test.ts
```

Expected: FAIL — `args.httpProxyTarget` is undefined / property doesn't exist

- [ ] **Step 3: 延伸 RecordArgs 型別與 parseRecordArgs**

在 `src/CLI/RecordCommand.ts` 的 `RecordArgs` 介面中加入：

```typescript
export interface RecordArgs {
  readonly subcommand: 'start' | 'stop' | 'status' | 'list' | 'summary'
  readonly targetHost?: string
  readonly targetPort?: number
  readonly listenPort: number
  readonly fromEnv?: string
  readonly sessionId?: string
  readonly protocol?: 'mysql' | 'postgres'
  readonly httpProxyTarget?: string   // e.g., "http://localhost:3000"
  readonly httpProxyPort: number      // default 4000
}
```

在 `parseRecordArgs` 函數末尾的 `return` 之前，加入解析邏輯：

```typescript
  const httpProxyIdx = rest.indexOf('--http-proxy')
  const httpProxyTarget = httpProxyIdx !== -1 ? rest[httpProxyIdx + 1] : undefined

  const httpPortIdx = rest.indexOf('--http-port')
  const httpProxyPort =
    httpPortIdx !== -1 ? Number.parseInt(rest[httpPortIdx + 1], 10) : 4000

  return { subcommand, targetHost, targetPort, listenPort, fromEnv, sessionId, protocol, httpProxyTarget, httpProxyPort }
```

（替換原本的 `return { subcommand, targetHost, targetPort, listenPort, fromEnv, sessionId, protocol }` 一行）

- [ ] **Step 4: 延伸 runRecordCommand case 'start' 以啟動 HTTP proxy**

在 `runRecordCommand` 的 `case 'start':` 區塊中，於 `const session = await service.start(...)` 之後，`console.log(...)` 之前，加入：

```typescript
      // HTTP Proxy（選填）
      let httpProxy: import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy').HttpProxyService | undefined
      if (args.httpProxyTarget) {
        const { HttpProxyService } = await import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy')
        httpProxy = new HttpProxyService({
          listenPort: args.httpProxyPort,
          targetUrl: args.httpProxyTarget,
          sessionId: session.id,
          onChunk: async (chunks) => {
            await repo.appendHttpChunks(session.id, chunks)
          },
        })
        await httpProxy.start()
      }
```

在現有的 `console.log(...)` 輸出中，在 `Press Ctrl+C to stop recording.` 之前，加入 HTTP proxy 資訊：

```typescript
      console.log(`
Recording Started

Session:  ${session.id}
Protocol: ${protocol}
DB Proxy: 127.0.0.1:${service.proxyPort} → ${targetHost}:${targetPort}
${httpProxy ? `HTTP Proxy: http://127.0.0.1:${args.httpProxyPort} → ${args.httpProxyTarget}` : ''}
Point your application's DB connection to 127.0.0.1:${service.proxyPort}
${httpProxy ? `Point your HTTP traffic to http://127.0.0.1:${args.httpProxyPort}` : ''}
Press Ctrl+C to stop recording.
`)
```

在 `process.on('SIGINT', ...)` 的 handler 中，在 `const stopped = await service.stop()` 之後加入：

```typescript
        httpProxy?.stop()
```

- [ ] **Step 5: 執行 CLI 測試確認通過**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/CLI/RecordCommand.http.test.ts
```

Expected: PASS — 3 tests pass

- [ ] **Step 6: 執行全部測試確認無迴歸**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run check
```

Expected: typecheck + lint + test 全部通過

- [ ] **Step 7: Commit**

```bash
git add src/CLI/RecordCommand.ts test/unit/Recording/CLI/RecordCommand.http.test.ts
git commit -m "feat: [recording] RecordCommand 加入 --http-proxy / --http-port 旗標與 HttpProxyService 整合"
```

---

## Task 8: 延伸 AnalyzeCommand 輸出統一 API↔DB 分析結果

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`

- [ ] **Step 1: 在 AnalyzeCommand 載入 HTTP chunks 並執行 correlation**

將 `src/CLI/AnalyzeCommand.ts` 的 import 區塊延伸：

```typescript
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import { pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import { correlate } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'
```

在 `runAnalyzeCommand` 函數的 `const manifest = analyzer.analyze(session, queries, markers)` 之後、`if (args.format === 'json' || args.stdout)` 之前加入：

```typescript
  // HTTP proxy 資料（選填，不存在時略過）
  const httpChunks = await repo.loadHttpChunks(args.sessionId)
  const apiFlows = httpChunks.length > 0
    ? correlate(pairHttpChunks(httpChunks), queries)
    : undefined
```

- [ ] **Step 2: 傳入 apiFlows 給 renderManifest**

將：

```typescript
  const md = renderManifest(manifest)
```

改為：

```typescript
  const md = renderManifest(manifest, apiFlows)
```

對於 JSON 格式輸出，在 `if (args.format === 'json' || args.stdout)` 區塊中，將：

```typescript
    const json = JSON.stringify(manifest, null, 2)
```

改為：

```typescript
    const output = apiFlows ? { ...manifest, apiFlows } : manifest
    const json = JSON.stringify(output, null, 2)
```

- [ ] **Step 3: 執行 typecheck 與全部測試**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run check
```

Expected: typecheck + lint + test 全部通過

- [ ] **Step 4: 手動驗證 analyze 輸出包含 API 段落（有 HTTP chunks 時）**

```bash
# 建立假的 session 目錄
mkdir -p /tmp/test-session/rec_test
echo '{"id":"rec_test","startedAt":1000,"status":"stopped","proxy":{"listenPort":13306,"targetHost":"localhost","targetPort":3306},"stats":{"totalQueries":0,"byOperation":{},"tablesAccessed":[],"connectionCount":0}}' > /tmp/test-session/rec_test/session.json
echo '' > /tmp/test-session/rec_test/queries.jsonl
echo '' > /tmp/test-session/rec_test/markers.jsonl

# 寫入假的 http_chunks.jsonl
echo '{"type":"http_request","timestamp":1010,"sessionId":"rec_test","requestId":"req-1","method":"GET","url":"http://localhost:4000/users/123","path":"/users/123","requestHeaders":{}}' > /tmp/test-session/rec_test/http_chunks.jsonl
echo '{"type":"http_response","timestamp":1060,"sessionId":"rec_test","requestId":"req-1","method":"GET","url":"http://localhost:4000/users/123","path":"/users/123","statusCode":200,"durationMs":50,"requestHeaders":{},"responseHeaders":{}}' >> /tmp/test-session/rec_test/http_chunks.jsonl

ARCHIVOLT_RECORDINGS_DIR=/tmp/test-session bun run src/index.ts analyze rec_test --stdout
```

Expected: 輸出包含 `## API Call Flows` 段落，顯示 `GET /users/:id` 的分析結果

- [ ] **Step 5: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts
git commit -m "feat: [recording] AnalyzeCommand 整合 HTTP flow grouping 與 API↔DB correlation 輸出"
```

---

## 自我審查（Spec Coverage Check）

| Spec 需求 | 對應 Task |
|-----------|-----------|
| HTTP reverse proxy（Bun 原生） | Task 5 HttpProxyService |
| HttpChunk 型別（request/response JSONL） | Task 1 |
| ApiCallFlow 型別（method, path, statusCode, durationMs, dbQueries） | Task 1 |
| DbOperationRef（queryHash, offsetMs, tableTouched, isN1Candidate） | Task 1 |
| Path normalization（/123→/:id, UUID→/:uuid） | Task 3 normalizePath |
| Request/response 配對（by requestId） | Task 3 pairHttpChunks |
| `--http-proxy <target-url>` CLI 旗標 | Task 7 |
| `--http-port <port>` CLI 旗標（default 4000） | Task 7 |
| HTTP chunks 寫入 `http_chunks.jsonl` | Task 2 + Task 5 |
| QueryHash 演算法（IN 列表 + 字串 + 數字 → SHA256 前 16 chars） | Task 4 computeQueryHash |
| 時間窗口對齊 500ms | Task 4 correlate |
| N+1 偵測（same queryHash ≥ 2 次） | Task 4 correlate |
| Body size cap 10MB + bodyTruncated 旗標 | Task 5 readBodyText |
| Streaming SSE/WebSocket 略過 body | 設計 v1 選擇了不偵測；HttpProxy 已透過 ArrayBuffer read 方式處理（非 streaming） |
| ManifestMarkdownRenderer 加入 API 段落 | Task 6 |
| AnalyzeCommand 整合 | Task 8 |
| 與現有 ChunkAnalyzerService 相容（不破壞既有介面） | Task 6 renderManifest 第二參數為選填 |
| SessionId 共用（DB + HTTP） | Task 5 HttpProxyService config，Task 7 RecordCommand 傳入 session.id |
| 輸出「API call → DB queries」flow | Task 4 correlate + Task 6 renderApiCallFlow |
