# Proxy 效能優化實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 TCP Proxy 與 HTTP Proxy 的側錄機制改為 WriteStream 架構，消除 O(n) 檔案讀取、解除 HTTP 回應阻塞、並移除不必要的記憶體 buffer，使 100+ QPS 環境下額外延遲 < 1ms。

**Architecture:** Session 啟動時對每個 JSONL 檔開一個持久 `fs.WriteStream`（flags: 'a'），所有 append 操作改為同步 `stream.write()`。HTTP Proxy 改為 fire-and-forget：拿到 upstream response 後立即回傳，chunk 寫入在背景進行。`RecordingService` 移除 buffer/flushTimer/allQueries，改用 incremental stats 物件。

**Tech Stack:** Bun, TypeScript, Node.js `fs.createWriteStream`, `bun:test`

---

### 改動檔案一覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/Modules/Recording/Domain/Session.ts` | 修改 | 新增 `IncrementalStats` 介面與 `applyIncrementalStats` 函式 |
| `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` | 修改 | 新增 `openStreams`/`closeStreams`，append 方法改為同步 stream.write |
| `src/Modules/Recording/Application/Services/RecordingService.ts` | 修改 | 移除 buffer/flushTimer/allQueries，改用 incremental stats |
| `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts` | 修改 | `onChunk` 改為 fire-and-forget |
| `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.test.ts` | 新增 | WriteStream append 正確性測試 |
| `src/Modules/Recording/Application/Services/RecordingService.test.ts` | 新增 | incremental stats + stream 生命週期測試 |

---

## Task 1：Session domain — 新增 `applyIncrementalStats`

**Files:**
- Modify: `src/Modules/Recording/Domain/Session.ts`

- [ ] **Step 1：寫失敗測試**

建立 `src/Modules/Recording/Domain/Session.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test'
import {
  createSession,
  applyIncrementalStats,
  type IncrementalStats,
} from './Session'

describe('applyIncrementalStats', () => {
  it('把 incremental stats 寫入 session', () => {
    const session = createSession({ listenPort: 13306, targetHost: 'localhost', targetPort: 3306 })
    const stats: IncrementalStats = {
      totalQueries: 5,
      byOperation: { SELECT: 3, INSERT: 2 },
      tablesAccessed: new Set(['users', 'orders']),
    }

    const updated = applyIncrementalStats(session, stats, 2)

    expect(updated.stats.totalQueries).toBe(5)
    expect(updated.stats.byOperation).toEqual({ SELECT: 3, INSERT: 2 })
    expect(updated.stats.tablesAccessed).toEqual(['orders', 'users']) // 排序後
    expect(updated.stats.connectionCount).toBe(2)
  })

  it('不修改原 session（immutable）', () => {
    const session = createSession({ listenPort: 13306, targetHost: 'localhost', targetPort: 3306 })
    const stats: IncrementalStats = {
      totalQueries: 1,
      byOperation: { SELECT: 1 },
      tablesAccessed: new Set(['users']),
    }
    applyIncrementalStats(session, stats, 1)
    expect(session.stats.totalQueries).toBe(0)
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

```bash
bun test src/Modules/Recording/Domain/Session.test.ts
```

期望：FAIL（`applyIncrementalStats` 不存在）

- [ ] **Step 3：在 Session.ts 新增型別與函式**

在 `src/Modules/Recording/Domain/Session.ts` 尾端加入：

```typescript
export interface IncrementalStats {
  totalQueries: number
  byOperation: Record<string, number>
  tablesAccessed: Set<string>
}

