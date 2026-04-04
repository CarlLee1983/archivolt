# Flow Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group `QueryChunk`s into `OperationFlow`s using navigate-boundary strategy, with automatic noise table detection, and expose pre-navigation bootstrap metadata in `OperationManifest`.

**Architecture:** Three new pure functions (`detectNoiseTables`, `groupIntoFlows`, `buildFlow`) wired into the existing `ChunkAnalyzerService`. New types (`OperationFlow`, `BootstrapInfo`) live in `OperationManifest.ts` to avoid circular imports. `ManifestMarkdownRenderer` gains two new sections for flows and bootstrap.

**Tech Stack:** TypeScript, Bun test runner (vitest-compatible API via `bun test`), `@/` alias for `src/`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/Modules/Recording/Domain/OperationManifest.ts` | Add `OperationFlow`, `BootstrapInfo`; extend `OperationManifest` |
| Create | `src/Modules/Recording/Application/Strategies/NoiseTableDetector.ts` | Frequency-based noise table detection |
| Create | `src/Modules/Recording/Application/Strategies/FlowGrouper.ts` | navigate-boundary grouping, bootstrap extraction |
| Modify | `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts` | Integrate noise detection + flow grouping |
| Modify | `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts` | Render `## Flows` and `## Bootstrap` sections |
| Create | `test/unit/Recording/Application/NoiseTableDetector.test.ts` | Unit tests for noise detection |
| Create | `test/unit/Recording/Application/FlowGrouper.test.ts` | Unit tests for flow grouping |
| Modify | `test/unit/Recording/Application/ChunkAnalyzerService.test.ts` | Tests for `flows`, `noiseTables`, `bootstrap` in manifest |
| Modify | `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts` | Tests for new sections |

---

## Task 1: Extend Domain Types

**Files:**
- Modify: `src/Modules/Recording/Domain/OperationManifest.ts`

- [ ] **Step 1: Add `OperationFlow` and `BootstrapInfo` to `OperationManifest.ts`**

Replace the entire file content:

```typescript
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

export interface BootstrapInfo {
  readonly queryCount: number
  readonly otherOperationCount: number
  readonly tablesAccessed: readonly string[]
}

export interface OperationFlow {
  readonly id: string
  readonly label: string
  readonly url: string
  readonly startTime: number
  readonly endTime: number
  readonly chunkIndices: readonly number[]
  readonly tables: readonly string[]
  readonly semanticTables: readonly string[]
  readonly dominantPattern: ChunkPattern
  readonly chunkPatternSequence: string
  readonly inferredRelations: readonly InferredRelation[]
}

export interface OperationManifest {
  readonly sessionId: string
  readonly recordedAt: { readonly start: number; readonly end: number }
  readonly operations: readonly OperationEntry[]
  readonly tableMatrix: readonly TableInvolvement[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly flows: readonly OperationFlow[]
  readonly noiseTables: readonly string[]
  readonly noiseThreshold: number
  readonly bootstrap: BootstrapInfo
  readonly stats: {
    readonly totalChunks: number
    readonly readOps: number
    readonly writeOps: number
    readonly mixedOps: number
    readonly silenceSplit: number
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run typecheck 2>&1 | head -30
```

Expected: errors only from `ChunkAnalyzerService.ts` (missing new fields in return). Ignore those for now.

