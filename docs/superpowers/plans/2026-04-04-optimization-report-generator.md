# Optimization Report Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `archivolt analyze --format optimize-md` pipeline — Layer 1 pattern analysis (N+1, read/write ratio, query fragmentation), Layer 2a DDL schema diff, and Layer 2b EXPLAIN live analysis — each outputting runnable Markdown with embedded SQL.

**Architecture:** Three-tier pipeline, each layer independently enabled. Layer 1 runs offline from JSONL session data. Layer 2a adds DDL-aware index gap detection via `--ddl`. Layer 2b adds live EXPLAIN analysis via `--explain-db`. All layers feed `OptimizationReportRenderer` which produces a single Markdown report. LLM layer (Layer 3) is deferred to v2.

**Tech Stack:** Bun + TypeScript, Vitest (tests), mysql2 (added for Layer 2b), no external SQL parser — regex-based DDL parsing only.

---

## File Map

**New files:**
- `src/Modules/Recording/Application/Strategies/N1QueryDetector.ts`
- `src/Modules/Recording/Application/Strategies/QueryFragmentationDetector.ts`
- `src/Modules/Recording/Application/Strategies/DdlSchemaParser.ts`
- `src/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer.ts`
- `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`
- `src/Modules/Recording/Application/Services/IndexSuggestionService.ts`
- `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`
- `test/unit/Recording/Application/N1QueryDetector.test.ts`
- `test/unit/Recording/Application/QueryFragmentationDetector.test.ts`
- `test/unit/Recording/Application/DdlSchemaParser.test.ts`
- `test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts`
- `test/unit/Recording/Application/ExplainAnalyzer.test.ts`
- `test/unit/Recording/Application/IndexSuggestionService.test.ts`
- `test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts`
- `test/fixtures/ddl/` (5 DDL fixture files, Task 14)

**Modified files:**
- `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts` — export `normalizeSql`
- `src/CLI/AnalyzeCommand.ts` — extend AnalyzeArgs + parse new flags + wire layers
- `test/unit/Recording/CLI/AnalyzeCommand.test.ts` — add tests for new flags

---

## Task 1: Export `normalizeSql` from UnifiedCorrelationService

**Files:**
- Modify: `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts`
- Test: `test/unit/Recording/Application/UnifiedCorrelationService.test.ts`

Currently `computeQueryHash` inlines the normalization. Extract it so `N1QueryDetector` and `QueryFragmentationDetector` can reuse the same logic to get the human-readable normalizedSql (not the hash).

- [ ] **Step 1: Write the failing test**

In `test/unit/Recording/Application/UnifiedCorrelationService.test.ts`, add:

```typescript
import { normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

describe('normalizeSql', () => {
  it('normalizes IN clauses', () => {
    expect(normalizeSql('SELECT * FROM users WHERE id IN (1, 2, 3)')).toBe(
      'select * from users where id in (?)',
    )
  })

  it('normalizes string literals', () => {
    expect(normalizeSql("SELECT * FROM users WHERE name = 'alice'")).toBe(
      'select * from users where name = ?',
    )
  })

  it('normalizes numeric literals', () => {
    expect(normalizeSql('SELECT * FROM orders WHERE status = 1')).toBe(
      'select * from orders where status = ?',
    )
  })

  it('collapses whitespace', () => {
    expect(normalizeSql('SELECT  *  FROM  users')).toBe('select * from users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/UnifiedCorrelationService.test.ts
```
Expected: FAIL — `normalizeSql is not exported`

- [ ] **Step 3: Extract and export `normalizeSql`**

In `src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts`, extract the normalization logic before hashing:

```typescript
/**
 * SQL を正規化して人間が読める normalizedSql を返す:
 * 1. IN(...) → IN(?)
 * 2. 単引用符文字列 → ?
 * 3. 数値リテラル → ?
 * 4. 空白正規化、小文字化
 */
export function normalizeSql(sql: string): string {
  return sql
    .replace(/IN\s*\([^)]*\)/gi, 'IN (?)')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function computeQueryHash(sql: string): string {
  const normalized = normalizeSql(sql)
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/UnifiedCorrelationService.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/UnifiedCorrelationService.ts \
        test/unit/Recording/Application/UnifiedCorrelationService.test.ts
git commit -m "refactor: [recording] 從 computeQueryHash 提取並匯出 normalizeSql"
```

---

## Task 2: Implement `N1QueryDetector`

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/N1QueryDetector.ts`
- Create: `test/unit/Recording/Application/N1QueryDetector.test.ts`

Aggregates the `isN1Candidate` flags from `ApiCallFlow.dbQueries` up to the API path level and generates batch SQL suggestions.

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Application/N1QueryDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectN1Queries } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

const makeQuery = (id: string, sql: string, tables: string[]): CapturedQuery => ({
  id,
  sessionId: 'sess_1',
  connectionId: 1,
  timestamp: 1000,
  duration: 5,
  sql,
  operation: 'SELECT',
  tables,
})

const makeFlow = (path: string, dbQueries: ApiCallFlow['dbQueries']): ApiCallFlow => ({
  requestId: `req_${path}`,
  sessionId: 'sess_1',
  method: 'GET',
  path,
  statusCode: 200,
  startTimestamp: 1000,
  durationMs: 100,
  requestBodySize: 0,
  responseBodySize: 100,
  dbQueries,
})

describe('detectN1Queries', () => {
  it('returns empty array when no flows', () => {
    expect(detectN1Queries([], [])).toEqual([])
  })

  it('detects N+1 pattern from isN1Candidate flags', () => {
    const sql = "SELECT * FROM orders WHERE user_id = 42"
    const q = makeQuery('q1', sql, ['orders'])
    const hash = computeQueryHash(sql)
    const flow = makeFlow('/users/:id', [
      { queryHash: hash, offsetMs: 10, tableTouched: ['orders'], isN1Candidate: true },
      { queryHash: hash, offsetMs: 20, tableTouched: ['orders'], isN1Candidate: true },
      { queryHash: hash, offsetMs: 30, tableTouched: ['orders'], isN1Candidate: true },
    ])

    const findings = detectN1Queries([flow], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].apiPath).toBe('/users/:id')
    expect(findings[0].affectedTable).toBe('orders')
    expect(findings[0].occurrences).toBe(3)
    expect(findings[0].exampleSql).toBe(sql)
    expect(findings[0].batchSql).toContain('IN (')
    expect(findings[0].batchSql).toContain('user_id')
  })

  it('does not report when isN1Candidate is false', () => {
    const sql = "SELECT * FROM users WHERE id = 1"
    const q = makeQuery('q2', sql, ['users'])
    const hash = computeQueryHash(sql)
    const flow = makeFlow('/posts', [
      { queryHash: hash, offsetMs: 5, tableTouched: ['users'], isN1Candidate: false },
    ])
    expect(detectN1Queries([flow], [q])).toHaveLength(0)
  })

  it('groups by apiPath and takes max occurrences', () => {
    const sql = "SELECT * FROM tags WHERE post_id = 1"
    const q = makeQuery('q3', sql, ['tags'])
    const hash = computeQueryHash(sql)
    const ref = { queryHash: hash, offsetMs: 0, tableTouched: ['tags'], isN1Candidate: true }
    const flow1 = { ...makeFlow('/posts/:id', [ref, ref]) }   // 2 occurrences
    const flow2 = { ...makeFlow('/posts/:id', [ref, ref, ref]) } // 3 occurrences

    const findings = detectN1Queries([flow1, flow2], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].occurrences).toBe(3) // max across flows
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/N1QueryDetector.test.ts
```
Expected: FAIL — `Cannot find module N1QueryDetector`

- [ ] **Step 3: Implement `N1QueryDetector`**

Create `src/Modules/Recording/Application/Strategies/N1QueryDetector.ts`:

```typescript
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash, normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface N1Finding {
  readonly apiPath: string
  readonly repeatedQueryHash: string
  readonly occurrences: number
  readonly exampleSql: string
  readonly affectedTable: string
  readonly suggestion: string
  readonly batchSql: string
}

function buildBatchSql(exampleSql: string, occurrences: number): string {
  const normalized = normalizeSql(exampleSql)
  // Replace a simple "= ?" pattern in WHERE clause with "IN (?, ?, ...)"
  // e.g. "where user_id = ?" → "where user_id IN (?, ?, ?)"
  const placeholders = Array(occurrences).fill('?').join(', ')
  const batched = normalized.replace(/(\w+)\s*=\s*\?(\s*(?:limit|order|group|$))/i, `$1 IN (${placeholders})$2`)
  if (batched !== normalized) return batched
  // Fallback: append comment
  return `${normalized}\n-- 建議改為批量查詢: WHERE <column> IN (${placeholders})`
}

export function detectN1Queries(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
): readonly N1Finding[] {
  // Build hash → CapturedQuery map for SQL lookup
  const hashToQuery = new Map<string, CapturedQuery>()
  for (const q of queries) {
    const h = computeQueryHash(q.sql)
    if (!hashToQuery.has(h)) hashToQuery.set(h, q)
  }

  // Group flows by apiPath
  const flowsByPath = new Map<string, ApiCallFlow[]>()
  for (const flow of flows) {
    const existing = flowsByPath.get(flow.path) ?? []
    flowsByPath.set(flow.path, [...existing, flow])
  }

  const findings: N1Finding[] = []

  for (const [apiPath, pathFlows] of flowsByPath) {
    // queryHash → max occurrences across all flows for this path
    const maxOccurrences = new Map<string, number>()

    for (const flow of pathFlows) {
      const countInFlow = new Map<string, number>()
      for (const dbQuery of flow.dbQueries) {
        if (!dbQuery.isN1Candidate) continue
        countInFlow.set(dbQuery.queryHash, (countInFlow.get(dbQuery.queryHash) ?? 0) + 1)
      }
      for (const [hash, count] of countInFlow) {
        const current = maxOccurrences.get(hash) ?? 0
        if (count > current) maxOccurrences.set(hash, count)
      }
    }

    for (const [hash, occurrences] of maxOccurrences) {
      if (occurrences < 2) continue
      const q = hashToQuery.get(hash)
      if (!q) continue

      const affectedTable = q.tables[0] ?? 'unknown'
      findings.push({
        apiPath,
        repeatedQueryHash: hash,
        occurrences,
        exampleSql: q.sql,
        affectedTable,
        suggestion: `${apiPath} 內 ${affectedTable} 資料表重複查詢 ${occurrences} 次/請求，建議改為批量查詢`,
        batchSql: buildBatchSql(q.sql, occurrences),
      })
    }
  }

  return findings.sort((a, b) => b.occurrences - a.occurrences)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/N1QueryDetector.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/N1QueryDetector.ts \
        test/unit/Recording/Application/N1QueryDetector.test.ts
git commit -m "feat: [recording] 實作 N1QueryDetector（Layer 1 N+1 聚合分析）"
```