export function applyIncrementalStats(
  session: RecordingSession,
  stats: IncrementalStats,
  connectionCount: number,
): RecordingSession {
  return {
    ...session,
    stats: {
      totalQueries: stats.totalQueries,
      byOperation: { ...stats.byOperation },
      tablesAccessed: [...stats.tablesAccessed].sort(),
      connectionCount,
    },
  }
}
```

- [ ] **Step 4：跑測試確認通過**

```bash
bun test src/Modules/Recording/Domain/Session.test.ts
```

期望：PASS（2 tests）

- [ ] **Step 5：Commit**

```bash
git add src/Modules/Recording/Domain/Session.ts src/Modules/Recording/Domain/Session.test.ts
git commit -m "feat: [recording] 新增 applyIncrementalStats 函式（支援 WriteStream 重構）"
```

---

## Task 2：RecordingRepository — WriteStream 架構

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts`

- [ ] **Step 1：寫失敗測試**

建立 `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.test.ts`：

```typescript
import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RecordingRepository } from './RecordingRepository'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeQuery(id: string, sql: string): CapturedQuery {
  return {
    id,
    sessionId: 'sess_1',
    connectionId: 1,
    timestamp: Date.now(),
    duration: 5,
    sql,
    operation: 'SELECT',
    tables: ['users'],
  }
}

describe('RecordingRepository (WriteStream)', () => {
  let tmpDir: string

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('openStreams → appendQueries × 3 → closeStreams → JSONL 有 3 行', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_1')
    repo.appendQueries('sess_1', [makeQuery('q1', 'SELECT 1')])
    repo.appendQueries('sess_1', [makeQuery('q2', 'SELECT 2')])
    repo.appendQueries('sess_1', [makeQuery('q3', 'SELECT 3')])
    await repo.closeStreams('sess_1')

    const content = await readFile(
      path.join(tmpDir, 'sess_1', 'queries.jsonl'),
      'utf-8',
    )
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).id).toBe('q1')
    expect(JSON.parse(lines[2]).id).toBe('q3')
  })

  it('closeStreams 後再 appendQueries 靜默忽略（不 throw）', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_2')
    await repo.closeStreams('sess_2')

    // 不應 throw
    expect(() => repo.appendQueries('sess_2', [makeQuery('q1', 'SELECT 1')])).not.toThrow()
  })

  it('appendQueries 批次寫入，每筆皆保留', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    const batch = Array.from({ length: 100 }, (_, i) => makeQuery(`q${i}`, `SELECT ${i}`))
    repo.openStreams('sess_3')
    repo.appendQueries('sess_3', batch)
    await repo.closeStreams('sess_3')

    const content = await readFile(
      path.join(tmpDir, 'sess_3', 'queries.jsonl'),
      'utf-8',
    )
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(100)
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

```bash
bun test src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.test.ts
```

期望：FAIL（`openStreams` / `closeStreams` 不存在，`appendQueries` 為舊的 async 版本）

- [ ] **Step 3：重寫 RecordingRepository**

將 `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` 改為：

```typescript
import { existsSync, mkdirSync, readdirSync, createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

interface SessionStreams {
  queries: WriteStream
  markers: WriteStream
  httpChunks: WriteStream
}

export class RecordingRepository {
  private streams = new Map<string, SessionStreams>()

  constructor(private readonly baseDir: string) {
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }
  }

  private sessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId)
  }

  private sessionFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'session.json')
  }

  private queriesFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'queries.jsonl')
  }

  private markersFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'markers.jsonl')
  }

  private httpChunksFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'http_chunks.jsonl')
  }

  private makeStream(filePath: string, sessionId: string, label: string): WriteStream {
    const s = createWriteStream(filePath, { flags: 'a' })
    s.on('error', (err) =>
      console.error(`[Recording] stream error [${sessionId}/${label}]:`, err),
    )
    return s
  }

  openStreams(sessionId: string): void {
    const dir = this.sessionDir(sessionId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.streams.set(sessionId, {
      queries:    this.makeStream(this.queriesFile(sessionId),    sessionId, 'queries.jsonl'),
      markers:    this.makeStream(this.markersFile(sessionId),    sessionId, 'markers.jsonl'),
      httpChunks: this.makeStream(this.httpChunksFile(sessionId), sessionId, 'http_chunks.jsonl'),
    })
  }

  async closeStreams(sessionId: string): Promise<void> {
    const s = this.streams.get(sessionId)
    if (!s) return
    await Promise.all([
      new Promise<void>((res) => s.queries.end(res)),
      new Promise<void>((res) => s.markers.end(res)),
      new Promise<void>((res) => s.httpChunks.end(res)),
    ])
    this.streams.delete(sessionId)
  }

  appendQueries(sessionId: string, queries: readonly CapturedQuery[]): void {
    if (queries.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.queries.destroyed || s.queries.closed) return
    s.queries.write(queries.map((q) => JSON.stringify(q)).join('\n') + '\n')
  }

  appendMarkers(sessionId: string, markers: readonly OperationMarker[]): void {
    if (markers.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.markers.destroyed || s.markers.closed) return
    s.markers.write(markers.map((m) => JSON.stringify(m)).join('\n') + '\n')
  }

  appendHttpChunks(sessionId: string, chunks: readonly HttpChunk[]): void {
    if (chunks.length === 0) return
    const s = this.streams.get(sessionId)
    if (!s || s.httpChunks.destroyed || s.httpChunks.closed) return
    s.httpChunks.write(chunks.map((c) => JSON.stringify(c)).join('\n') + '\n')
  }

  async saveSession(session: RecordingSession): Promise<void> {
    const dir = this.sessionDir(session.id)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    await writeFile(this.sessionFile(session.id), JSON.stringify(session, null, 2), 'utf-8')
  }

  async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const filePath = this.sessionFile(sessionId)
    if (!existsSync(filePath)) return null
    const text = await readFile(filePath, 'utf-8')
    return JSON.parse(text) as RecordingSession
  }

  async loadQueries(sessionId: string): Promise<CapturedQuery[]> {
    const filePath = this.queriesFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as CapturedQuery)
  }

  async loadMarkers(sessionId: string): Promise<OperationMarker[]> {
    const filePath = this.markersFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as OperationMarker)
  }

  async loadHttpChunks(sessionId: string): Promise<HttpChunk[]> {
    const filePath = this.httpChunksFile(sessionId)
    if (!existsSync(filePath)) return []
    const text = await readFile(filePath, 'utf-8')
    if (!text.trim()) return []
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as HttpChunk)
  }

  async listSessions(): Promise<RecordingSession[]> {
    if (!existsSync(this.baseDir)) return []
    const entries = readdirSync(this.baseDir, { withFileTypes: true })
    const sessions: RecordingSession[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const session = await this.loadSession(entry.name)
        if (session) sessions.push(session)
      }
    }
    return sessions
  }
}
```

- [ ] **Step 4：跑測試確認通過**

```bash
bun test src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.test.ts
```

期望：PASS（3 tests）

- [ ] **Step 5：確認 typecheck 乾淨**

```bash
bun run check
```

期望：無 type error（appendQueries 等簽名從 `async` 改為 sync，呼叫端不 await 不影響）

- [ ] **Step 6：Commit**

```bash
git add src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts \
        src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.test.ts