- [ ] **Step 3: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add src/Modules/Recording/Domain/OperationManifest.ts
git commit -m "feat: [recording] 擴充 OperationManifest 加入 OperationFlow 與 BootstrapInfo 型別"
```

---

## Task 2: NoiseTableDetector (TDD)

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/NoiseTableDetector.ts`
- Create: `test/unit/Recording/Application/NoiseTableDetector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/Recording/Application/NoiseTableDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectNoiseTables } from '@/Modules/Recording/Application/Strategies/NoiseTableDetector'
import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'

function makeChunk(tables: string[]): QueryChunk {
  return {
    id: `chunk_${Math.random()}`,
    sessionId: 'rec_1',
    startTime: 1000,
    endTime: 1010,
    queries: [],
    tables,
    operations: [],
    pattern: 'read',
  }
}

describe('detectNoiseTables', () => {
  it('returns empty array for no chunks', () => {
    expect(detectNoiseTables([])).toEqual([])
  })

  it('returns tables appearing in more than 60% of chunks (default threshold)', () => {
    const chunks = [
      makeChunk(['users', 'orders']),
      makeChunk(['users', 'products']),
      makeChunk(['users', 'categories']),
      makeChunk(['users', 'cart_items']),
      makeChunk(['sessions']),
    ]
    // users: 4/5 = 0.80 > 0.60 → noise
    // sessions: 1/5 = 0.20 → not noise
    expect(detectNoiseTables(chunks)).toEqual(['users'])
  })

  it('returns multiple noise tables sorted alphabetically', () => {
    const chunks = [
      makeChunk(['users', 'sessions', 'orders']),
      makeChunk(['users', 'sessions', 'products']),
      makeChunk(['users', 'sessions']),
    ]
    // users: 3/3 = 1.0, sessions: 3/3 = 1.0 → both noise
    expect(detectNoiseTables(chunks)).toEqual(['sessions', 'users'])
  })

  it('respects custom threshold', () => {
    const chunks = [
      makeChunk(['users', 'orders']),
      makeChunk(['users', 'products']),
      makeChunk(['categories']),
    ]
    // users: 2/3 = 0.67 > 0.50 → noise at threshold 0.5
    expect(detectNoiseTables(chunks, 0.5)).toEqual(['users'])
  })

  it('returns empty when no table exceeds threshold', () => {
    const chunks = [
      makeChunk(['orders']),
      makeChunk(['products']),
      makeChunk(['categories']),
    ]
    expect(detectNoiseTables(chunks)).toEqual([])
  })

  it('uses strict greater-than comparison (exactly at threshold is not noise)', () => {
    const chunks = [
      makeChunk(['users']),
      makeChunk(['users']),
      makeChunk(['products']),
      makeChunk(['products']),
      makeChunk(['orders']),
    ]
    // users: 2/5 = 0.40, threshold 0.4 → 0.40 is NOT > 0.40 → not noise
    expect(detectNoiseTables(chunks, 0.4)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/NoiseTableDetector.test.ts 2>&1 | head -20
```

Expected: FAIL with `Cannot find module '@/Modules/Recording/Application/Strategies/NoiseTableDetector'`

- [ ] **Step 3: Implement `NoiseTableDetector.ts`**

Create `src/Modules/Recording/Application/Strategies/NoiseTableDetector.ts`:

```typescript
import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'

export const DEFAULT_NOISE_THRESHOLD = 0.6

export function detectNoiseTables(
  chunks: readonly QueryChunk[],
  threshold: number = DEFAULT_NOISE_THRESHOLD,
): readonly string[] {
  if (chunks.length === 0) return []

  const frequency = new Map<string, number>()
  for (const chunk of chunks) {
    for (const table of chunk.tables) {
      frequency.set(table, (frequency.get(table) ?? 0) + 1)
    }
  }

  const noiseFloor = chunks.length * threshold
  return [...frequency.entries()]
    .filter(([, count]) => count > noiseFloor)
    .map(([table]) => table)
    .sort()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/NoiseTableDetector.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add src/Modules/Recording/Application/Strategies/NoiseTableDetector.ts \
        test/unit/Recording/Application/NoiseTableDetector.test.ts
git commit -m "feat: [recording] 新增 NoiseTableDetector — 頻率閾值偵測噪音資料表"
```

---

## Task 3: FlowGrouper (TDD)

