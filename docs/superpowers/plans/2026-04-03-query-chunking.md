# Query Chunking 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將側錄的 DB query 與使用者操作標記（marker）關聯成邏輯事件（chunk），並在前端 ER 圖上以時間線面板視覺化呈現。

**Architecture:** 擴展現有 Recording 模組 — Domain 層新增 OperationMarker 和 QueryChunk 型別，buildChunks 純函數做即時計算。RecordingRepository 新增 markers.jsonl 持久化。前端新增 Zustand recordingStore 驅動 TimelinePanel 和 ER 圖高亮。

**Tech Stack:** Bun + TypeScript (backend), React + Zustand + ReactFlow (frontend), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-03-query-chunking-design.md`

---

## File Structure

### Backend — 新增

| File | Responsibility |
|------|---------------|
| `src/Modules/Recording/Domain/OperationMarker.ts` | OperationMarker 型別 + createMarker 工廠 |
| `src/Modules/Recording/Domain/QueryChunk.ts` | QueryChunk 型別 + buildChunks 演算法 |
| `test/unit/Recording/Domain/OperationMarker.test.ts` | Marker 工廠測試 |
| `test/unit/Recording/Domain/QueryChunk.test.ts` | Chunking 演算法測試 |
| `test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts` | Marker 持久化測試 |
| `test/unit/Recording/Application/RecordingService.marker.test.ts` | addMarker 服務測試 |
| `test/unit/Recording/Presentation/RecordingController.marker.test.ts` | Marker API 測試 |

### Backend — 修改

| File | Changes |
|------|---------|
| `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` | 新增 appendMarkers / loadMarkers |
| `src/Modules/Recording/Application/Services/RecordingService.ts` | 新增 addMarker 方法 |
| `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` | 新增 addMarker / getChunks / getMarkers 方法 |
| `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` | 新增 3 個路由 |

### Frontend — 新增

| File | Responsibility |
|------|---------------|
| `web/src/api/recording.ts` | 後端 Recording API 呼叫 |
| `web/src/stores/recordingStore.ts` | Zustand store：sessions / chunks / activeChunk |
| `web/src/components/Timeline/TimelinePanel.tsx` | 側邊面板容器 + session 選擇器 |
| `web/src/components/Timeline/ChunkCard.tsx` | 單一 chunk 卡片 |

### Frontend — 修改

| File | Changes |
|------|---------|
| `web/src/App.tsx` | 加入 TimelinePanel |
| `web/src/components/Canvas/ERCanvas.tsx` | 讀取 activeChunk 驅動 node/edge 高亮 |

---

## Task 1: OperationMarker Domain 型別

**Files:**
- Create: `src/Modules/Recording/Domain/OperationMarker.ts`
- Test: `test/unit/Recording/Domain/OperationMarker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Recording/Domain/OperationMarker.test.ts
import { describe, it, expect } from 'vitest'
import { createMarker, type OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

describe('createMarker', () => {
  it('creates a marker with timestamp and unique id', () => {
    const marker = createMarker({
      sessionId: 'rec_1',
      url: '/login',
      action: 'navigate',
    })
    expect(marker.id).toMatch(/^mk_/)
    expect(marker.timestamp).toBeGreaterThan(0)
    expect(marker.sessionId).toBe('rec_1')
    expect(marker.url).toBe('/login')
    expect(marker.action).toBe('navigate')
    expect(marker.target).toBeUndefined()
    expect(marker.label).toBeUndefined()
  })

  it('includes optional target and label', () => {
    const marker = createMarker({
      sessionId: 'rec_1',
      url: '/product/3',
      action: 'submit',
      target: 'form#product-form',
      label: '儲存商品',
    })
    expect(marker.target).toBe('form#product-form')
    expect(marker.label).toBe('儲存商品')
  })

  it('generates unique ids', () => {
    const a = createMarker({ sessionId: 'rec_1', url: '/', action: 'navigate' })
    const b = createMarker({ sessionId: 'rec_1', url: '/', action: 'navigate' })
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Recording/Domain/OperationMarker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/Modules/Recording/Domain/OperationMarker.ts

export type MarkerAction = 'navigate' | 'submit' | 'click' | 'request'

export interface OperationMarker {
  readonly id: string
  readonly sessionId: string
  readonly timestamp: number
  readonly url: string
  readonly action: MarkerAction
  readonly target?: string
  readonly label?: string
}

let _counter = 0

export function createMarker(params: {
  sessionId: string
  url: string
  action: MarkerAction
  target?: string
  label?: string
}): OperationMarker {
  return {
    id: `mk_${Date.now()}_${_counter++}`,
    timestamp: Date.now(),
    ...params,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Recording/Domain/OperationMarker.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Domain/OperationMarker.ts test/unit/Recording/Domain/OperationMarker.test.ts
git commit -m "feat: [recording] OperationMarker Domain 型別與工廠函數"
```

---

## Task 2: QueryChunk Domain 型別與 buildChunks 演算法

**Files:**
- Create: `src/Modules/Recording/Domain/QueryChunk.ts`
- Test: `test/unit/Recording/Domain/QueryChunk.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Recording/Domain/QueryChunk.test.ts
import { describe, it, expect } from 'vitest'
import { buildChunks, type QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'
import { createCapturedQuery, type CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { createMarker, type OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

function makeQuery(overrides: {
  timestamp: number
  tables?: string[]
  operation?: CapturedQuery['operation']
  sql?: string
}): CapturedQuery {
  return {
    id: `q_${overrides.timestamp}`,
    sessionId: 'rec_1',
    connectionId: 1,
    timestamp: overrides.timestamp,
    duration: 5,
    sql: overrides.sql ?? 'SELECT 1',
    operation: overrides.operation ?? 'SELECT',
    tables: overrides.tables ?? ['users'],
  }
}

function makeMarker(timestamp: number, url: string, action: OperationMarker['action'] = 'navigate'): OperationMarker {
  return {
    id: `mk_${timestamp}`,
    sessionId: 'rec_1',
    timestamp,
    url,
    action,
  }
}

const DEFAULT_CONFIG = { silenceThresholdMs: 500 }

describe('buildChunks', () => {
  it('returns empty array for no queries', () => {
    const chunks = buildChunks([], [], DEFAULT_CONFIG)
    expect(chunks).toEqual([])
  })

  it('groups consecutive queries within threshold into one chunk', () => {
    const queries = [
      makeQuery({ timestamp: 1000, tables: ['users'] }),
      makeQuery({ timestamp: 1010, tables: ['settings'] }),
      makeQuery({ timestamp: 1020, tables: ['users'] }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].queries).toHaveLength(3)
    expect(chunks[0].tables).toEqual(['settings', 'users'])
    expect(chunks[0].startTime).toBe(1000)
    expect(chunks[0].endTime).toBe(1020)
  })

  it('splits chunks at silence threshold', () => {
    const queries = [
      makeQuery({ timestamp: 1000 }),
      makeQuery({ timestamp: 1010 }),
      // 600ms gap > 500ms threshold
      makeQuery({ timestamp: 1610 }),
      makeQuery({ timestamp: 1620 }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].queries).toHaveLength(2)
    expect(chunks[1].queries).toHaveLength(2)
  })

  it('splits chunks at marker boundary', () => {
    const queries = [
      makeQuery({ timestamp: 1000 }),
      makeQuery({ timestamp: 1010 }),
      // marker at 1015 — within threshold but forces new chunk
      makeQuery({ timestamp: 1020 }),
      makeQuery({ timestamp: 1030 }),
    ]
    const markers = [makeMarker(1015, '/dashboard')]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].queries).toHaveLength(2)
    expect(chunks[0].marker).toBeUndefined()
    expect(chunks[1].queries).toHaveLength(2)
    expect(chunks[1].marker?.url).toBe('/dashboard')
  })

  it('assigns pattern read for all SELECT', () => {
    const queries = [
      makeQuery({ timestamp: 1000, operation: 'SELECT' }),
      makeQuery({ timestamp: 1010, operation: 'SELECT' }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks[0].pattern).toBe('read')
  })

  it('assigns pattern write for all INSERT/UPDATE/DELETE', () => {
    const queries = [
      makeQuery({ timestamp: 1000, operation: 'INSERT' }),
      makeQuery({ timestamp: 1010, operation: 'UPDATE' }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks[0].pattern).toBe('write')
  })

  it('assigns pattern mixed for SELECT + INSERT', () => {
    const queries = [
      makeQuery({ timestamp: 1000, operation: 'SELECT' }),
      makeQuery({ timestamp: 1010, operation: 'INSERT' }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks[0].pattern).toBe('mixed')
  })

  it('collects unique operations', () => {
    const queries = [
      makeQuery({ timestamp: 1000, operation: 'SELECT' }),
      makeQuery({ timestamp: 1010, operation: 'SELECT' }),
      makeQuery({ timestamp: 1020, operation: 'INSERT' }),
    ]
    const chunks = buildChunks(queries, [], DEFAULT_CONFIG)
    expect(chunks[0].operations).toEqual(['INSERT', 'SELECT'])
  })

  it('handles marker before any query', () => {
    const queries = [
      makeQuery({ timestamp: 1010 }),
    ]
    const markers = [makeMarker(1000, '/login')]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].marker?.url).toBe('/login')
    expect(chunks[0].queries).toHaveLength(1)
  })

  it('handles marker with no following queries', () => {
    const queries = [
      makeQuery({ timestamp: 1000 }),
    ]
    const markers = [makeMarker(2000, '/logout')]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    // First chunk: query at 1000 (no marker)
    // The marker at 2000 has no queries — should produce an empty chunk or be skipped
    expect(chunks).toHaveLength(1)
    expect(chunks[0].queries).toHaveLength(1)
  })

  it('handles consecutive markers', () => {
    const queries = [
      makeQuery({ timestamp: 1010 }),
      makeQuery({ timestamp: 1020 }),
      makeQuery({ timestamp: 1110 }),
    ]
    const markers = [
      makeMarker(1000, '/page-a'),
      makeMarker(1100, '/page-b'),
    ]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].marker?.url).toBe('/page-a')
    expect(chunks[0].queries).toHaveLength(2)
    expect(chunks[1].marker?.url).toBe('/page-b')
    expect(chunks[1].queries).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Recording/Domain/QueryChunk.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/Modules/Recording/Domain/QueryChunk.ts
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

export type ChunkPattern = 'read' | 'write' | 'mixed'

export interface QueryChunk {
  readonly id: string
  readonly sessionId: string
  readonly startTime: number
  readonly endTime: number
  readonly queries: readonly CapturedQuery[]
  readonly tables: readonly string[]
  readonly operations: readonly string[]
  readonly pattern: ChunkPattern
  readonly marker?: OperationMarker
}

export interface ChunkConfig {
  readonly silenceThresholdMs: number
}

type TimelineEntry =
  | { readonly type: 'query'; readonly timestamp: number; readonly query: CapturedQuery }
  | { readonly type: 'marker'; readonly timestamp: number; readonly marker: OperationMarker }

function determinePattern(queries: readonly CapturedQuery[]): ChunkPattern {
  const ops = new Set(queries.map((q) => q.operation))
  const hasRead = ops.has('SELECT')
  const hasWrite = ops.has('INSERT') || ops.has('UPDATE') || ops.has('DELETE')
  if (hasRead && hasWrite) return 'mixed'
  if (hasWrite) return 'write'
  return 'read'
}

function finalizeChunk(
  sessionId: string,
  queries: CapturedQuery[],
  marker: OperationMarker | undefined,
  index: number,
): QueryChunk | null {
  if (queries.length === 0) return null
  const tables = [...new Set(queries.flatMap((q) => q.tables))].sort()
  const operations = [...new Set(queries.map((q) => q.operation))].sort()
  return {
    id: `chunk_${queries[0].timestamp}_${index}`,
    sessionId,
    startTime: queries[0].timestamp,
    endTime: queries[queries.length - 1].timestamp,
    queries,
    tables,
    operations,
    pattern: determinePattern(queries),
    marker,
  }
}

export function buildChunks(
  queries: readonly CapturedQuery[],
  markers: readonly OperationMarker[],
  config: ChunkConfig,
): readonly QueryChunk[] {
  if (queries.length === 0) return []

  const timeline: TimelineEntry[] = [
    ...queries.map((q) => ({ type: 'query' as const, timestamp: q.timestamp, query: q })),
    ...markers.map((m) => ({ type: 'marker' as const, timestamp: m.timestamp, marker: m })),
  ]
  timeline.sort((a, b) => a.timestamp - b.timestamp)

  const chunks: QueryChunk[] = []
  let currentQueries: CapturedQuery[] = []
  let currentMarker: OperationMarker | undefined
  let lastQueryTimestamp: number | null = null

  for (const entry of timeline) {
    if (entry.type === 'marker') {
      // Finalize current chunk before starting new one
      const chunk = finalizeChunk(
        entry.marker.sessionId,
        currentQueries,
        currentMarker,
        chunks.length,
      )
      if (chunk) chunks.push(chunk)
      currentQueries = []
      currentMarker = entry.marker
      lastQueryTimestamp = null
      continue
    }

    // entry.type === 'query'
    const { query } = entry

    // Check silence threshold
    if (
      lastQueryTimestamp !== null &&
      query.timestamp - lastQueryTimestamp > config.silenceThresholdMs
    ) {
      const chunk = finalizeChunk(query.sessionId, currentQueries, currentMarker, chunks.length)
      if (chunk) chunks.push(chunk)
      currentQueries = []
      currentMarker = undefined
    }

    currentQueries.push(query)
    lastQueryTimestamp = query.timestamp
  }

  // Finalize last chunk
  if (currentQueries.length > 0) {
    const sessionId = currentQueries[0].sessionId
    const chunk = finalizeChunk(sessionId, currentQueries, currentMarker, chunks.length)
    if (chunk) chunks.push(chunk)
  }

  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Recording/Domain/QueryChunk.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Domain/QueryChunk.ts test/unit/Recording/Domain/QueryChunk.test.ts
git commit -m "feat: [recording] QueryChunk 型別與 buildChunks 純函數演算法"
```

---

## Task 3: RecordingRepository — markers 持久化

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts`
- Test: `test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { createMarker } from '@/Modules/Recording/Domain/OperationMarker'

const TEST_DIR = path.resolve(__dirname, '../../../../tmp-test-markers')

describe('RecordingRepository markers', () => {
  let repo: RecordingRepository

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it('appendMarkers creates markers.jsonl and loadMarkers reads it', async () => {
    const sessionId = 'test_session_1'
    // Create session directory
    const sessionDir = path.join(TEST_DIR, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const markers = [
      createMarker({ sessionId, url: '/login', action: 'navigate' }),
      createMarker({ sessionId, url: '/login', action: 'submit', target: 'form#login' }),
    ]

    await repo.appendMarkers(sessionId, markers)
    const loaded = await repo.loadMarkers(sessionId)

    expect(loaded).toHaveLength(2)
    expect(loaded[0].url).toBe('/login')
    expect(loaded[0].action).toBe('navigate')
    expect(loaded[1].action).toBe('submit')
    expect(loaded[1].target).toBe('form#login')
  })

  it('appendMarkers appends to existing file', async () => {
    const sessionId = 'test_session_2'
    const sessionDir = path.join(TEST_DIR, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const batch1 = [createMarker({ sessionId, url: '/a', action: 'navigate' })]
    const batch2 = [createMarker({ sessionId, url: '/b', action: 'click' })]

    await repo.appendMarkers(sessionId, batch1)
    await repo.appendMarkers(sessionId, batch2)

    const loaded = await repo.loadMarkers(sessionId)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].url).toBe('/a')
    expect(loaded[1].url).toBe('/b')
  })

  it('loadMarkers returns empty array for missing file', async () => {
    const loaded = await repo.loadMarkers('nonexistent')
    expect(loaded).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts`
Expected: FAIL — appendMarkers/loadMarkers not found

- [ ] **Step 3: Add appendMarkers and loadMarkers to RecordingRepository**

In `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts`, add:

```typescript
// Add import at the top
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

// Add method inside the class, after queriesFile
private markersFile(sessionId: string): string {
  return path.join(this.sessionDir(sessionId), 'markers.jsonl')
}

// Add after appendQueries
async appendMarkers(sessionId: string, markers: readonly OperationMarker[]): Promise<void> {
  if (markers.length === 0) return
  const lines = markers.map((m) => JSON.stringify(m)).join('\n') + '\n'
  const filePath = this.markersFile(sessionId)
  const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
  await writeFile(filePath, existing + lines, 'utf-8')
}

async loadMarkers(sessionId: string): Promise<OperationMarker[]> {
  const filePath = this.markersFile(sessionId)
  if (!existsSync(filePath)) return []
  const text = await readFile(filePath, 'utf-8')
  if (!text.trim()) return []
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as OperationMarker)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full Recording test suite to check for regressions**

Run: `bunx vitest run test/unit/Recording/`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts test/unit/Recording/Infrastructure/RecordingRepository.markers.test.ts
git commit -m "feat: [recording] RecordingRepository markers.jsonl 持久化"
```

---

## Task 4: RecordingService — addMarker 方法

**Files:**
- Modify: `src/Modules/Recording/Application/Services/RecordingService.ts`
- Test: `test/unit/Recording/Application/RecordingService.marker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Recording/Application/RecordingService.marker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'

function createMockRepo(): RecordingRepository {
  return {
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(null),
    appendQueries: vi.fn().mockResolvedValue(undefined),
    loadQueries: vi.fn().mockResolvedValue([]),
    appendMarkers: vi.fn().mockResolvedValue(undefined),
    loadMarkers: vi.fn().mockResolvedValue([]),
    listSessions: vi.fn().mockResolvedValue([]),
  } as unknown as RecordingRepository
}

function createMockParser(): IProtocolParser {
  return {
    extractQuery: vi.fn().mockReturnValue(null),
    parseResponse: vi.fn().mockReturnValue({ type: 'unknown' }),
    isHandshakePhase: vi.fn().mockReturnValue(false),
  }
}

describe('RecordingService.addMarker', () => {
  let service: RecordingService
  let repo: RecordingRepository

  beforeEach(() => {
    repo = createMockRepo()
    service = new RecordingService(repo, createMockParser())
  })

  it('throws when no active session', () => {
    expect(() =>
      service.addMarker({ url: '/login', action: 'navigate' }),
    ).toThrow('No active recording session')
  })

  it('creates and persists marker when session is active', async () => {
    // Start a session by directly setting internal state
    // We need to mock TcpProxy to avoid actual socket — use a simpler approach
    // by calling start with a mock that doesn't actually listen
    const originalStart = service.start.bind(service)
    // Instead: set currentSession directly via a minimal start flow
    // Since TcpProxy tries to open a socket, we need to test through the public API
    // with a mock. Let's use a different approach — test that addMarker works after
    // manually setting the session state.

    // Access internal state for testing (pragmatic approach for service test)
    ;(service as any).currentSession = {
      id: 'rec_test',
      startedAt: Date.now(),
      status: 'recording',
      proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
      stats: { totalQueries: 0, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
    }

    const marker = service.addMarker({
      url: '/product/3',
      action: 'submit',
      target: 'form#product-form',
    })

    expect(marker.id).toMatch(/^mk_/)
    expect(marker.sessionId).toBe('rec_test')
    expect(marker.url).toBe('/product/3')
    expect(marker.action).toBe('submit')
    expect(marker.target).toBe('form#product-form')
    expect(repo.appendMarkers).toHaveBeenCalledWith('rec_test', [marker])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run test/unit/Recording/Application/RecordingService.marker.test.ts`
Expected: FAIL — addMarker is not a function

- [ ] **Step 3: Add addMarker to RecordingService**

In `src/Modules/Recording/Application/Services/RecordingService.ts`, add:

```typescript
// Add import at the top
import { createMarker, type OperationMarker, type MarkerAction } from '@/Modules/Recording/Domain/OperationMarker'

// Add method inside the class, after status()
addMarker(params: {
  url: string
  action: MarkerAction
  target?: string
  label?: string
}): OperationMarker {
  if (!this.currentSession) {
    throw new Error('No active recording session.')
  }

  const marker = createMarker({
    sessionId: this.currentSession.id,
    ...params,
  })

  this.repo.appendMarkers(this.currentSession.id, [marker])
  return marker
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run test/unit/Recording/Application/RecordingService.marker.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/RecordingService.ts test/unit/Recording/Application/RecordingService.marker.test.ts
git commit -m "feat: [recording] RecordingService.addMarker — marker 建立與持久化"
```

---

## Task 5: RecordingController — marker 與 chunks endpoints

**Files:**
- Modify: `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`
- Modify: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`

- [ ] **Step 1: Add addMarker, getChunks, getMarkers to RecordingController**

In `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`, add the following methods:

```typescript
// Add imports at top
import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'

// Add inside the class, after getSession()

async addMarker(ctx: IHttpContext): Promise<Response> {
  const body = await ctx.getBody<{
    url: string
    action: string
    target?: string
    label?: string
  }>()

  try {
    const marker = this.service.addMarker({
      url: body.url,
      action: body.action as any,
      target: body.target,
      label: body.label,
    })
    return ctx.json(ApiResponse.success(marker), 201)
  } catch (error: any) {
    if (error.message.includes('No active recording session')) {
      return ctx.json(ApiResponse.error('NO_ACTIVE_SESSION', error.message), 400)
    }
    return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
  }
}

async getMarkers(ctx: IHttpContext): Promise<Response> {
  const id = ctx.getParam('id')!
  const cursor = ctx.getQuery('cursor')
  const limit = Number.parseInt(ctx.getQuery('limit') ?? '100', 10)

  const allMarkers = await this.repo.loadMarkers(id)

  let startIdx = 0
  if (cursor) {
    const cursorIdx = allMarkers.findIndex((m) => m.id === cursor)
    startIdx = cursorIdx !== -1 ? cursorIdx + 1 : 0
  }

  const page = allMarkers.slice(startIdx, startIdx + limit)
  const nextCursor = startIdx + limit < allMarkers.length ? page[page.length - 1]?.id ?? null : null

  return ctx.json(
    ApiResponse.success({
      markers: page,
      nextCursor,
    }),
  )
}

async getChunks(ctx: IHttpContext): Promise<Response> {
  const id = ctx.getParam('id')!
  const silenceThresholdMs = Number.parseInt(ctx.getQuery('silenceThresholdMs') ?? '500', 10)
  const cursor = ctx.getQuery('cursor')
  const limit = Number.parseInt(ctx.getQuery('limit') ?? '50', 10)

  const session = await this.repo.loadSession(id)
  if (!session) {
    return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
  }

  const queries = await this.repo.loadQueries(id)
  const markers = await this.repo.loadMarkers(id)
  const allChunks = buildChunks(queries, markers, { silenceThresholdMs })

  // Summarize chunks: strip full query content, keep only metadata
  const summarized = allChunks.map((chunk) => ({
    ...chunk,
    queries: chunk.queries.map((q) => ({
      id: q.id,
      operation: q.operation,
      tables: q.tables,
      timestamp: q.timestamp,
      duration: q.duration,
    })),
  }))

  let startIdx = 0
  if (cursor) {
    const cursorIdx = summarized.findIndex((c) => c.id === cursor)
    startIdx = cursorIdx !== -1 ? cursorIdx + 1 : 0
  }

  const page = summarized.slice(startIdx, startIdx + limit)
  const nextCursor =
    startIdx + limit < summarized.length ? page[page.length - 1]?.id ?? null : null

  const withMarker = allChunks.filter((c) => c.marker).length
  return ctx.json(
    ApiResponse.success({
      chunks: page,
      stats: {
        totalChunks: allChunks.length,
        withMarker,
        withoutMarker: allChunks.length - withMarker,
      },
      nextCursor,
    }),
  )
}

async getChunkQueries(ctx: IHttpContext): Promise<Response> {
  const id = ctx.getParam('id')!
  const chunkId = ctx.getParam('chunkId')!
  const silenceThresholdMs = Number.parseInt(ctx.getQuery('silenceThresholdMs') ?? '500', 10)

  const queries = await this.repo.loadQueries(id)
  const markers = await this.repo.loadMarkers(id)
  const allChunks = buildChunks(queries, markers, { silenceThresholdMs })

  const chunk = allChunks.find((c) => c.id === chunkId)
  if (!chunk) {
    return ctx.json(ApiResponse.error('NOT_FOUND', `Chunk ${chunkId} not found`), 404)
  }

  return ctx.json(ApiResponse.success({ queries: chunk.queries }))
}
```

- [ ] **Step 2: Register new routes**

In `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`, add new routes inside the group:

```typescript
r.post('/recording/marker', (ctx) => controller.addMarker(ctx))
r.get('/recordings/:id/markers', (ctx) => controller.getMarkers(ctx))
r.get('/recordings/:id/chunks', (ctx) => controller.getChunks(ctx))
r.get('/recordings/:id/chunks/:chunkId/queries', (ctx) => controller.getChunkQueries(ctx))
```

- [ ] **Step 3: Update getSession to return counts instead of full arrays**

In `RecordingController.ts`, modify the existing `getSession` method to return counts:

```typescript
async getSession(ctx: IHttpContext): Promise<Response> {
  const id = ctx.getParam('id')!
  const session = await this.repo.loadSession(id)
  if (!session) {
    return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
  }
  const queries = await this.repo.loadQueries(id)
  const markers = await this.repo.loadMarkers(id)
  return ctx.json(
    ApiResponse.success({
      session,
      queryCount: queries.length,
      markerCount: markers.length,
    }),
  )
}
```

- [ ] **Step 4: Run full test suite**

Run: `bunx vitest run test/unit/Recording/`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Presentation/Controllers/RecordingController.ts src/Modules/Recording/Presentation/Routes/Recording.routes.ts
git commit -m "feat: [recording] marker 與 chunks API endpoints"
```

---

## Task 6: 前端 API 層 — recording.ts

**Files:**
- Create: `web/src/api/recording.ts`

- [ ] **Step 1: Create the API module**

```typescript
// web/src/api/recording.ts

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json: ApiResponse<T> = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message ?? 'Unknown error')
  }
  return json.data!
}

export interface RecordingSession {
  id: string
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopped'
  proxy: { listenPort: number; targetHost: string; targetPort: number }
  stats: {
    totalQueries: number
    byOperation: Record<string, number>
    tablesAccessed: string[]
    connectionCount: number
  }
}

export interface OperationMarker {
  id: string
  sessionId: string
  timestamp: number
  url: string
  action: 'navigate' | 'submit' | 'click' | 'request'
  target?: string
  label?: string
}

export interface ChunkQuerySummary {
  id: string
  operation: string
  tables: string[]
  timestamp: number
  duration: number
}

export interface QueryChunk {
  id: string
  sessionId: string
  startTime: number
  endTime: number
  queries: ChunkQuerySummary[]
  tables: string[]
  operations: string[]
  pattern: 'read' | 'write' | 'mixed'
  marker?: OperationMarker
}

export interface ChunksResponse {
  chunks: QueryChunk[]
  stats: { totalChunks: number; withMarker: number; withoutMarker: number }
  nextCursor: string | null
}

export const recordingApi = {
  getStatus: () =>
    request<{ recording: boolean; session?: RecordingSession; proxyPort?: number }>(
      '/api/recording/status',
    ),

  listSessions: () => request<RecordingSession[]>('/api/recordings'),

  getSession: (id: string) =>
    request<{ session: RecordingSession }>(`/api/recordings/${id}`),

  getChunks: (id: string, params?: { silenceThresholdMs?: number; cursor?: string; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.silenceThresholdMs) searchParams.set('silenceThresholdMs', String(params.silenceThresholdMs))
    if (params?.cursor) searchParams.set('cursor', params.cursor)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<ChunksResponse>(`/api/recordings/${id}/chunks${qs ? `?${qs}` : ''}`)
  },

  getChunkQueries: (sessionId: string, chunkId: string) =>
    request<{ queries: Array<ChunkQuerySummary & { sql: string }> }>(
      `/api/recordings/${sessionId}/chunks/${chunkId}/queries`,
    ),
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/recording.ts
git commit -m "feat: [web] recording API 模組"
```

---

## Task 7: 前端 recordingStore

**Files:**
- Create: `web/src/stores/recordingStore.ts`

- [ ] **Step 1: Create the Zustand store**

```typescript
// web/src/stores/recordingStore.ts
import { create } from 'zustand'
import { recordingApi, type RecordingSession, type QueryChunk } from '@/api/recording'

interface RecordingState {
  sessions: RecordingSession[]
  selectedSessionId: string | null
  chunks: QueryChunk[]
  activeChunkId: string | null
  loading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  selectSession: (sessionId: string | null) => Promise<void>
  setActiveChunk: (chunkId: string | null) => void
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
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

- [ ] **Step 2: Commit**

```bash
git add web/src/stores/recordingStore.ts
git commit -m "feat: [web] recordingStore — session 與 chunk 狀態管理"
```

---

## Task 8: ChunkCard 元件

**Files:**
- Create: `web/src/components/Timeline/ChunkCard.tsx`

- [ ] **Step 1: Create ChunkCard component**

```tsx
// web/src/components/Timeline/ChunkCard.tsx
import { memo } from 'react'
import type { QueryChunk } from '@/api/recording'

interface ChunkCardProps {
  chunk: QueryChunk
  isActive: boolean
  onClick: () => void
}

const ACTION_ICONS: Record<string, string> = {
  navigate: '🧭',
  submit: '📤',
  click: '👆',
  request: '📡',
}

const PATTERN_ICONS: Record<string, string> = {
  read: '📖',
  write: '✏️',
  mixed: '🔀',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function ChunkCardComponent({ chunk, isActive, onClick }: ChunkCardProps) {
  const duration = chunk.endTime - chunk.startTime
  const hasMarker = !!chunk.marker

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-3 py-2.5 mb-1.5 cursor-pointer transition-all duration-200 border ${
        isActive
          ? 'bg-primary/20 border-primary/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
          : 'border-white/5 hover:bg-white/5 hover:border-white/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">
          {hasMarker
            ? ACTION_ICONS[chunk.marker!.action] ?? '📍'
            : PATTERN_ICONS[chunk.pattern] ?? '📦'}
        </span>
        <span className="text-xs font-medium text-text truncate flex-1">
          {hasMarker ? chunk.marker!.url : chunk.tables.join(', ')}
        </span>
      </div>

      {/* Marker target */}
      {hasMarker && chunk.marker!.target && (
        <div className="text-[10px] text-muted font-mono ml-6 mb-1 truncate">
          {chunk.marker!.target}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-3 ml-6 text-[10px] text-muted">
        <span className="font-mono">{formatTime(chunk.startTime)}</span>
        <span>{chunk.queries.length} queries</span>
        {duration > 0 && <span>{duration}ms</span>}
        <span
          className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
            chunk.pattern === 'read'
              ? 'bg-emerald-500/10 text-emerald-400'
              : chunk.pattern === 'write'
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-purple-500/10 text-purple-400'
          }`}
        >
          {chunk.pattern}
        </span>
      </div>
    </button>
  )
}

export const ChunkCard = memo(ChunkCardComponent)
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Timeline/ChunkCard.tsx
git commit -m "feat: [web] ChunkCard — chunk 卡片元件"
```

---

## Task 9: TimelinePanel 元件

**Files:**
- Create: `web/src/components/Timeline/TimelinePanel.tsx`

- [ ] **Step 1: Create TimelinePanel component**

```tsx
// web/src/components/Timeline/TimelinePanel.tsx
import { useEffect, useState } from 'react'
import { useRecordingStore } from '@/stores/recordingStore'
import { ChunkCard } from './ChunkCard'

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

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Auto-open when sessions exist
  useEffect(() => {
    if (sessions.length > 0 && !isOpen) {
      setIsOpen(true)
    }
  }, [sessions.length])

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

          {/* Chunk list */}
          <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
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
                <ChunkCard
                  key={chunk.id}
                  chunk={chunk}
                  isActive={activeChunkId === chunk.id}
                  onClick={() =>
                    setActiveChunk(activeChunkId === chunk.id ? null : chunk.id)
                  }
                />
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

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Timeline/TimelinePanel.tsx
git commit -m "feat: [web] TimelinePanel — 時間線側邊面板"
```

---

## Task 10: 整合 — App.tsx 加入 TimelinePanel

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add TimelinePanel to App**

In `web/src/App.tsx`, add import at top:

```typescript
import { TimelinePanel } from '@/components/Timeline/TimelinePanel'
```

In the return JSX, add `<TimelinePanel />` before the closing `</div>` of the root container (before the Empty State Overlay). Find the line:

```tsx
{/* Empty State Overlay */}
```

Add before it:

```tsx
{/* ── Right: Timeline Panel ── */}
<TimelinePanel />
```

- [ ] **Step 2: Adjust detail panel to not overlap**

The detail panel (Table Details) and TimelinePanel both anchor to the right side. When both are visible, detail panel should shift left. In `web/src/App.tsx`, modify the detail panel's positioning. Find:

```tsx
<div className={`fixed top-20 right-4 bottom-4 w-80
```

Change to:

```tsx
<div className={`fixed top-20 bottom-4 w-80
```

And add a dynamic `right` value based on whether recording sessions exist. This requires reading recording store. Add import:

```typescript
import { useRecordingStore } from '@/stores/recordingStore'
```

Inside the `App` component, add:

```typescript
const hasSessions = useRecordingStore((s) => s.sessions.length > 0)
```

Then update the detail panel className:

```tsx
<div className={`fixed top-20 bottom-4 w-80 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl flex flex-col z-40 overflow-hidden transition-all duration-300 ${
  hasSessions ? 'right-[22rem]' : 'right-4'
} ${
  selected ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 pointer-events-none'
}`}>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd web && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: [web] 整合 TimelinePanel 至 App 佈局"
```

---

## Task 11: ERCanvas chunk 高亮

**Files:**
- Modify: `web/src/components/Canvas/ERCanvas.tsx`

- [ ] **Step 1: Add chunk highlight logic**

In `web/src/components/Canvas/ERCanvas.tsx`, add import:

```typescript
import { useRecordingStore, getActiveChunkTables } from '@/stores/recordingStore'
```

Inside `ERCanvasInner`, add after the existing store reads:

```typescript
const highlightTables = useRecordingStore((s) => getActiveChunkTables(s))
```

Modify the `layoutNodes` useMemo to include highlight state in node data. Update the `TableNodeData` typing (this changes `TableNode.tsx` too). Instead, pass highlight state through a simpler mechanism — add a CSS class approach.

Update the `nodes` useMemo to apply highlight styles. Find the `layoutNodes` useMemo and modify the node mapping:

```typescript
const { layoutNodes, layoutEdges } = useMemo(() => {
  if (!model) return { layoutNodes: [], layoutEdges: [] }
  const nodes: Node[] = visibleTables.map((name) => ({
    id: name,
    type: 'tableNode',
    position: { x: 0, y: 0 },
    data: {
      table: model.tables[name],
      isLowDetail,
      isHighlighted: highlightTables ? highlightTables.has(name) : null,
      isDimmed: highlightTables ? !highlightTables.has(name) : false,
    } satisfies TableNodeData,
  }))
  const allEdges = buildEdges(model).filter(
    (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target)
  )
  return { layoutNodes: autoLayout(nodes, allEdges), layoutEdges: allEdges }
}, [model, visibleTables, isLowDetail, highlightTables])
```

Also add `highlightTables` to the `layoutEdges` memo. After computing `allEdges`, apply styles:

```typescript
const styledEdges = highlightTables
  ? allEdges.map((edge) => {
      const bothHighlighted = highlightTables.has(edge.source) && highlightTables.has(edge.target)
      return bothHighlighted
        ? { ...edge, style: { ...edge.style, stroke: '#60a5fa', strokeWidth: 3 } }
        : { ...edge, style: { ...edge.style, opacity: 0.15 } }
    })
  : allEdges
return { layoutNodes: autoLayout(nodes, styledEdges), layoutEdges: styledEdges }
```

- [ ] **Step 2: Update TableNodeData to support highlight/dim**

In `web/src/components/Canvas/TableNode.tsx`, update the interface:

```typescript
export interface TableNodeData {
  table: Table
  isLowDetail?: boolean
  isHighlighted?: boolean | null  // true = highlighted, null = no chunk active
  isDimmed?: boolean
  [key: string]: unknown
}
```

In `TableNodeComponent`, extract the new props:

```typescript
const { table, isLowDetail, isHighlighted, isDimmed } = data as TableNodeData
```

On the outermost `<div>`, add dim/highlight styles. Modify the className:

```tsx
<div
  className={`rounded-xl border transition-all duration-300 ${
    selected
      ? 'border-primary ring-4 ring-primary/30 scale-[1.05] z-50 shadow-[0_0_40px_rgba(59,130,246,0.5)]'
      : isLowDetail
        ? 'border-white/40 bg-[#1e293b] shadow-2xl scale-[0.95]'
        : 'border-white/10 backdrop-blur-md bg-white/5 hover:border-white/30 shadow-glass'
  } ${isLowDetail ? 'min-w-[180px]' : 'min-w-[240px]'} ${
    isDimmed ? 'opacity-15' : ''
  } ${
    isHighlighted === true ? 'ring-2 ring-primary/60 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : ''
  }`}
>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd web && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Canvas/ERCanvas.tsx web/src/components/Canvas/TableNode.tsx
git commit -m "feat: [web] ER 圖 chunk 高亮 — node 與 edge 聯動"
```

---

## Task 12: 端對端驗證

- [ ] **Step 1: Run full backend test suite**

Run: `bunx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors (fix if needed with `bun run lint:fix`)

- [ ] **Step 4: Start dev server and verify no runtime errors**

Run: `bun run dev:all`
Expected: API on :3100, Web on :5173, no startup errors

- [ ] **Step 5: Commit any lint/format fixes**

```bash
git add -A
git commit -m "chore: lint 與格式修正"
```