git commit -m "feat: [recording] RecordingRepository 改用 WriteStream 消除 O(n) 讀取"
```

---

## Task 3：RecordingService — 移除 buffer/flushTimer，改用 incremental stats

**Files:**
- Modify: `src/Modules/Recording/Application/Services/RecordingService.ts`

- [ ] **Step 1：寫失敗測試**

建立 `src/Modules/Recording/Application/Services/RecordingService.test.ts`：

```typescript
// mock.module 必須在其他 import 之前
import { mock } from 'bun:test'

// Mock TcpProxy，避免 unit test 真的 bind TCP port
mock.module('@/Modules/Recording/Infrastructure/Proxy/TcpProxy', () => ({
  TcpProxy: class MockTcpProxy {
    connectionCount = 0
    async start() { return 13306 }
    async stop() {}
  },
}))

import { describe, it, expect } from 'bun:test'
import { RecordingService } from './RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeRepo(): RecordingRepository {
  return {
    openStreams: mock(() => {}),
    closeStreams: mock(async () => {}),
    appendQueries: mock(() => {}),
    appendMarkers: mock(() => {}),
    appendHttpChunks: mock(() => {}),
    saveSession: mock(async () => {}),
    loadSession: mock(async () => null),
    loadQueries: mock(async () => []),
    loadMarkers: mock(async () => []),
    loadHttpChunks: mock(async () => []),
    listSessions: mock(async () => []),
  } as unknown as RecordingRepository
}