**Files:**
- Create: `src/Modules/Recording/Application/Strategies/FlowGrouper.ts`
- Create: `test/unit/Recording/Application/FlowGrouper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/Recording/Application/FlowGrouper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { groupIntoFlows } from '@/Modules/Recording/Application/Strategies/FlowGrouper'
import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'
import type { OperationEntry } from '@/Modules/Recording/Domain/OperationManifest'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

function makeMarker(
  timestamp: number,
  url: string,
  action: OperationMarker['action'] = 'navigate',
): OperationMarker {
  return { id: `mk_${timestamp}`, sessionId: 'rec_1', timestamp, url, action }
}

function makeChunk(overrides: {
  timestamp: number
  tables?: string[]
  pattern?: QueryChunk['pattern']
  marker?: OperationMarker
}): QueryChunk {
  return {
    id: `chunk_${overrides.timestamp}`,
    sessionId: 'rec_1',
    startTime: overrides.timestamp,
    endTime: overrides.timestamp + 10,
    queries: [],
    tables: overrides.tables ?? [],
    operations: [],
    pattern: overrides.pattern ?? 'read',
    marker: overrides.marker,
  }
}

function makeOp(index: number, tables: string[] = []): OperationEntry {
  return {
    chunkId: `chunk_${index}`,
    index,
    label: `op_${index}`,
    pattern: 'read',
    tables,
    sqlSummaries: [],
    inferredRelations: [],
    semantic: '',
  }
}

describe('groupIntoFlows', () => {
  it('returns empty flows and bootstrap when no navigate markers', () => {
    const chunks = [makeChunk({ timestamp: 1000, tables: ['sessions'] })]
    const ops = [makeOp(0, ['sessions'])]
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows).toEqual([])
    expect(result.bootstrap.queryCount).toBe(0)
    expect(result.bootstrap.tablesAccessed).toEqual(['sessions'])
  })

  it('captures pre-navigate chunks in bootstrap, not in flows', () => {
    const chunks = [
      makeChunk({ timestamp: 500, tables: ['migrations'] }),
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/home'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.bootstrap.tablesAccessed).toEqual(['migrations'])
    expect(result.flows).toHaveLength(1)
    expect(result.flows[0].url).toBe('/home')
    expect(result.flows[0].chunkIndices).toEqual([1, 2])
  })

  it('groups chunks between consecutive navigate markers into separate flows', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/login'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'write' }),
      makeChunk({ timestamp: 2000, marker: makeMarker(2000, '/dashboard'), pattern: 'marker' }),
      makeChunk({ timestamp: 2010, tables: ['orders'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows).toHaveLength(2)
    expect(result.flows[0].url).toBe('/login')
    expect(result.flows[0].tables).toEqual(['users'])
    expect(result.flows[1].url).toBe('/dashboard')
    expect(result.flows[1].tables).toEqual(['orders'])
  })

  it('excludes noise tables from semanticTables but keeps them in tables', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/products'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users', 'products'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, ['users'])
    expect(result.flows[0].tables).toEqual(['products', 'users'])
    expect(result.flows[0].semanticTables).toEqual(['products'])
  })

  it('computes chunkPatternSequence excluding marker-only chunks', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/checkout'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['orders'], pattern: 'read' }),
      makeChunk({ timestamp: 1020, tables: ['orders', 'items'], pattern: 'write' }),
      makeChunk({ timestamp: 1030, tables: ['orders'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkPatternSequence).toBe('read → write → read')
  })

  it('returns "(no queries)" as sequence for navigate-only flow', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/logout'), pattern: 'marker' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkPatternSequence).toBe('(no queries)')
  })

  it('computes dominantPattern as mixed when both read and write present', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/cart'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, pattern: 'read' }),
      makeChunk({ timestamp: 1020, pattern: 'write' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].dominantPattern).toBe('mixed')
  })

  it('computes dominantPattern as write when all non-marker chunks are write', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/delete'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, pattern: 'write' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].dominantPattern).toBe('write')
  })

  it('stores correct chunkIndices referencing full original array positions', () => {
    const chunks = [
      makeChunk({ timestamp: 500, tables: ['boot'] }),         // index 0 - bootstrap
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/home'), pattern: 'marker' }), // index 1
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'read' }),                   // index 2
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkIndices).toEqual([1, 2])
  })

  it('filters inferredRelations to exclude noise table relations', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/orders'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['orders', 'users'], pattern: 'read' }),
    ]
    const ops: OperationEntry[] = [
      makeOp(0, []),
      {
        ...makeOp(1, ['orders', 'users']),
        inferredRelations: [
          {
            sourceTable: 'orders',
            sourceColumn: 'user_id',
            targetTable: 'users',
            targetColumn: 'id',
            confidence: 'high',
            evidence: 'JOIN ON in chunk_1010',
          },
          {
            sourceTable: 'orders',
            sourceColumn: 'product_id',
            targetTable: 'products',
            targetColumn: 'id',
            confidence: 'low',
            evidence: 'co-occurring in chunk_1010',
          },
        ],
      },
    ]
    const result = groupIntoFlows(chunks, ops, ['users'])
    // orders → users relation filtered (users is noise)
    // orders → products relation kept
    expect(result.flows[0].inferredRelations).toHaveLength(1)
    expect(result.flows[0].inferredRelations[0].targetTable).toBe('products')
  })

  it('sets correct startTime and endTime on flow', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/page'), pattern: 'marker' }),
      makeChunk({ timestamp: 1050, pattern: 'read' }),
    ]
    // endTime = startTime + 10 per makeChunk
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].startTime).toBe(1000)
    expect(result.flows[0].endTime).toBe(1060)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/FlowGrouper.test.ts 2>&1 | head -20
```