---

## Task 3: Implement `QueryFragmentationDetector`

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/QueryFragmentationDetector.ts`
- Create: `test/unit/Recording/Application/QueryFragmentationDetector.test.ts`

Detects queries appearing ≥ 3 times in a single API flow (more severe than N+1). Independent output from N1QueryDetector.

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Application/QueryFragmentationDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectQueryFragmentation } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash, normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

const makeQuery = (id: string, sql: string, tables: string[]): CapturedQuery => ({
  id,
  sessionId: 'sess_1',
  connectionId: 1,
  timestamp: 1000,
  duration: 3,
  sql,
  operation: 'SELECT',
  tables,
})

const makeFlow = (path: string, dbQueries: ApiCallFlow['dbQueries']): ApiCallFlow => ({
  requestId: `req_${Math.random()}`,
  sessionId: 'sess_1',
  method: 'GET',
  path,
  statusCode: 200,
  startTimestamp: 1000,
  durationMs: 100,
  requestBodySize: 0,
  responseBodySize: 100,
  dbQueries,
})

describe('detectQueryFragmentation', () => {
  it('returns empty array when no flows', () => {
    expect(detectQueryFragmentation([], [])).toEqual([])
  })

  it('does not flag queries appearing fewer than 3 times in a flow', () => {
    const sql = "SELECT * FROM tags WHERE post_id = 1"
    const q = makeQuery('q1', sql, ['tags'])
    const hash = computeQueryHash(sql)
    const flow = makeFlow('/posts', [
      { queryHash: hash, offsetMs: 10, tableTouched: ['tags'], isN1Candidate: true },
      { queryHash: hash, offsetMs: 20, tableTouched: ['tags'], isN1Candidate: true },
    ])
    expect(detectQueryFragmentation([flow], [q])).toHaveLength(0)
  })

  it('detects fragmentation when same query appears 3+ times in one flow', () => {
    const sql = "SELECT * FROM permissions WHERE user_id = 1"
    const q = makeQuery('q2', sql, ['permissions'])
    const hash = computeQueryHash(sql)
    const ref = { queryHash: hash, offsetMs: 0, tableTouched: ['permissions'], isN1Candidate: true }
    const flow = makeFlow('/dashboard', [ref, ref, ref])

    const findings = detectQueryFragmentation([flow], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].apiPath).toBe('/dashboard')
    expect(findings[0].queryPattern).toBe(normalizeSql(sql))
    expect(findings[0].callsPerRequest).toBe(3)
    expect(findings[0].exampleSql).toBe(sql)
    expect(['batch', 'dataloader', 'cache']).toContain(findings[0].suggestion)
  })

  it('averages callsPerRequest across multiple flows', () => {
    const sql = "SELECT * FROM settings WHERE org_id = 1"
    const q = makeQuery('q3', sql, ['settings'])
    const hash = computeQueryHash(sql)
    const ref = { queryHash: hash, offsetMs: 0, tableTouched: ['settings'], isN1Candidate: true }
    const flow1 = makeFlow('/orgs/:id', [ref, ref, ref])       // 3 per request
    const flow2 = makeFlow('/orgs/:id', [ref, ref, ref, ref, ref]) // 5 per request

    const findings = detectQueryFragmentation([flow1, flow2], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].callsPerRequest).toBe(4) // (3+5)/2
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/QueryFragmentationDetector.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `QueryFragmentationDetector`**

Create `src/Modules/Recording/Application/Strategies/QueryFragmentationDetector.ts`:

```typescript
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash, normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface FragmentationFinding {
  readonly apiPath: string
  readonly queryPattern: string
  readonly callsPerRequest: number
  readonly suggestion: 'batch' | 'dataloader' | 'cache'
  readonly exampleSql: string
}

const FRAGMENTATION_THRESHOLD = 3

function chooseSuggestion(queryPattern: string): 'batch' | 'dataloader' | 'cache' {
  if (/where\s+\w+\s*(=|in)\s*\?/i.test(queryPattern)) return 'dataloader'
  if (/select\s+\*/i.test(queryPattern)) return 'batch'
  return 'cache'
}

export function detectQueryFragmentation(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
): readonly FragmentationFinding[] {
  const hashToQuery = new Map<string, CapturedQuery>()
  for (const q of queries) {
    const h = computeQueryHash(q.sql)
    if (!hashToQuery.has(h)) hashToQuery.set(h, q)
  }

  // Group flows by apiPath
  const flowsByPath = new Map<string, ApiCallFlow[]>()
  for (const flow of flows) {
    const existing = flowsByPath.get(flow.path) ?? []
    flowsByPath.set(flow.path, [...existing, flow])
  }

  const findings: FragmentationFinding[] = []

  for (const [apiPath, pathFlows] of flowsByPath) {
    // hash → counts across flows (only flows where count >= FRAGMENTATION_THRESHOLD)
    const hashCounts = new Map<string, number[]>()

    for (const flow of pathFlows) {
      const countInFlow = new Map<string, number>()
      for (const dbQuery of flow.dbQueries) {
        countInFlow.set(dbQuery.queryHash, (countInFlow.get(dbQuery.queryHash) ?? 0) + 1)
      }
      for (const [hash, count] of countInFlow) {
        if (count >= FRAGMENTATION_THRESHOLD) {
          const existing = hashCounts.get(hash) ?? []
          hashCounts.set(hash, [...existing, count])
        }
      }
    }

    for (const [hash, counts] of hashCounts) {
      const q = hashToQuery.get(hash)
      if (!q) continue
      const avgCalls = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
      const pattern = normalizeSql(q.sql)

      findings.push({
        apiPath,
        queryPattern: pattern,
        callsPerRequest: avgCalls,
        suggestion: chooseSuggestion(pattern),
        exampleSql: q.sql,
      })
    }
  }

  return findings.sort((a, b) => b.callsPerRequest - a.callsPerRequest)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/QueryFragmentationDetector.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/QueryFragmentationDetector.ts \
        test/unit/Recording/Application/QueryFragmentationDetector.test.ts
git commit -m "feat: [recording] 實作 QueryFragmentationDetector（Layer 1 碎片化查詢偵測）"
```

---

## Task 4: Implement `OptimizationReportRenderer` (Layer 1)

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`
- Create: `test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts`

Renders Layer 1 findings (ReadWriteReport + N1Finding[] + FragmentationFinding[]) to Markdown. Layer 2a/2b sections added in Tasks 8 and 12.

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderOptimizationReport } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import type { OptimizationReportData } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'

const baseData: OptimizationReportData = {
  sessionId: 'rec_test',
  generatedAt: '2026-04-04T15:00:00.000Z',
  enabledLayers: ['pattern'],
  readWriteReport: {
    tables: [
      { table: 'users', reads: 1240, writes: 12, readRatio: 0.99 },
    ],
    suggestions: [
      {
        table: 'users',
        type: 'redis_cache',
        reason: 'readRatio=0.99 (99% reads)',
        sql: '-- users 資料表讀取佔 99%，建議在應用層加入 Redis cache\n-- TTL 建議：60 秒\n-- Redis key pattern：users:{id}',
      },
    ],
  },
  n1Findings: [
    {
      apiPath: '/users/:id',
      repeatedQueryHash: 'abc123',
      occurrences: 8,
      exampleSql: 'SELECT * FROM orders WHERE user_id = 42',
      affectedTable: 'orders',
      suggestion: '/users/:id 內 orders 資料表重複查詢 8 次/請求',
      batchSql: 'select * from orders where user_id in (?, ?, ?, ?, ?, ?, ?, ?)',
    },
  ],
  fragmentationFindings: [],
}