function makeParser(): IProtocolParser {
  return {
    extractQuery: mock(() => null),
    parseResponse: mock(() => ({ type: 'ok' as const, affectedRows: 0 })),
  } as unknown as IProtocolParser
}

describe('RecordingService', () => {
  it('start() 呼叫 openStreams 和 saveSession', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())

    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    expect(repo.openStreams).toHaveBeenCalledTimes(1)
    expect(repo.saveSession).toHaveBeenCalledTimes(1)
  })

  it('handleQuery 呼叫 appendQueries 並累積 incremental stats', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())
    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    const q1 = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'SELECT 1',
      operation: 'SELECT', tables: ['users'], duration: 1,
    })
    const q2 = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'INSERT INTO orders VALUES (1)',
      operation: 'INSERT', tables: ['orders'], duration: 2,
    })

    // @ts-expect-error accessing private for test
    svc.handleQuery(q1)
    // @ts-expect-error accessing private for test
    svc.handleQuery(q2)

    expect(repo.appendQueries).toHaveBeenCalledTimes(2)
    // @ts-expect-error accessing private for test
    expect(svc.stats.totalQueries).toBe(2)
    // @ts-expect-error accessing private for test
    expect(svc.stats.byOperation).toEqual({ SELECT: 1, INSERT: 1 })
    // @ts-expect-error accessing private for test
    expect([...svc.stats.tablesAccessed]).toContain('users')
  })

  it('stop() 呼叫 closeStreams 並回傳含正確 stats 的 stopped session', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())
    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    const q = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'SELECT 1',
      operation: 'SELECT', tables: ['users'], duration: 1,
    })
    // @ts-expect-error accessing private for test
    svc.handleQuery(q)

    const stopped = await svc.stop()

    expect(repo.closeStreams).toHaveBeenCalledTimes(1)
    expect(stopped.status).toBe('stopped')
    expect(stopped.stats.totalQueries).toBe(1)
    expect(stopped.stats.tablesAccessed).toContain('users')
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

```bash
bun test src/Modules/Recording/Application/Services/RecordingService.test.ts
```

期望：FAIL（`openStreams` 未被呼叫、`stats` 不存在等）

- [ ] **Step 3：重寫 RecordingService**

將 `src/Modules/Recording/Application/Services/RecordingService.ts` 改為：