Expected: FAIL with `Cannot find module '@/Modules/Recording/Application/Strategies/FlowGrouper'`

- [ ] **Step 3: Implement `FlowGrouper.ts`**

Create `src/Modules/Recording/Application/Strategies/FlowGrouper.ts`:

```typescript
import type { QueryChunk, ChunkPattern } from '@/Modules/Recording/Domain/QueryChunk'
import type {
  OperationEntry,
  OperationFlow,
  BootstrapInfo,
  InferredRelation,
} from '@/Modules/Recording/Domain/OperationManifest'
import { mergeRelations } from '@/Modules/Recording/Application/Strategies/RelationInferrer'

export interface FlowGroupResult {
  readonly flows: readonly OperationFlow[]
  readonly bootstrap: BootstrapInfo
}

function computeDominantPattern(patterns: readonly ChunkPattern[]): ChunkPattern {
  if (patterns.length === 0) return 'marker'
  const counts = { read: 0, write: 0, mixed: 0, marker: 0 }
  for (const p of patterns) counts[p]++
  if (counts.mixed > 0 || (counts.read > 0 && counts.write > 0)) return 'mixed'
  if (counts.write > 0) return 'write'
  if (counts.read > 0) return 'read'
  return 'marker'
}

function buildFlow(
  index: number,
  url: string,
  startTime: number,
  chunkIndices: readonly number[],
  allChunks: readonly QueryChunk[],
  allOperations: readonly OperationEntry[],
  noiseSet: ReadonlySet<string>,
): OperationFlow {
  const flowChunks = chunkIndices.map((i) => allChunks[i])
  const flowOps = chunkIndices.map((i) => allOperations[i])

  const endTime =
    flowChunks.length > 0 ? Math.max(...flowChunks.map((c) => c.endTime)) : startTime

  const allTables = [...new Set(flowChunks.flatMap((c) => c.tables))].sort()
  const semanticTables = allTables.filter((t) => !noiseSet.has(t))

  const nonMarkerPatterns = flowChunks
    .map((c) => c.pattern)
    .filter((p): p is Exclude<ChunkPattern, 'marker'> => p !== 'marker')

  const allRelations: InferredRelation[] = flowOps.flatMap((o) => [...o.inferredRelations])
  const filteredRelations = mergeRelations(allRelations).filter(
    (r) => !noiseSet.has(r.sourceTable) && !noiseSet.has(r.targetTable),
  )

  return {
    id: `flow_${startTime}_${index}`,
    label: url,
    url,
    startTime,
    endTime,
    chunkIndices,
    tables: allTables,
    semanticTables,
    dominantPattern: computeDominantPattern(nonMarkerPatterns),
    chunkPatternSequence: nonMarkerPatterns.join(' → ') || '(no queries)',
    inferredRelations: filteredRelations,
  }
}

export function groupIntoFlows(
  chunks: readonly QueryChunk[],
  operations: readonly OperationEntry[],
  noiseTables: readonly string[],
): FlowGroupResult {
  const noiseSet = new Set(noiseTables)

  const firstNavIndex = chunks.findIndex((c) => c.marker?.action === 'navigate')

  const preNavChunks = firstNavIndex === -1 ? [...chunks] : chunks.slice(0, firstNavIndex)
  const bootstrap: BootstrapInfo = {
    queryCount: preNavChunks.reduce((s, c) => s + c.queries.length, 0),
    otherOperationCount: preNavChunks.reduce(
      (s, c) => s + c.queries.filter((q) => q.operation === 'OTHER').length,
      0,
    ),
    tablesAccessed: [...new Set(preNavChunks.flatMap((c) => c.tables))].sort(),
  }

  if (firstNavIndex === -1) return { flows: [], bootstrap }

  const flows: OperationFlow[] = []
  let currentIndices: number[] = []
  let currentUrl = ''
  let currentStartTime = 0
  let flowIdx = 0

  for (let i = firstNavIndex; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (chunk.marker?.action === 'navigate') {
      if (currentIndices.length > 0) {
        flows.push(
          buildFlow(flowIdx++, currentUrl, currentStartTime, currentIndices, chunks, operations, noiseSet),
        )
      }
      currentIndices = [i]
      currentUrl = chunk.marker.url
      currentStartTime = chunk.startTime
    } else {
      currentIndices.push(i)
    }
  }

  if (currentIndices.length > 0) {
    flows.push(
      buildFlow(flowIdx, currentUrl, currentStartTime, currentIndices, chunks, operations, noiseSet),
    )
  }

  return { flows, bootstrap }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/FlowGrouper.test.ts
```

Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add src/Modules/Recording/Application/Strategies/FlowGrouper.ts \
        test/unit/Recording/Application/FlowGrouper.test.ts