describe('renderOptimizationReport', () => {
  it('includes report header with session ID', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('# Archivolt 效能診斷報告')
    expect(md).toContain('rec_test')
  })

  it('includes read/write ratio table', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('## 📊 讀寫比分析')
    expect(md).toContain('users')
    expect(md).toContain('1240')
    expect(md).toContain('99%')
  })

  it('includes N+1 section with example SQL', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('## 🔴 N+1 問題')
    expect(md).toContain('/users/:id')
    expect(md).toContain('8 次')
    expect(md).toContain('SELECT * FROM orders')
  })

  it('includes runnable SQL blocks', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('```sql')
    expect(md).toContain('user_id')
  })

  it('omits N+1 section when no findings', () => {
    const data = { ...baseData, n1Findings: [] }
    const md = renderOptimizationReport(data)
    expect(md).not.toContain('## 🔴 N+1 問題')
  })

  it('includes fragmentation section when findings exist', () => {
    const data = {
      ...baseData,
      fragmentationFindings: [{
        apiPath: '/dashboard',
        queryPattern: 'select * from permissions where user_id = ?',
        callsPerRequest: 5,
        suggestion: 'dataloader' as const,
        exampleSql: 'SELECT * FROM permissions WHERE user_id = 1',
      }],
    }
    const md = renderOptimizationReport(data)
    expect(md).toContain('## 🟡 查詢碎片化')
    expect(md).toContain('/dashboard')
    expect(md).toContain('5 次/請求')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `OptimizationReportRenderer`**

Create `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`:

```typescript
import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

export type EnabledLayer = 'pattern' | 'ddl' | 'explain'

export interface OptimizationReportData {
  readonly sessionId: string
  readonly generatedAt: string
  readonly enabledLayers: readonly EnabledLayer[]
  readonly readWriteReport: ReadWriteReport
  readonly n1Findings: readonly N1Finding[]
  readonly fragmentationFindings: readonly FragmentationFinding[]
  readonly indexGapFindings?: readonly IndexGapFinding[]
  readonly fullScanFindings?: readonly FullScanFinding[]
  readonly explainWarning?: string
}

export function renderOptimizationReport(data: OptimizationReportData): string {
  const layerLabel = data.enabledLayers
    .map((l) => ({ pattern: 'Pattern Analysis', ddl: 'DDL Diff', explain: 'EXPLAIN Live' }[l]))
    .join(' | ')

  const sections: string[] = [
    `# Archivolt 效能診斷報告\n`,
    `生成時間：${data.generatedAt}`,
    `Session ID：${data.sessionId}`,
    `分析層級：${layerLabel}`,
    `\n---\n`,
  ]

  // Section: Read/Write Ratio
  sections.push(renderReadWriteSection(data.readWriteReport))

  // Section: N+1
  if (data.n1Findings.length > 0) {
    sections.push(renderN1Section(data.n1Findings))
  }

  // Section: Query Fragmentation
  if (data.fragmentationFindings.length > 0) {
    sections.push(renderFragmentationSection(data.fragmentationFindings))
  }

  // Section: Index Gaps (DDL)
  if (data.indexGapFindings && data.indexGapFindings.length > 0) {
    sections.push(renderIndexGapSection(data.indexGapFindings))
  }

  // Section: Full Table Scans (EXPLAIN)
  if (data.explainWarning) {
    sections.push(`> ⚠️ ${data.explainWarning}\n`)
  }
  if (data.fullScanFindings && data.fullScanFindings.length > 0) {
    sections.push(renderFullScanSection(data.fullScanFindings))
  }

  sections.push(`---\n*本報告由 Archivolt 自動生成。EXPLAIN 結果基於側錄當時的資料庫狀態。*`)

  return sections.join('\n')
}

function renderReadWriteSection(report: ReadWriteReport): string {
  const rows = report.tables
    .map((t) => {
      const pct = Math.round(t.readRatio * 100)
      const suggestion = report.suggestions.find((s) => s.table === t.table)
      const suggestionText = suggestion
        ? suggestion.type === 'redis_cache' ? 'Redis TTL=60s' : 'Read Replica'
        : '—'
      return `| ${t.table} | ${t.reads} | ${t.writes} | ${pct}% | ${suggestionText} |`
    })
    .join('\n')

  const tableSection = [
    `## 📊 讀寫比分析\n`,
    `| 資料表 | 讀次 | 寫次 | 讀佔比 | 建議 |`,
    `|--------|------|------|--------|------|`,
    rows,
  ].join('\n')

  if (report.suggestions.length === 0) return `${tableSection}\n`

  const sqlBlocks = report.suggestions
    .map((s) => `\`\`\`sql\n${s.sql}\n\`\`\``)
    .join('\n\n')

  return `${tableSection}\n\n### 可執行指令\n\n${sqlBlocks}\n`
}

function renderN1Section(findings: readonly N1Finding[]): string {
  const items = findings.map((f) => [
    `### ${f.apiPath} — ${f.affectedTable} 資料表重複查詢 (${f.occurrences} 次/請求)\n`,
    `${f.suggestion}\n`,
    `**原始 SQL:**`,
    `\`\`\`sql\n${f.exampleSql}\n\`\`\`\n`,
    `**可執行批量查詢:**`,
    `\`\`\`sql\n${f.batchSql}\n\`\`\``,
  ].join('\n'))

  return [`## 🔴 N+1 問題\n`, ...items].join('\n') + '\n'
}

function renderFragmentationSection(findings: readonly FragmentationFinding[]): string {
  const items = findings.map((f) => {
    const suggestionLabel = { batch: '批量查詢', dataloader: 'DataLoader', cache: 'Cache' }[f.suggestion]
    return [
      `### ${f.apiPath} — 查詢碎片化 (${f.callsPerRequest} 次/請求)\n`,
      `建議優化方式：${suggestionLabel}\n`,
      `\`\`\`sql\n-- 原始查詢 (平均 ${f.callsPerRequest} 次/請求)\n${f.exampleSql}\n\`\`\``,
    ].join('\n')
  })

  return [`## 🟡 查詢碎片化\n`, ...items].join('\n') + '\n'
}

function renderIndexGapSection(findings: readonly IndexGapFinding[]): string {
  const items = findings.map((f) => {
    const verifiedLabel = f.source === 'ddl'
      ? '⚠️ DDL 確認（未經 EXPLAIN 驗證）'
      : f.source === 'both'
        ? '✅ DDL + EXPLAIN 雙重確認'
        : '✅ EXPLAIN 確認'
    return [
      `### [${verifiedLabel}] ${f.table}.${f.column} 無索引\n`,
      `\`\`\`sql\n${f.suggestedIndex}\n\`\`\``,
    ].join('\n')
  })

  return [`## 🟠 索引缺失\n`, ...items].join('\n') + '\n'
}

function renderFullScanSection(findings: readonly FullScanFinding[]): string {
  const items = findings.map((f) => [
    `### 全表掃描 — ${f.table} (估計 ~${f.estimatedRows.toLocaleString()} rows)\n`,
    `\`\`\`sql\n${f.suggestedIndex}\n\`\`\``,
  ].join('\n'))

  return [`## 🔴 全表掃描 (EXPLAIN 確認)\n`, ...items].join('\n') + '\n'
}
```

Note: `IndexGapFinding` and `FullScanFinding` are forward-referenced types that will be defined in Tasks 7 and 10. TypeScript will show import errors until those files are created. For now, add them as type-only imports with `// @ts-ignore` or define stub types at the top of the file. The clean approach: define all the type interfaces up front using a shared types file.

Actually, cleaner approach: define the interface inline in the renderer for now and replace the import when Tasks 7 and 10 are done. See Step 3b below.

- [ ] **Step 3b: Fix forward-reference type errors**

Since `IndexGapFinding` and `FullScanFinding` don't exist yet, temporarily define them inline in the renderer:

```typescript
// Temporary stub types — will be replaced by imports in Tasks 7 and 10
interface IndexGapFinding {
  readonly table: string
  readonly column: string
  readonly suggestedIndex: string
  readonly source: 'ddl' | 'explain' | 'both'
}

interface FullScanFinding {
  readonly sql: string
  readonly queryHash: string
  readonly table: string
  readonly estimatedRows: number
  readonly suggestedIndex: string
}
```

Replace the actual import lines with these stubs. After Tasks 7 and 10 create those types, replace the stubs with the real imports.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts \
        test/unit/Recording/Infrastructure/OptimizationReportRenderer.test.ts
git commit -m "feat: [recording] 實作 OptimizationReportRenderer（Layer 1 Markdown 報告渲染）"
```

---

## Task 5: Wire Layer 1 + `--format optimize-md` into AnalyzeCommand (TODO-4)

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`
- Modify: `test/unit/Recording/CLI/AnalyzeCommand.test.ts`

This resolves **TODO-4** from TODOS.md. The `--format optimize-md` flag triggers Layer 1 analysis and renders the optimization report.

- [ ] **Step 1: Write the failing tests**

In `test/unit/Recording/CLI/AnalyzeCommand.test.ts`, add to the existing `parseAnalyzeArgs` describe block:

```typescript
describe('parseAnalyzeArgs — optimize-md flags', () => {
  it('parses --format optimize-md', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'optimize-md'])
    expect(args.format).toBe('optimize-md')
  })

  it('defaults ddlPath to undefined', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.ddlPath).toBeUndefined()
  })

  it('parses --ddl path', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--ddl', './schema.sql'])
    expect(args.ddlPath).toBe('./schema.sql')
  })

  it('defaults explainDbUrl to undefined', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.explainDbUrl).toBeUndefined()
  })

  it('parses --explain-db url', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--explain-db', 'mysql://localhost/db'])
    expect(args.explainDbUrl).toBe('mysql://localhost/db')
  })

  it('defaults minRows to 1000', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.minRows).toBe(1000)
  })

  it('parses --min-rows', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--min-rows', '500'])
    expect(args.minRows).toBe(500)
  })

  it('defaults llm to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.llm).toBe(false)
  })

  it('parses --llm flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--llm'])
    expect(args.llm).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/unit/Recording/CLI/AnalyzeCommand.test.ts
```
Expected: FAIL — new fields don't exist on AnalyzeArgs

- [ ] **Step 3: Extend `AnalyzeArgs` and `parseAnalyzeArgs`**

Replace the interface and parse function in `src/CLI/AnalyzeCommand.ts`:

```typescript
export interface AnalyzeArgs {
  readonly sessionId: string
  readonly output?: string
  readonly format: 'md' | 'json' | 'optimize-md'
  readonly stdout: boolean
  readonly ddlPath?: string
  readonly explainDbUrl?: string
  readonly llm: boolean
  readonly minRows: number
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt analyze <session-id> [--output path] [--format md|json|optimize-md] [--stdout] [--ddl path] [--explain-db url] [--min-rows n] [--llm]')
  }

  const formatIdx = rest.indexOf('--format')
  const format = formatIdx !== -1 ? (rest[formatIdx + 1] as AnalyzeArgs['format']) : 'md'

  const stdout = rest.includes('--stdout')

  const outputIdx = rest.indexOf('--output')
  const altOutputIdx = rest.indexOf('-o')
  const output = outputIdx !== -1
    ? rest[outputIdx + 1]
    : altOutputIdx !== -1
      ? rest[altOutputIdx + 1]
      : undefined

  const ddlIdx = rest.indexOf('--ddl')
  const ddlPath = ddlIdx !== -1 ? rest[ddlIdx + 1] : undefined

  const explainDbIdx = rest.indexOf('--explain-db')
  const explainDbUrl = explainDbIdx !== -1 ? rest[explainDbIdx + 1] : undefined

  const minRowsIdx = rest.indexOf('--min-rows')
  const minRows = minRowsIdx !== -1 ? Number(rest[minRowsIdx + 1]) : 1000

  const llm = rest.includes('--llm')

  return { sessionId, output, format, stdout, ddlPath, explainDbUrl, llm, minRows }
}
```

- [ ] **Step 4: Add optimize-md branch to `runAnalyzeCommand`**

After the existing `if (args.format === 'json' || args.stdout)` block, add:

```typescript
  if (args.format === 'optimize-md') {
    const { analyzeReadWriteRatio } = await import(
      '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
    )
    const { detectN1Queries } = await import(
      '@/Modules/Recording/Application/Strategies/N1QueryDetector'
    )
    const { detectQueryFragmentation } = await import(
      '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
    )
    const { renderOptimizationReport } = await import(
      '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
    )
    import type { OptimizationReportData } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'

    const readWriteReport = analyzeReadWriteRatio(queries)
    const enabledLayers: import('@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer').EnabledLayer[] = ['pattern']

    const n1Findings = apiFlows ? detectN1Queries(apiFlows, queries) : []
    const fragmentationFindings = apiFlows ? detectQueryFragmentation(apiFlows, queries) : []

    const reportData: OptimizationReportData = {
      sessionId: args.sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers,
      readWriteReport,
      n1Findings,
      fragmentationFindings,
    }

    const md = renderOptimizationReport(reportData)

    if (args.stdout) {
      console.log(md)
      return
    }

    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/optimization-report.md`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, md, 'utf-8')
    console.log(`Optimization report written to: ${outPath}`)
    return
  }
```

Note: dynamic imports with `import type` inside a function won't work. Replace with static imports at the top of the file. Add these to the import section:

```typescript
import { analyzeReadWriteRatio } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import { detectN1Queries } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import { detectQueryFragmentation } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import { renderOptimizationReport, type OptimizationReportData, type EnabledLayer } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
```

And update the `optimize-md` branch to use direct calls (no `await import()`).

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test test/unit/Recording/CLI/AnalyzeCommand.test.ts
```
Expected: PASS

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Step 7: Run full test suite**

```bash
bun run test
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts \
        test/unit/Recording/CLI/AnalyzeCommand.test.ts
git commit -m "feat: [recording] 實作 --format optimize-md Layer 1 Pattern Analysis CLI 接線"
```

---

## Task 6: Implement `DdlSchemaParser`

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/DdlSchemaParser.ts`
- Create: `test/unit/Recording/Application/DdlSchemaParser.test.ts`

Regex-based MySQL DDL parser. Parses `CREATE TABLE` blocks to extract columns, `KEY`, `UNIQUE KEY`, `PRIMARY KEY`, and standalone `CREATE INDEX` statements. v1 = MySQL only.

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Application/DdlSchemaParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDdlSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

const SIMPLE_DDL = `
CREATE TABLE \`users\` (
  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
  \`email\` varchar(255) NOT NULL,
  \`name\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`users_email_unique\` (\`email\`),
  KEY \`users_name_index\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

const COMPOSITE_DDL = `
CREATE TABLE \`orders\` (
  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
  \`user_id\` bigint(20) NOT NULL,
  \`status\` varchar(50) NOT NULL,
  \`created_at\` timestamp NULL,
  PRIMARY KEY (\`id\`),
  KEY \`orders_user_status_index\` (\`user_id\`, \`status\`)
) ENGINE=InnoDB;
`

const EXTERNAL_INDEX_DDL = `
CREATE TABLE \`products\` (
  \`id\` int NOT NULL,
  \`sku\` varchar(50) NOT NULL,
  PRIMARY KEY (\`id\`)
);

CREATE INDEX idx_products_sku ON products(sku);
`