```typescript
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import {
  createMarker,
  type OperationMarker,
  type MarkerAction,
  type MarkerRequestDetail,
} from '@/Modules/Recording/Domain/OperationMarker'
import {
  createSession,
  stopSession,
  applyIncrementalStats,
  type IncrementalStats,
  type RecordingSession,
  type CapturedQuery,
  type ProxyConfig,
} from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'

export class RecordingService {
  private currentSession: RecordingSession | null = null
  private proxy: TcpProxy | null = null
  private _proxyPort: number | null = null
  private stats: IncrementalStats = {
    totalQueries: 0,
    byOperation: {},
    tablesAccessed: new Set(),
  }

  constructor(
    private readonly repo: RecordingRepository,
    private readonly parser: IProtocolParser,
  ) {}

  get isRecording(): boolean {
    return this.currentSession !== null && this.currentSession.status === 'recording'
  }

  get proxyPort(): number | null {
    return this._proxyPort
  }

  async start(config: ProxyConfig): Promise<RecordingSession> {
    if (this.isRecording) {
      throw new Error('already recording: stop current session first.')
    }

    const session = createSession(config)
    this.currentSession = session
    this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }

    this.proxy = new TcpProxy({
      listenPort: config.listenPort,
      targetHost: config.targetHost,
      targetPort: config.targetPort,
      parser: this.parser,
      onQuery: (query) => this.handleQuery(query),
    })

    this.repo.openStreams(session.id)
    this._proxyPort = await this.proxy.start()
    await this.repo.saveSession(session)

    return session
  }

  async stop(): Promise<RecordingSession> {
    if (!this.currentSession) {
      throw new Error('No active recording session.')
    }

    const connectionCount = this.proxy?.connectionCount ?? 0

    await this.proxy?.stop()
    this.proxy = null
    this._proxyPort = null

    await this.repo.closeStreams(this.currentSession.id)

    const stopped = stopSession(
      applyIncrementalStats(this.currentSession, this.stats, connectionCount),
    )
    await this.repo.saveSession(stopped)

    this.currentSession = null
    this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }

    return stopped
  }

  status(): RecordingSession | null {
    return this.currentSession
  }

  addMarker(params: {
    url: string
    action: MarkerAction
    target?: string
    label?: string
    request?: MarkerRequestDetail
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

  private handleQuery(query: CapturedQuery): void {
    if (!this.currentSession) return
    this.repo.appendQueries(this.currentSession.id, [query])
    this.stats.totalQueries++
    this.stats.byOperation[query.operation] = (this.stats.byOperation[query.operation] ?? 0) + 1
    for (const t of query.tables) {
      this.stats.tablesAccessed.add(t)
    }
  }
}
```

- [ ] **Step 4：跑測試確認通過**

```bash
bun test src/Modules/Recording/Application/Services/RecordingService.test.ts
```

期望：PASS（3 tests）

- [ ] **Step 5：確認全套測試與 typecheck**

```bash
bun run check
```

期望：無 error（`updateSessionStats` 不再被 RecordingService 使用，但仍存在 Session.ts，不影響）

- [ ] **Step 6：Commit**

```bash
git add src/Modules/Recording/Application/Services/RecordingService.ts \
        src/Modules/Recording/Application/Services/RecordingService.test.ts
git commit -m "feat: [recording] RecordingService 移除 buffer/flushTimer，改用 incremental stats"
```

---

## Task 4：HttpProxy — fire-and-forget

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts`

- [ ] **Step 1：修改 `HttpProxy.ts`**

在 `src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts` 找到這段（約 107–112 行）：

```typescript
        await onChunk([requestChunk, responseChunk])

        return new Response(resBuffer, {
          status: targetResponse.status,
          headers: targetResponse.headers,
        })
```

改為：

```typescript
        void onChunk([requestChunk, responseChunk])

        return new Response(resBuffer, {
          status: targetResponse.status,
          headers: targetResponse.headers,
        })
```

（只改 `await` → `void`，其他不動）

- [ ] **Step 2：確認 typecheck**

```bash
bun run check
```

期望：無 error

- [ ] **Step 3：Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/HttpProxy.ts
git commit -m "perf: [recording] HttpProxy onChunk 改為 fire-and-forget，消除回應阻塞"
```

---

## Task 5：全套驗證

- [ ] **Step 1：跑所有測試**

```bash
bun run check
```

期望：typecheck + lint + test 全部 PASS，無 error

- [ ] **Step 2：手動煙霧測試（可選，需本地 MySQL）**

```bash
# 啟動 proxy
bun run dev:all

# 另一個 terminal，啟動側錄
archivolt record start --target localhost:3306 --port 13306

# 執行幾條 SQL（透過任何 MySQL client 連 127.0.0.1:13306）
# mysql -h 127.0.0.1 -P 13306 -u root -e "SELECT 1; SELECT * FROM information_schema.tables LIMIT 5;"

# 停止側錄
archivolt record stop

# 確認 JSONL 有寫入
archivolt record summary <session-id>
```

期望：summary 顯示正確的 query 數量與 table 清單

- [ ] **Step 3：最終 Commit（若有未提交變更）**

```bash
git status
# 確認乾淨或補 commit
```