git commit -m "feat: [recording] 新增 FlowGrouper — navigate-boundary 分組與 bootstrap 擷取"
```

---

## Task 4: Wire into ChunkAnalyzerService

**Files:**
- Modify: `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts`
- Modify: `test/unit/Recording/Application/ChunkAnalyzerService.test.ts`

- [ ] **Step 1: Add new tests to `ChunkAnalyzerService.test.ts`**

Append these test cases to the existing `describe('ChunkAnalyzerService', ...)` block in `test/unit/Recording/Application/ChunkAnalyzerService.test.ts`:

```typescript
  it('populates flows with navigate-boundary grouping', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'INSERT INTO orders (id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/checkout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.flows).toHaveLength(2)
    expect(manifest.flows[0].url).toBe('/products')
    expect(manifest.flows[1].url).toBe('/checkout')
  })

  it('detects noise tables that appear in more than 60% of chunks', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM users', tables: ['users'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'SELECT * FROM users JOIN products ON users.id = products.owner_id', tables: ['users', 'products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 3010, sql: 'SELECT * FROM users JOIN orders ON users.id = orders.user_id', tables: ['users', 'orders'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/a', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/b', action: 'navigate' }),
      makeMarker({ timestamp: 3000, url: '/c', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.noiseTables).toContain('users')
    expect(manifest.noiseThreshold).toBe(0.6)
  })

  it('captures pre-navigation queries in bootstrap', () => {
    const queries = [
      makeQuery({ timestamp: 100, sql: 'SET NAMES utf8mb4', tables: [], operation: 'OTHER' }),
      makeQuery({ timestamp: 200, sql: 'SELECT * FROM migrations', tables: ['migrations'], operation: 'SELECT' }),
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.bootstrap.queryCount).toBe(2)
    expect(manifest.bootstrap.otherOperationCount).toBe(1)
    expect(manifest.bootstrap.tablesAccessed).toContain('migrations')
  })

  it('sets semanticTables on flows excluding noise tables', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM users', tables: ['users'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'SELECT * FROM users JOIN products ON users.id = products.owner_id', tables: ['users', 'products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 3010, sql: 'SELECT * FROM users JOIN orders ON users.id = orders.user_id', tables: ['users', 'orders'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/a', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/b', action: 'navigate' }),
      makeMarker({ timestamp: 3000, url: '/c', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    // users is noise; semanticTables for /b flow should only have products
    const flowB = manifest.flows.find((f) => f.url === '/b')
    expect(flowB?.semanticTables).not.toContain('users')
    expect(flowB?.semanticTables).toContain('products')
  })
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/ChunkAnalyzerService.test.ts 2>&1 | tail -20
```

Expected: new tests FAIL (manifest missing `flows`, `noiseTables`, `bootstrap`)

- [ ] **Step 3: Update `ChunkAnalyzerService.ts`**

Replace the entire file:

```typescript
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
import {
  detectNoiseTables,
  DEFAULT_NOISE_THRESHOLD,
} from '@/Modules/Recording/Application/Strategies/NoiseTableDetector'
import { groupIntoFlows } from '@/Modules/Recording/Application/Strategies/FlowGrouper'

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
      if (chunk.pattern === 'read') readOps++
      else if (chunk.pattern === 'write') writeOps++
      else if (chunk.pattern === 'mixed') mixedOps++

      if (!chunk.marker) silenceSplit++

      const chunkRelations = inferRelations(chunk.queries, chunk.id)
      allRelations.push(...chunkRelations)

      for (const table of chunk.tables) {
        const entry = tableMap.get(table) ?? { read: 0, write: 0, ops: new Set<number>() }
        if (chunk.pattern === 'read') entry.read++
        else entry.write++
        entry.ops.add(index)
        tableMap.set(table, entry)
      }

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
        semantic: inferSemantic(chunk.queries),
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

    const noiseTables = detectNoiseTables(chunks, DEFAULT_NOISE_THRESHOLD)
    const { flows, bootstrap } = groupIntoFlows(chunks, operations, noiseTables)

    return {
      sessionId: session.id,
      recordedAt: {
        start: session.startedAt,
        end: session.endedAt ?? session.startedAt,
      },
      operations,
      tableMatrix,
      inferredRelations: mergeRelations(allRelations),
      flows,
      noiseTables,
      noiseThreshold: DEFAULT_NOISE_THRESHOLD,
      bootstrap,
      stats: { totalChunks: chunks.length, readOps, writeOps, mixedOps, silenceSplit },
    }
  }
}
```

- [ ] **Step 4: Run all ChunkAnalyzerService tests**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Application/ChunkAnalyzerService.test.ts
```