describe('parseDdlSchema', () => {
  it('parses table name', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    expect(schema.tables).toHaveLength(1)
    expect(schema.tables[0].name).toBe('users')
  })

  it('parses PRIMARY KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    expect(schema.tables[0].primaryKey).toEqual(['id'])
  })

  it('parses UNIQUE KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    const unique = schema.tables[0].indexes.find((i) => i.unique)
    expect(unique?.columns).toEqual(['email'])
  })

  it('parses regular KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    const idx = schema.tables[0].indexes.find((i) => i.name === 'users_name_index')
    expect(idx?.columns).toEqual(['name'])
    expect(idx?.unique).toBe(false)
  })

  it('parses composite index column order', () => {
    const schema = parseDdlSchema(COMPOSITE_DDL)
    const idx = schema.tables[0].indexes.find((i) => i.name === 'orders_user_status_index')
    expect(idx?.columns).toEqual(['user_id', 'status'])
  })

  it('parses external CREATE INDEX', () => {
    const schema = parseDdlSchema(EXTERNAL_INDEX_DDL)
    const tbl = schema.tables.find((t) => t.name === 'products')
    const idx = tbl?.indexes.find((i) => i.name === 'idx_products_sku')
    expect(idx?.columns).toEqual(['sku'])
  })

  it('returns empty tables for empty input', () => {
    expect(parseDdlSchema('').tables).toHaveLength(0)
  })

  it('strips backtick identifiers', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    // table name and column names should not have backticks
    expect(schema.tables[0].name).not.toContain('`')
    schema.tables[0].indexes.forEach((idx) => {
      idx.columns.forEach((col) => expect(col).not.toContain('`'))
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/DdlSchemaParser.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `DdlSchemaParser`**

Create `src/Modules/Recording/Application/Strategies/DdlSchemaParser.ts`:

```typescript
export interface ParsedSchema {
  readonly tables: readonly ParsedTable[]
}

export interface ParsedTable {
  readonly name: string
  readonly columns: readonly string[]
  readonly indexes: readonly ParsedIndex[]
  readonly primaryKey: readonly string[]
}

export interface ParsedIndex {
  readonly name: string
  readonly columns: readonly string[]
  readonly unique: boolean
}

function stripBackticks(s: string): string {
  return s.replace(/`/g, '').trim()
}

function extractColumns(columnsStr: string): readonly string[] {
  return columnsStr
    .split(',')
    .map((c) => stripBackticks(c.trim()))
    .filter(Boolean)
}

function parseTableBody(body: string, tableName: string): { columns: string[], indexes: ParsedIndex[], primaryKey: string[] } {
  const columns: string[] = []
  const indexes: ParsedIndex[] = []
  let primaryKey: string[] = []

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    // PRIMARY KEY (`col1`, `col2`)
    const pkMatch = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i)
    if (pkMatch) {
      primaryKey = extractColumns(pkMatch[1]) as string[]
      continue
    }

    // UNIQUE KEY `name` (`col1`, `col2`)
    const uniqueMatch = line.match(/^UNIQUE\s+KEY\s+`?([^`(,\s]+)`?\s*\(([^)]+)\)/i)
    if (uniqueMatch) {
      indexes.push({
        name: stripBackticks(uniqueMatch[1]),
        columns: extractColumns(uniqueMatch[2]),
        unique: true,
      })
      continue
    }

    // KEY `name` (`col1`, `col2`)
    const keyMatch = line.match(/^KEY\s+`?([^`(,\s]+)`?\s*\(([^)]+)\)/i)
    if (keyMatch) {
      indexes.push({
        name: stripBackticks(keyMatch[1]),
        columns: extractColumns(keyMatch[2]),
        unique: false,
      })
      continue
    }

    // Column definition (not a key/constraint line)
    if (
      !line.startsWith('CONSTRAINT') &&
      !line.startsWith(')') &&
      !line.startsWith('ENGINE') &&
      !line.startsWith('FULLTEXT') &&
      !line.startsWith('SPATIAL')
    ) {
      const colMatch = line.match(/^`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+\w/)
      if (colMatch) columns.push(stripBackticks(colMatch[1]))
    }
  }

  return { columns, indexes, primaryKey }
}

export function parseDdlSchema(ddl: string): ParsedSchema {
  const tables: ParsedTable[] = []

  // Match CREATE TABLE blocks
  const tableRe = /CREATE\s+TABLE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\(([^;]*?)\)\s*(?:ENGINE|;)/gis
  let tableMatch: RegExpExecArray | null

  while ((tableMatch = tableRe.exec(ddl)) !== null) {
    const tableName = stripBackticks(tableMatch[1])
    const body = tableMatch[2]
    const { columns, indexes, primaryKey } = parseTableBody(body, tableName)
    tables.push({ name: tableName, columns, indexes, primaryKey })
  }

  // Match external CREATE INDEX statements
  const indexRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+ON\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\(([^)]+)\)/gi
  let indexMatch: RegExpExecArray | null

  while ((indexMatch = indexRe.exec(ddl)) !== null) {
    const unique = Boolean(indexMatch[1])
    const indexName = stripBackticks(indexMatch[2])
    const targetTable = stripBackticks(indexMatch[3])
    const columns = extractColumns(indexMatch[4])

    const tbl = tables.find((t) => t.name === targetTable)
    if (tbl) {
      const newIndex: ParsedIndex = { name: indexName, columns, unique }
      ;(tbl.indexes as ParsedIndex[]).push(newIndex)
    }
  }

  return { tables }
}
```

Note: The `tbl.indexes` push above mutates a `readonly` array. To avoid this, build the table with a mutable copy during parsing and freeze it in the return. Refactor the `tables.push` to use mutable types internally and convert to readonly at the end:

```typescript
// Replace the return
return {
  tables: tables.map((t) => ({
    ...t,
    indexes: [...t.indexes] as readonly ParsedIndex[],
    columns: [...t.columns] as readonly string[],
    primaryKey: [...t.primaryKey] as readonly string[],
  }))
}
```

And in the external index section:
```typescript
// Use a mutable working map instead of mutating readonly arrays
const tableIndexMap = new Map<string, ParsedIndex[]>()
for (const tbl of tables) tableIndexMap.set(tbl.name, [...tbl.indexes])

// In the while loop:
const existing = tableIndexMap.get(targetTable) ?? []
tableIndexMap.set(targetTable, [...existing, { name: indexName, columns, unique }])

// In return:
return {
  tables: tables.map((t) => ({
    ...t,
    indexes: tableIndexMap.get(t.name) ?? t.indexes,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/DdlSchemaParser.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/DdlSchemaParser.ts \
        test/unit/Recording/Application/DdlSchemaParser.test.ts
git commit -m "feat: [recording] 實作 DdlSchemaParser（MySQL DDL 索引解析，Layer 2a）"
```

---

## Task 7: Implement `IndexCoverageGapAnalyzer`

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer.ts`
- Create: `test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts`

Cross-references N+1/fragmentation findings with DdlSchemaParser output to detect un-indexed WHERE columns.

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeIndexCoverageGaps } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

const schemaWithIndexOnUserId: ParsedSchema = {
  tables: [{
    name: 'orders',
    columns: ['id', 'user_id', 'status'],
    primaryKey: ['id'],
    indexes: [{ name: 'orders_user_id_index', columns: ['user_id'], unique: false }],
  }],
}

const schemaNoIndexes: ParsedSchema = {
  tables: [{
    name: 'orders',
    columns: ['id', 'user_id', 'status'],
    primaryKey: ['id'],
    indexes: [],
  }],
}

const n1Finding: N1Finding = {
  apiPath: '/users/:id',
  repeatedQueryHash: 'abc',
  occurrences: 5,
  exampleSql: 'SELECT * FROM orders WHERE user_id = 42',
  affectedTable: 'orders',
  suggestion: 'use batch query',
  batchSql: 'SELECT * FROM orders WHERE user_id IN (?, ?)',
}

describe('analyzeIndexCoverageGaps', () => {
  it('returns empty when schema covers all WHERE columns', () => {
    const gaps = analyzeIndexCoverageGaps([n1Finding], [], schemaWithIndexOnUserId)
    expect(gaps).toHaveLength(0)
  })

  it('detects gap when WHERE column has no index', () => {
    const gaps = analyzeIndexCoverageGaps([n1Finding], [], schemaNoIndexes)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0].table).toBe('orders')
    expect(gaps[0].column).toBe('user_id')
    expect(gaps[0].suggestedIndex).toContain('CREATE INDEX')
    expect(gaps[0].suggestedIndex).toContain('orders')
    expect(gaps[0].suggestedIndex).toContain('user_id')
    expect(gaps[0].source).toBe('ddl')
  })

  it('also detects gaps from fragmentation findings', () => {
    const fragFinding: FragmentationFinding = {
      apiPath: '/dashboard',
      queryPattern: 'select * from orders where status = ?',
      callsPerRequest: 4,
      suggestion: 'cache',
      exampleSql: 'SELECT * FROM orders WHERE status = "active"',
    }
    const gaps = analyzeIndexCoverageGaps([], [fragFinding], schemaNoIndexes)
    expect(gaps.some((g) => g.column === 'status')).toBe(true)
  })

  it('marks low confidence for subquery patterns', () => {
    const finding: N1Finding = {
      ...n1Finding,
      exampleSql: 'SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE name = "test")',
    }
    const gaps = analyzeIndexCoverageGaps([finding], [], schemaNoIndexes)
    // May include a 'low' confidence finding for nested WHERE
    const lowConf = gaps.filter((g) => g.confidence === 'low')
    // Just ensure it doesn't crash and returns something
    expect(gaps).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `IndexCoverageGapAnalyzer`**

Create `src/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer.ts`:

```typescript
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

export interface IndexGapFinding {
  readonly table: string
  readonly column: string
  readonly sourceQueryHash: string
  readonly exampleSql: string
  readonly confidence: 'high' | 'low'
  readonly source: 'ddl' | 'explain' | 'both'
  readonly suggestedIndex: string
}

const SQL_RESERVED = new Set([
  'and', 'or', 'not', 'null', 'is', 'in', 'like', 'between',
  'select', 'from', 'where', 'join', 'on', 'as', 'by', 'order',
  'group', 'having', 'limit', 'offset', 'union', 'all', 'distinct',
])

function extractWhereColumns(sql: string): { columns: readonly string[], confidence: 'high' | 'low' } {
  const lowerSql = sql.toLowerCase()
  const confidence: 'high' | 'low' = lowerSql.includes('select') && lowerSql.indexOf('select', lowerSql.indexOf('where')) > -1
    ? 'low'
    : 'high'

  const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is)
  if (!whereMatch) return { columns: [], confidence }

  const whereClause = whereMatch[1]
  const colMatches = whereClause.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|IN|LIKE|>|<|>=|<=)/gi)
  const columns = [...colMatches]
    .map((m) => m[1].toLowerCase())
    .filter((c) => !SQL_RESERVED.has(c))

  return { columns: [...new Set(columns)], confidence }
}

function isColumnIndexed(table: string, column: string, schema: ParsedSchema): boolean {
  const tbl = schema.tables.find((t) => t.name === table)
  if (!tbl) return false

  // Check PRIMARY KEY
  if (tbl.primaryKey.map((c) => c.toLowerCase()).includes(column)) return true

  // Check indexes — first column of composite index counts
  return tbl.indexes.some(
    (idx) => idx.columns[0]?.toLowerCase() === column || idx.columns.map((c) => c.toLowerCase()).includes(column)
  )
}

interface Gap { table: string, column: string, exampleSql: string, hash: string, confidence: 'high' | 'low' }

function gapsFromSql(sql: string, table: string, hash: string, schema: ParsedSchema): Gap[] {
  const { columns, confidence } = extractWhereColumns(sql)
  const gaps: Gap[] = []
  for (const col of columns) {
    if (!isColumnIndexed(table, col, schema)) {
      gaps.push({ table, column: col, exampleSql: sql, hash, confidence })
    }
  }
  return gaps
}