Expected: all tests PASS (both original and new)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts \
        test/unit/Recording/Application/ChunkAnalyzerService.test.ts
git commit -m "feat: [recording] ChunkAnalyzerService 整合 FlowGrouper 與 NoiseTableDetector"
```

---

## Task 5: Update ManifestMarkdownRenderer

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts`
- Modify: `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts`

- [ ] **Step 1: Add new tests to `ManifestMarkdownRenderer.test.ts`**

First read the existing test file to find where to append, then add these cases inside the existing `describe` block:

```typescript
  it('renders ## Flows section with flow labels and semantic tables', () => {
    const manifest = makeManifest({
      flows: [
        {
          id: 'flow_1000_0',
          label: '/products',
          url: '/products',
          startTime: 1000,
          endTime: 1100,
          chunkIndices: [0],
          tables: ['products', 'users'],
          semanticTables: ['products'],
          dominantPattern: 'read',
          chunkPatternSequence: 'read',
          inferredRelations: [],
        },
      ],
      noiseTables: ['users'],
      noiseThreshold: 0.6,
      bootstrap: { queryCount: 2, otherOperationCount: 1, tablesAccessed: ['migrations'] },
    })
    const output = renderManifest(manifest)
    expect(output).toContain('## Flows')
    expect(output).toContain('/products')
    expect(output).toContain('products')
    expect(output).toContain('noise tables: `users`')
  })

  it('renders ## Bootstrap section with pre-navigation stats', () => {
    const manifest = makeManifest({
      flows: [],
      noiseTables: [],
      noiseThreshold: 0.6,
      bootstrap: { queryCount: 3, otherOperationCount: 2, tablesAccessed: ['migrations', 'sessions'] },
    })
    const output = renderManifest(manifest)
    expect(output).toContain('## Bootstrap')
    expect(output).toContain('3')
    expect(output).toContain('migrations')
  })

  it('omits ## Flows section when there are no flows', () => {
    const manifest = makeManifest({
      flows: [],
      noiseTables: [],
      noiseThreshold: 0.6,
      bootstrap: { queryCount: 0, otherOperationCount: 0, tablesAccessed: [] },
    })
    const output = renderManifest(manifest)
    expect(output).not.toContain('## Flows')
  })
```

Note: `makeManifest` in the existing test file is a helper that builds a minimal `OperationManifest`. You will need to check if it accepts partial overrides and update it to include the new required fields (`flows`, `noiseTables`, `noiseThreshold`, `bootstrap`). Read `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts` first to understand the helper's current shape, then add the new fields with defaults:

```typescript
// In the existing makeManifest helper, add these defaults:
flows: overrides.flows ?? [],
noiseTables: overrides.noiseTables ?? [],
noiseThreshold: overrides.noiseThreshold ?? 0.6,
bootstrap: overrides.bootstrap ?? { queryCount: 0, otherOperationCount: 0, tablesAccessed: [] },
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts 2>&1 | tail -20
```

Expected: compilation errors (missing `flows`/`noiseTables`/`bootstrap` in test `makeManifest`) and new tests FAIL

- [ ] **Step 3: Update the renderer**

Replace `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts`:

```typescript
import type {
  OperationManifest,
  OperationEntry,
  OperationFlow,
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

function renderFlow(flow: OperationFlow, index: number): string {
  const lines: string[] = []
  lines.push(`### Flow ${index + 1}: ${flow.label}`)
  lines.push(`- **Pattern Sequence**: ${flow.chunkPatternSequence}`)
  lines.push(`- **Dominant Pattern**: ${flow.dominantPattern}`)

  if (flow.semanticTables.length > 0) {
    lines.push(`- **Semantic Tables**: ${flow.semanticTables.map((t) => `\`${t}\``).join(', ')}`)
  } else {
    lines.push('- **Semantic Tables**: (全為噪音資料表)')
  }

  if (flow.inferredRelations.length > 0) {
    const relStr = flow.inferredRelations
      .map((r) => `${r.sourceTable} → ${r.targetTable} (${r.sourceColumn}, ${r.confidence})`)
      .join(', ')
    lines.push(`- **推斷關係**: ${relStr}`)
  }

  lines.push(`- **Chunks**: ${flow.chunkIndices.map((i) => `#${i + 1}`).join(', ')}`)

  return lines.join('\n')
}

export function renderManifest(manifest: OperationManifest): string {
  const uniqueTables = new Set(manifest.tableMatrix.map((t) => t.table))
  const startDate = formatDate(manifest.recordedAt.start)
  const endDate = formatDate(manifest.recordedAt.end)

  const sections: string[] = []

  sections.push(`# Operation Manifest — Session: ${manifest.sessionId}`)
  sections.push(`> 錄製時間: ${startDate} ~ ${endDate} | Chunks: ${manifest.stats.totalChunks} | Tables: ${uniqueTables.size}`)
  sections.push('')
  sections.push('## Operations')
  sections.push('')
  for (const op of manifest.operations) {
    sections.push(renderOperation(op))
    sections.push('')
  }

  if (manifest.flows.length > 0) {
    const noiseLabel =
      manifest.noiseTables.length > 0
        ? ` (noise tables: ${manifest.noiseTables.map((t) => `\`${t}\``).join(', ')})`
        : ''
    sections.push(`## Flows${noiseLabel}`)
    sections.push('')
    for (let i = 0; i < manifest.flows.length; i++) {
      sections.push(renderFlow(manifest.flows[i], i))
      sections.push('')
    }
  }

  sections.push('## Bootstrap (Pre-Navigation)')
  sections.push('')
  sections.push(`- **Queries captured**: ${manifest.bootstrap.queryCount}`)
  sections.push(`- **OTHER operations**: ${manifest.bootstrap.otherOperationCount}`)
  if (manifest.bootstrap.tablesAccessed.length > 0) {
    sections.push(`- **Tables accessed**: ${manifest.bootstrap.tablesAccessed.map((t) => `\`${t}\``).join(', ')}`)
  } else {
    sections.push('- **Tables accessed**: (none)')
  }
  sections.push('')

  sections.push('## Table Involvement Matrix')
  sections.push('')
  sections.push('| Table | Read | Write | Operations |')
  sections.push('|-------|------|-------|------------|')
  for (const t of manifest.tableMatrix) {
    const ops = t.operationIndices.map((i) => `#${i + 1}`).join(', ')
    sections.push(`| ${t.table} | ${t.readCount} | ${t.writeCount} | ${ops} |`)
  }

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

  sections.push('')
  sections.push('## Machine-Readable Summary')
  sections.push('')
  sections.push('```json')
  sections.push(JSON.stringify(manifest, null, 2))
  sections.push('```')

  return sections.join('\n')
}
```

- [ ] **Step 4: Run renderer tests**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test 2>&1 | tail -20
```