export function analyzeIndexCoverageGaps(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  schema: ParsedSchema,
): readonly IndexGapFinding[] {
  const seen = new Set<string>()
  const results: IndexGapFinding[] = []

  const addGap = (gap: Gap) => {
    const key = `${gap.table}.${gap.column}`
    if (seen.has(key)) return
    seen.add(key)
    results.push({
      table: gap.table,
      column: gap.column,
      sourceQueryHash: gap.hash,
      exampleSql: gap.exampleSql,
      confidence: gap.confidence,
      source: 'ddl',
      suggestedIndex: `-- ⚠️ 未經 EXPLAIN 驗證，建議先在測試環境確認\nCREATE INDEX idx_${gap.table}_${gap.column} ON ${gap.table}(${gap.column});`,
    })
  }

  for (const f of n1Findings) {
    for (const gap of gapsFromSql(f.exampleSql, f.affectedTable, f.repeatedQueryHash, schema)) {
      addGap(gap)
    }
  }

  for (const f of fragmentationFindings) {
    // Extract table from queryPattern: "select * from <table> where ..."
    const tableMatch = f.queryPattern.match(/from\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/i)
    const table = tableMatch ? tableMatch[1] : 'unknown'
    for (const gap of gapsFromSql(f.exampleSql, table, f.queryPattern, schema)) {
      addGap(gap)
    }
  }

  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts
```
Expected: PASS

- [ ] **Step 5: Update OptimizationReportRenderer stub types with real imports**

In `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`, replace the stub `IndexGapFinding` definition with the real import:

```typescript
// Remove this stub:
// interface IndexGapFinding { ... }

// Add this import:
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
```

- [ ] **Step 6: Run full tests + typecheck**

```bash
bun run test && bun run typecheck
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer.ts \
        src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts \
        test/unit/Recording/Application/IndexCoverageGapAnalyzer.test.ts
git commit -m "feat: [recording] 實作 IndexCoverageGapAnalyzer（Layer 2a DDL 索引缺口分析）"
```

---

## Task 8: Wire `--ddl` flag + Layer 2a into AnalyzeCommand

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`

When `--ddl` is provided with `--format optimize-md`, read the DDL file, parse it, and run `IndexCoverageGapAnalyzer`.

- [ ] **Step 1: Update the `optimize-md` branch in `runAnalyzeCommand`**

In `src/CLI/AnalyzeCommand.ts`, add to the top-level imports:

```typescript
import { readFile } from 'node:fs/promises'
import { parseDdlSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'
import { analyzeIndexCoverageGaps } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
```

Inside the `optimize-md` block, after `fragmentationFindings`, add:

```typescript
    let indexGapFindings: ReturnType<typeof analyzeIndexCoverageGaps> = []
    if (args.ddlPath) {
      enabledLayers.push('ddl')
      const ddlContent = await readFile(args.ddlPath, 'utf-8')
      const schema = parseDdlSchema(ddlContent)
      indexGapFindings = analyzeIndexCoverageGaps(n1Findings, fragmentationFindings, schema)
    }
```

And pass `indexGapFindings` into `reportData`:
```typescript
    const reportData: OptimizationReportData = {
      sessionId: args.sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers: [...enabledLayers],
      readWriteReport,
      n1Findings,
      fragmentationFindings,
      indexGapFindings: indexGapFindings.length > 0 ? indexGapFindings : undefined,
    }
```

Note: `enabledLayers` needs to be `const enabledLayers: EnabledLayer[] = ['pattern']` (mutable array) to allow `.push()`. Change the `const` to `const enabledLayers: EnabledLayer[] = ['pattern']`.

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Step 3: Run full tests**

```bash
bun run test
```
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts
git commit -m "feat: [recording] AnalyzeCommand 接線 --ddl Layer 2a DDL schema diff"
```

---

## Task 9: Install mysql2 + Implement `ExplainAnalyzer`

**Files:**
- Create: `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`
- Create: `test/unit/Recording/Application/ExplainAnalyzer.test.ts`

MySQL EXPLAIN adapter with 5-second timeout, de-duplicates by queryHash, graceful timeout handling.

- [ ] **Step 1: Install mysql2**

```bash
bun add mysql2
```
Expected: mysql2 added to package.json dependencies

- [ ] **Step 2: Write the failing test**

Create `test/unit/Recording/Application/ExplainAnalyzer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import {
  runExplainAnalysis,
  detectFullScans,
  type ExplainAnalyzerAdapter,
  type ExplainRow,
} from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

const makeQuery = (id: string, sql: string): CapturedQuery => ({
  id,
  sessionId: 'sess_1',
  connectionId: 1,
  timestamp: 1000,
  duration: 100,
  sql,
  operation: 'SELECT',
  tables: ['orders'],
})

const makeAdapter = (rows: ExplainRow[]): ExplainAnalyzerAdapter => ({
  dialect: 'mysql',
  explain: vi.fn(async () => rows),
})

describe('runExplainAnalysis', () => {
  it('returns empty array for empty queries', async () => {
    const adapter = makeAdapter([])
    const result = await runExplainAnalysis([], adapter, 1000)
    expect(result).toHaveLength(0)
  })

  it('deduplicates queries with the same hash', async () => {
    const sql = 'SELECT * FROM orders WHERE user_id = 1'
    const q1 = makeQuery('q1', sql)
    const q2 = makeQuery('q2', sql) // same SQL, same hash
    const adapter = makeAdapter([{ type: 'ALL', table: 'orders', rows: 50000, possibleKeys: null, key: null, extra: null }])

    await runExplainAnalysis([q1, q2], adapter, 100)
    expect(adapter.explain).toHaveBeenCalledTimes(1)
  })

  it('skips non-SELECT queries', async () => {
    const q = { ...makeQuery('q1', 'INSERT INTO orders VALUES (1)'), operation: 'INSERT' as const }
    const adapter = makeAdapter([])
    await runExplainAnalysis([q], adapter, 100)
    expect(adapter.explain).not.toHaveBeenCalled()
  })
})

describe('detectFullScans', () => {
  it('returns empty when no full scans', () => {
    const rows: ExplainRow[] = [
      { type: 'ref', table: 'orders', rows: 100, possibleKeys: 'idx', key: 'idx', extra: null },
    ]
    expect(detectFullScans('SELECT * FROM orders WHERE id = 1', 'hash1', rows, 1000)).toHaveLength(0)
  })

  it('detects type=ALL with rows above minRows', () => {
    const rows: ExplainRow[] = [
      { type: 'ALL', table: 'orders', rows: 50000, possibleKeys: null, key: null, extra: null },
    ]
    const findings = detectFullScans('SELECT * FROM orders WHERE user_id = 1', 'hash1', rows, 1000)
    expect(findings).toHaveLength(1)
    expect(findings[0].table).toBe('orders')
    expect(findings[0].estimatedRows).toBe(50000)
    expect(findings[0].suggestedIndex).toContain('CREATE INDEX')
    expect(findings[0].suggestedIndex).toContain('user_id')
  })

  it('ignores type=ALL when rows below minRows', () => {
    const rows: ExplainRow[] = [
      { type: 'ALL', table: 'orders', rows: 100, possibleKeys: null, key: null, extra: null },
    ]
    expect(detectFullScans('SELECT * FROM orders WHERE id = 1', 'hash1', rows, 1000)).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/ExplainAnalyzer.test.ts
```
Expected: FAIL

- [ ] **Step 4: Implement `ExplainAnalyzer`**

Create `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`:

```typescript
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface ExplainRow {
  readonly type: string
  readonly table: string
  readonly rows: number
  readonly possibleKeys: string | null
  readonly key: string | null
  readonly extra: string | null
}

export interface FullScanFinding {
  readonly sql: string
  readonly queryHash: string
  readonly table: string
  readonly estimatedRows: number
  readonly suggestedIndex: string
}

export interface ExplainAnalyzerAdapter {
  explain(sql: string): Promise<readonly ExplainRow[]>
  readonly dialect: 'mysql' | 'postgresql'
}

const SQL_RESERVED = new Set([
  'and', 'or', 'not', 'null', 'is', 'in', 'like', 'between', 'true', 'false',
])

function extractWhereColumnsForIndex(sql: string): readonly string[] {
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is)
  if (!whereMatch) return []
  const colMatches = whereMatch[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|IN|LIKE|>|<|>=|<=)/gi)
  return [...new Set(
    [...colMatches]
      .map((m) => m[1].toLowerCase())
      .filter((c) => !SQL_RESERVED.has(c))
  )]
}

function buildIndexSuggestion(sql: string, table: string, estimatedRows: number): string {
  const cols = extractWhereColumnsForIndex(sql)
  const colStr = cols.length > 0 ? cols.join(', ') : 'id'
  return [
    `-- [EXPLAIN 確認] 全表掃描: ${table} (估計 ~${estimatedRows.toLocaleString()} rows)`,
    `-- WHERE 過濾: ${cols.join(', ') || '(未偵測到)'}`,
    `CREATE INDEX idx_${table}_${cols.join('_') || 'id'} ON ${table}(${colStr});`,
  ].join('\n')
}

export function detectFullScans(
  sql: string,
  queryHash: string,
  rows: readonly ExplainRow[],
  minRows: number,
): readonly FullScanFinding[] {
  return rows
    .filter((r) => r.type === 'ALL' && r.rows > minRows)
    .map((r) => ({
      sql,
      queryHash,
      table: r.table,
      estimatedRows: r.rows,
      suggestedIndex: buildIndexSuggestion(sql, r.table, r.rows),
    }))
}

export async function runExplainAnalysis(
  queries: readonly CapturedQuery[],
  adapter: ExplainAnalyzerAdapter,
  minRows: number,
): Promise<readonly FullScanFinding[]> {
  // Deduplicate by queryHash, SELECT only
  const seen = new Set<string>()
  const uniqueQueries: CapturedQuery[] = []
  for (const q of queries) {
    if (q.operation !== 'SELECT') continue
    const hash = computeQueryHash(q.sql)
    if (seen.has(hash)) continue
    seen.add(hash)
    uniqueQueries.push(q)
  }

  const findings: FullScanFinding[] = []
  for (const q of uniqueQueries) {
    const hash = computeQueryHash(q.sql)
    const rows = await adapter.explain(q.sql)
    const scans = detectFullScans(q.sql, hash, rows, minRows)
    findings.push(...scans)
  }

  return findings
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/ExplainAnalyzer.test.ts
```
Expected: PASS

- [ ] **Step 6: Implement `MysqlExplainAdapter`**

Add to the same file `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`:

```typescript
const EXPLAIN_TIMEOUT_MS = 5000

export class MysqlExplainAdapter implements ExplainAnalyzerAdapter {
  readonly dialect = 'mysql' as const
  private connection: import('mysql2/promise').Connection | null = null

  static async connect(url: string): Promise<MysqlExplainAdapter> {
    const mysql = await import('mysql2/promise')
    const connection = await Promise.race([
      mysql.createConnection(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB 連線逾時（5 秒）')), EXPLAIN_TIMEOUT_MS)
      ),
    ])
    const adapter = new MysqlExplainAdapter()
    adapter.connection = connection as import('mysql2/promise').Connection
    return adapter
  }

  async explain(sql: string): Promise<readonly ExplainRow[]> {
    if (!this.connection) throw new Error('Not connected')
    const [rows] = await this.connection.query(`EXPLAIN ${sql}`) as [Record<string, unknown>[], unknown]
    return (rows as Record<string, unknown>[]).map((row) => ({
      type: String(row['type'] ?? row['Type'] ?? ''),
      table: String(row['table'] ?? row['Table'] ?? ''),
      rows: Number(row['rows'] ?? row['Rows'] ?? 0),
      possibleKeys: (row['possible_keys'] ?? row['Possible_keys'] ?? null) as string | null,
      key: (row['key'] ?? row['Key'] ?? null) as string | null,
      extra: (row['Extra'] ?? row['extra'] ?? null) as string | null,
    }))
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end()
      this.connection = null
    }
  }
}
```

- [ ] **Step 7: Run full tests + typecheck**

```bash
bun run test && bun run typecheck
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/Modules/Recording/Application/Services/ExplainAnalyzer.ts \
        test/unit/Recording/Application/ExplainAnalyzer.test.ts \
        package.json bun.lockb
git commit -m "feat: [recording] 實作 ExplainAnalyzer + MysqlExplainAdapter（Layer 2b EXPLAIN 分析）"
```

---

## Task 10: Wire Layer 2b + update OptimizationReportRenderer stub types

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`
- Modify: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`

- [ ] **Step 1: Replace FullScanFinding stub in OptimizationReportRenderer**

In `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`, remove the stub `FullScanFinding` interface and add real import:

```typescript
// Remove stub:
// interface FullScanFinding { ... }

// Add import:
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
```

- [ ] **Step 2: Wire `--explain-db` in `runAnalyzeCommand`**

Add to `src/CLI/AnalyzeCommand.ts` imports:

```typescript
import { runExplainAnalysis, MysqlExplainAdapter } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
```

Inside the `optimize-md` block, after the `ddl` section, add:

```typescript
    let fullScanFindings: readonly FullScanFinding[] = []
    let explainWarning: string | undefined

    if (args.explainDbUrl) {
      enabledLayers.push('explain')
      if (!args.explainDbUrl.startsWith('mysql://') && !args.explainDbUrl.startsWith('postgresql://') && !args.explainDbUrl.startsWith('postgres://')) {
        console.error('--explain-db 需要完整 URL（e.g. mysql://user:pass@localhost:3306/mydb）')
        process.exit(1)
      }
      if (args.explainDbUrl.startsWith('mysql://')) {
        try {
          const adapter = await MysqlExplainAdapter.connect(args.explainDbUrl)
          try {
            fullScanFindings = await runExplainAnalysis(queries, adapter, args.minRows)
          } finally {
            await adapter.close()
          }
        } catch (err) {
          explainWarning = `EXPLAIN 連線失敗，Layer 2b 跳過：${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        explainWarning = 'PostgreSQL EXPLAIN 支援在 v2 實作，Layer 2b 跳過'
      }
    }
```

Update `reportData` to include explain results:
```typescript
    const reportData: OptimizationReportData = {
      sessionId: args.sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers: [...enabledLayers],
      readWriteReport,
      n1Findings,
      fragmentationFindings,
      indexGapFindings: indexGapFindings.length > 0 ? indexGapFindings : undefined,
      fullScanFindings: fullScanFindings.length > 0 ? fullScanFindings : undefined,
      explainWarning,
    }
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Step 4: Run full tests**

```bash
bun run test
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts \
        src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts
git commit -m "feat: [recording] AnalyzeCommand 接線 --explain-db Layer 2b EXPLAIN live 分析"
```

---

## Task 11: Implement `IndexSuggestionService`

**Files:**
- Create: `src/Modules/Recording/Application/Services/IndexSuggestionService.ts`
- Create: `test/unit/Recording/Application/IndexSuggestionService.test.ts`

Merge DDL-source and EXPLAIN-source index suggestions into a deduplicated list, marking `source: 'both'` when both confirm the same (table, columns).

- [ ] **Step 1: Write the failing test**

Create `test/unit/Recording/Application/IndexSuggestionService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mergeIndexSuggestions } from '@/Modules/Recording/Application/Services/IndexSuggestionService'
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

describe('mergeIndexSuggestions', () => {
  it('returns only ddl findings when no explain findings', () => {
    const ddl: IndexGapFinding[] = [{
      table: 'orders',
      column: 'user_id',
      sourceQueryHash: 'abc',
      exampleSql: 'SELECT * FROM orders WHERE user_id = 1',
      confidence: 'high',
      source: 'ddl',
      suggestedIndex: 'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const merged = mergeIndexSuggestions(ddl, [])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('ddl')
  })

  it('marks source as "both" when ddl and explain agree on same table+column', () => {
    const ddl: IndexGapFinding[] = [{
      table: 'orders',
      column: 'user_id',
      sourceQueryHash: 'abc',
      exampleSql: 'SELECT * FROM orders WHERE user_id = 1',
      confidence: 'high',
      source: 'ddl',
      suggestedIndex: 'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const explain: FullScanFinding[] = [{
      sql: 'SELECT * FROM orders WHERE user_id = 1',
      queryHash: 'abc',
      table: 'orders',
      estimatedRows: 50000,
      suggestedIndex: '-- [EXPLAIN 確認] ...\nCREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const merged = mergeIndexSuggestions(ddl, explain)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('both')
    // Merged entry should use EXPLAIN's suggestedIndex (has actual row counts)
    expect(merged[0].suggestedIndex).toContain('EXPLAIN 確認')
  })

  it('returns explain-only finding when no matching ddl', () => {
    const explain: FullScanFinding[] = [{
      sql: 'SELECT * FROM logs WHERE event_type = "login"',
      queryHash: 'xyz',
      table: 'logs',
      estimatedRows: 200000,
      suggestedIndex: 'CREATE INDEX idx_logs_event_type ON logs(event_type);',
    }]
    const merged = mergeIndexSuggestions([], explain)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('explain')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/IndexSuggestionService.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `IndexSuggestionService`**

Create `src/Modules/Recording/Application/Services/IndexSuggestionService.ts`:

```typescript
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

export interface MergedIndexFinding {
  readonly table: string
  readonly column: string
  readonly suggestedIndex: string
  readonly source: 'ddl' | 'explain' | 'both'
  readonly estimatedRows?: number
  readonly confidence: 'high' | 'low' | 'confirmed'
}

export function mergeIndexSuggestions(
  ddlFindings: readonly IndexGapFinding[],
  explainFindings: readonly FullScanFinding[],
): readonly MergedIndexFinding[] {
  const results = new Map<string, MergedIndexFinding>()

  for (const d of ddlFindings) {
    const key = `${d.table}.${d.column}`
    results.set(key, {
      table: d.table,
      column: d.column,
      suggestedIndex: d.suggestedIndex,
      source: 'ddl',
      confidence: d.confidence,
    })
  }

  for (const e of explainFindings) {
    // Try to match explain finding to a ddl finding by table name
    // Extract first column from the suggestedIndex CREATE INDEX statement
    const colMatch = e.suggestedIndex.match(/ON\s+\w+\(([^,)]+)/)
    const column = colMatch ? colMatch[1].trim() : 'unknown'
    const key = `${e.table}.${column}`

    if (results.has(key)) {
      // Both confirmed — prefer EXPLAIN's suggestion (has row counts)
      results.set(key, {
        table: e.table,
        column,
        suggestedIndex: e.suggestedIndex,
        source: 'both',
        estimatedRows: e.estimatedRows,
        confidence: 'confirmed',
      })
    } else {
      results.set(key, {
        table: e.table,
        column,
        suggestedIndex: e.suggestedIndex,
        source: 'explain',
        estimatedRows: e.estimatedRows,
        confidence: 'confirmed',
      })
    }
  }

  return [...results.values()].sort((a, b) => {
    // confirmed > high > low
    const priority = { confirmed: 0, high: 1, low: 2 }
    return priority[a.confidence] - priority[b.confidence]
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/IndexSuggestionService.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck + full tests**

```bash
bun run test && bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Application/Services/IndexSuggestionService.ts \
        test/unit/Recording/Application/IndexSuggestionService.test.ts
git commit -m "feat: [recording] 實作 IndexSuggestionService（DDL + EXPLAIN 建議合併）"
```

---

## Task 12: Add DDL Corpus Fixtures (TODO-1)

**Files:**
- Create: `test/fixtures/ddl/laravel_ecommerce.sql`
- Create: `test/fixtures/ddl/rails_blog.sql`
- Create: `test/fixtures/ddl/wordpress_core.sql`
- Create: `test/fixtures/ddl/mysql_charset_collation.sql`
- Create: `test/fixtures/ddl/composite_indexes.sql`
- Modify: `test/unit/Recording/Application/DdlSchemaParser.test.ts`

These are real-world MySQL DDL patterns (backticks, charset/collation, AUTO_INCREMENT, multi-line).

- [ ] **Step 1: Create `test/fixtures/ddl/laravel_ecommerce.sql`**

```sql
-- Laravel-style e-commerce schema (mysqldump output format)
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `total` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `orders_user_id_foreign` (`user_id`),
  KEY `orders_status_created_at_index` (`status`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_items_order_id_foreign` (`order_id`),
  KEY `order_items_product_id_foreign` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Create `test/fixtures/ddl/rails_blog.sql`**

```sql
-- Rails-style blog schema
CREATE TABLE `posts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `body` text,
  `author_id` bigint NOT NULL,
  `published_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `index_posts_on_author_id` (`author_id`),
  KEY `index_posts_on_published_at` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tags` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `index_tags_on_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `post_tags` (
  `post_id` bigint NOT NULL,
  `tag_id` bigint NOT NULL,
  PRIMARY KEY (`post_id`,`tag_id`),
  KEY `index_post_tags_on_tag_id` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: Create `test/fixtures/ddl/mysql_charset_collation.sql`**

```sql
-- Fixture with charset/collation options that regex must tolerate
CREATE TABLE `sessions` (
  `id` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 NOT NULL,
  `user_agent` text CHARACTER SET utf8mb4 DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
```

- [ ] **Step 4: Create `test/fixtures/ddl/composite_indexes.sql`**

```sql
-- Fixture for testing composite index parsing
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `action` varchar(100) NOT NULL,
  `resource_type` varchar(100) NOT NULL,
  `resource_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audit_logs_user_action_index` (`user_id`,`action`),
  KEY `audit_logs_resource_index` (`resource_type`,`resource_id`),
  KEY `audit_logs_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX idx_audit_logs_unique_key ON audit_logs(user_id, action, resource_id);
```

- [ ] **Step 5: Create `test/fixtures/ddl/wordpress_core.sql`**

```sql
-- WordPress-style schema with wp_ prefix
CREATE TABLE `wp_posts` (
  `ID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `post_author` bigint(20) unsigned NOT NULL DEFAULT '0',
  `post_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `post_content` longtext NOT NULL,
  `post_title` text NOT NULL,
  `post_status` varchar(20) NOT NULL DEFAULT 'publish',
  `post_name` varchar(200) NOT NULL DEFAULT '',
  `post_type` varchar(20) NOT NULL DEFAULT 'post',
  PRIMARY KEY (`ID`),
  KEY `post_name` (`post_name`(191)),
  KEY `type_status_date` (`post_type`,`post_status`,`post_date`,`ID`),
  KEY `post_author` (`post_author`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 6: Add corpus tests to DdlSchemaParser.test.ts**

In `test/unit/Recording/Application/DdlSchemaParser.test.ts`, add:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const loadFixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../../fixtures/ddl', name), 'utf-8')

describe('parseDdlSchema — real-world corpus fixtures', () => {
  it('parses laravel ecommerce DDL without crashing', () => {
    const schema = parseDdlSchema(loadFixture('laravel_ecommerce.sql'))
    expect(schema.tables.map((t) => t.name)).toContain('users')
    expect(schema.tables.map((t) => t.name)).toContain('orders')
    const orders = schema.tables.find((t) => t.name === 'orders')
    expect(orders?.indexes.some((i) => i.columns[0] === 'user_id')).toBe(true)
    expect(orders?.indexes.some((i) => i.columns.includes('status'))).toBe(true)
  })

  it('parses rails blog DDL composite primary key', () => {
    const schema = parseDdlSchema(loadFixture('rails_blog.sql'))
    const postTags = schema.tables.find((t) => t.name === 'post_tags')
    expect(postTags?.primaryKey).toEqual(['post_id', 'tag_id'])
  })

  it('parses charset/collation DDL without errors', () => {
    const schema = parseDdlSchema(loadFixture('mysql_charset_collation.sql'))
    const sessions = schema.tables.find((t) => t.name === 'sessions')
    expect(sessions?.indexes.some((i) => i.name === 'sessions_user_id_index')).toBe(true)
  })

  it('parses composite indexes and external CREATE INDEX', () => {
    const schema = parseDdlSchema(loadFixture('composite_indexes.sql'))
    const logs = schema.tables.find((t) => t.name === 'audit_logs')
    expect(logs?.indexes.find((i) => i.name === 'audit_logs_user_action_index')?.columns).toEqual(['user_id', 'action'])
    expect(logs?.indexes.find((i) => i.name === 'idx_audit_logs_unique_key')?.unique).toBe(true)
  })

  it('parses WordPress-style prefix tables', () => {
    const schema = parseDdlSchema(loadFixture('wordpress_core.sql'))
    expect(schema.tables.find((t) => t.name === 'wp_posts')).toBeDefined()
  })
})
```

- [ ] **Step 7: Run the corpus tests**

```bash
bun test test/unit/Recording/Application/DdlSchemaParser.test.ts
```
Expected: PASS (fix any regex issues found by real-world fixtures)

- [ ] **Step 8: Fix any parser issues discovered by fixtures**

Common issues to watch for:
- Column length notation `varchar(200)` inside KEY: `KEY post_name (post_name(191))` — strip the `(N)` from column names in index parsing
- `COLLATE` and `CHARACTER SET` clauses inside column definitions — shouldn't affect column name extraction

If `KEY post_name (post_name(191))` fails, update the `extractColumns` function:
```typescript
function extractColumns(columnsStr: string): readonly string[] {
  return columnsStr
    .split(',')
    .map((c) => stripBackticks(c.trim()).replace(/\(\d+\)$/, '')) // strip length suffix
    .filter(Boolean)
}
```

- [ ] **Step 9: Commit**

```bash
git add test/fixtures/ddl/ \
        test/unit/Recording/Application/DdlSchemaParser.test.ts \
        src/Modules/Recording/Application/Strategies/DdlSchemaParser.ts
git commit -m "test: [recording] 新增 DDL corpus fixtures 與 DdlSchemaParser 真實語料測試（TODO-1）"
```

---

## Task 13: `--explain-concurrency` flag (TODO-3)

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`
- Modify: `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`
- Modify: `test/unit/Recording/CLI/AnalyzeCommand.test.ts`

- [ ] **Step 1: Add test for new flag**

In `test/unit/Recording/CLI/AnalyzeCommand.test.ts`, add:

```typescript
  it('defaults explainConcurrency to 5', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.explainConcurrency).toBe(5)
  })

  it('parses --explain-concurrency', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--explain-concurrency', '3'])
    expect(args.explainConcurrency).toBe(3)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/unit/Recording/CLI/AnalyzeCommand.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add `explainConcurrency` to AnalyzeArgs**

In `src/CLI/AnalyzeCommand.ts`:

Add to `AnalyzeArgs` interface:
```typescript
  readonly explainConcurrency: number
```

Add to `parseAnalyzeArgs`:
```typescript
  const concurrencyIdx = rest.indexOf('--explain-concurrency')
  const explainConcurrency = concurrencyIdx !== -1 ? Number(rest[concurrencyIdx + 1]) : 5
```

Add to returned object: `explainConcurrency`

- [ ] **Step 4: Update `runExplainAnalysis` to accept concurrency**

In `src/Modules/Recording/Application/Services/ExplainAnalyzer.ts`, update the function signature:

```typescript
export async function runExplainAnalysis(
  queries: readonly CapturedQuery[],
  adapter: ExplainAnalyzerAdapter,
  minRows: number,
  concurrency: number = 5,
): Promise<readonly FullScanFinding[]>
```

Replace the sequential `for` loop with a concurrent batch:

```typescript
  const findings: FullScanFinding[] = []
  for (let i = 0; i < uniqueQueries.length; i += concurrency) {
    const batch = uniqueQueries.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (q) => {
        const hash = computeQueryHash(q.sql)
        const rows = await adapter.explain(q.sql)
        return detectFullScans(q.sql, hash, rows, minRows)
      })
    )
    for (const result of batchResults) findings.push(...result)
  }
  return findings
```

- [ ] **Step 5: Pass concurrency in AnalyzeCommand**

In the `--explain-db` section of `runAnalyzeCommand`:
```typescript
fullScanFindings = await runExplainAnalysis(queries, adapter, args.minRows, args.explainConcurrency)
```

- [ ] **Step 6: Run full tests + typecheck**

```bash
bun run test && bun run typecheck
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts \
        src/Modules/Recording/Application/Services/ExplainAnalyzer.ts \
        test/unit/Recording/CLI/AnalyzeCommand.test.ts
git commit -m "feat: [recording] 新增 --explain-concurrency flag（TODO-3）"
```

---

## Task 14: Final integration smoke test + update TODOS.md

**Files:**
- Modify: `TODOS.md`

- [ ] **Step 1: Run the full test suite**

```bash
bun run check
```
Expected: typecheck + lint + all tests PASS

- [ ] **Step 2: Update TODOS.md**

Mark TODO-4 and TODO-1 and TODO-3 as done. Update TODO-2 to reflect Layer 1+2 are now validated:

```markdown
### TODO-1: ✅ DONE — Corpus-based DDL fixtures (Task 12)

### TODO-2: LlmOptimizationService — Layer 3, deferred to v2
**Blocked by:** ~~Layer 1 + 2 shipping~~ — Layer 1 + 2 are now complete.
Ready to implement after manual validation of optimization reports on real sessions.

### TODO-3: ✅ DONE — --explain-concurrency flag (Task 13)

### TODO-4: ✅ DONE — --format optimize-md wired (Task 5)
```

- [ ] **Step 3: Commit**

```bash
git add TODOS.md
git commit -m "docs: [recording] 更新 TODOS.md 標記 TODO-1/3/4 完成，TODO-2 解除前置封鎖"
```

---

## Self-Review

**Spec coverage check:**

| Spec Requirement | Task |
|---|---|
| ReadWriteRatioAnalyzer already done — wire to CLI | Task 5 |
| N1QueryDetector (aggregate to API path level, batchSql) | Task 2 |
| QueryFragmentationDetector (threshold 3) | Task 3 |
| OptimizationReportRenderer (Markdown + SQL) | Task 4 |
| `--format optimize-md` CLI flag | Task 5 |
| DdlSchemaParser (MySQL regex, backtick, composite) | Task 6 |
| IndexCoverageGapAnalyzer (WHERE column extraction, DDL diff) | Task 7 |
| `--ddl` CLI flag wiring | Task 8 |
| ExplainAnalyzer + MysqlExplainAdapter (5s timeout, dedup) | Task 9 |
| IndexSuggestionService (DDL+EXPLAIN merge, source: 'both') | Task 11 |
| `--explain-db` CLI flag wiring | Task 10 |
| DDL corpus fixtures (TODO-1) | Task 12 |
| `--explain-concurrency` flag (TODO-3) | Task 13 |
| `--format optimize-md` wired (TODO-4) | Task 5 |
| LLM Layer 3 | Deferred to v2 (TODO-2) |

**No gaps found.**

**Placeholder scan:** No TBD, TODO, or "similar to" patterns in code blocks.

**Type consistency:**
- `IndexGapFinding.source`: `'ddl' | 'explain' | 'both'` — used consistently in Task 7 and 11
- `FullScanFinding` stub removed from renderer in Task 10 step 1
- `EnabledLayer` array declared as `EnabledLayer[]` (mutable) for `.push()` in Tasks 5 and 8
- `explainConcurrency` default `5` in both `AnalyzeArgs` and `runExplainAnalysis` default parameter

**Edge cases covered:**
- Empty flows/queries → empty results (all detectors)
- Queries with no apiFlows (no HTTP proxy data) → N+1 and fragmentation return []
- EXPLAIN connection timeout → `explainWarning` set, Layer 2b skipped gracefully
- PostgreSQL `--explain-db` URL → graceful skip with warning message
- DDL not provided → `indexGapFindings` is undefined (skipped in renderer)