Expected: all tests PASS, 0 failures

- [ ] **Step 6: Typecheck**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts \
        test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts
git commit -m "feat: [recording] ManifestMarkdownRenderer 加入 Flows 與 Bootstrap 段落"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| navigate-boundary flow grouping | Task 3 `groupIntoFlows` |
| Pre-navigate bootstrap metadata (queryCount, otherOperationCount, tablesAccessed) | Task 3 `groupIntoFlows` |
| Noise table detection (frequency > threshold) | Task 2 `detectNoiseTables` |
| `semanticTables` excludes noise from flow | Task 3 `buildFlow` |
| `inferredRelations` per flow excludes noise table relations | Task 3 `buildFlow` |
| `noiseTables`, `noiseThreshold`, `bootstrap`, `flows` on manifest | Task 1 types + Task 4 service |
| Renderer outputs Flows and Bootstrap sections | Task 5 |
| Flows section omitted when empty | Task 5 |

### Type Consistency

- `OperationFlow` defined in Task 1 (`OperationManifest.ts`), used in Task 3 (`FlowGrouper.ts`) and Task 5 (renderer) — consistent
- `BootstrapInfo` defined in Task 1, used in Task 3 `FlowGroupResult` and Task 4 manifest — consistent
- `FlowGroupResult` defined in `FlowGrouper.ts` (Task 3) — only used in Task 4 `ChunkAnalyzerService` — consistent
- `DEFAULT_NOISE_THRESHOLD` exported from `NoiseTableDetector.ts` (Task 2), imported in Task 4 — consistent

### No Placeholders

All steps contain complete code. No TBDs.
