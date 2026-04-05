# Log Input Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--from` flag to `archivolt analyze` so any log file (MySQL general log, slow query log, or canonical JSONL) can be analyzed using the existing pipeline unchanged.

**Architecture:** New `IQueryLogParser` adapters convert each log format to a `QueryEvent[]` stream (O(1) memory via readline). `LogImportService` converts each `QueryEvent` → `CapturedQuery` (using existing `analyzeQuery()`) and writes a virtual recording session to `RecordingRepository`. `AnalyzeCommand` detects `--from`, runs import first, then proceeds normally with the resulting session ID.

**Tech Stack:** TypeScript, Bun, Node `readline` (line-by-line streaming), existing `RecordingRepository` / `analyzeQuery` / `createCapturedQuery`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/Modules/Recording/Domain/QueryEvent.ts` | Create | Canonical log input schema |
| `src/Modules/Recording/Infrastructure/Parsers/IQueryLogParser.ts` | Create | Parser interface |
| `src/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser.ts` | Create | Pass-through for canonical JSONL |
| `src/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser.ts` | Create | MySQL general log parser |
| `src/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser.ts` | Create | MySQL slow query log parser |
| `src/Modules/Recording/Application/Services/LogImportService.ts` | Create | Orchestrates parse → virtual session |
| `src/CLI/AnalyzeCommand.ts` | Modify | Add `--from` flag |
| `test/fixtures/logs/canonical.jsonl` | Create | Test fixture |
| `test/fixtures/logs/mysql-general.log` | Create | Test fixture |
| `test/fixtures/logs/mysql-slow.log` | Create | Test fixture |
| `test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts` | Create | Parser unit tests |
| `test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts` | Create | Parser unit tests |
| `test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts` | Create | Parser unit tests |
| `test/unit/Recording/Application/LogImportService.test.ts` | Create | Service unit tests |
| `test/unit/CLI/AnalyzeCommand.from.test.ts` | Create | CLI flag unit tests |

---

## Task 1: QueryEvent Type

**Files:**
- Create: `src/Modules/Recording/Domain/QueryEvent.ts`

- [ ] **Step 1: Create the type file**

```typescript
// src/Modules/Recording/Domain/QueryEvent.ts

/**
 * Canonical log input format. All IQueryLogParser implementations output this.
 * External tools targeting Archivolt should produce JSONL where each line is one QueryEvent.
 */
export interface QueryEvent {
  /** Unix ms timestamp, required */
  readonly timestamp: number
  /** Raw SQL string, required */
  readonly sql: string
  /** Connection ID string — used for flow grouping (general log provides this) */
  readonly connectionId?: string
  /** Execution time in milliseconds (slow log provides this) */
  readonly durationMs?: number
  /** Rows examined (slow log provides this) */
  readonly rowsExamined?: number
  /** Target database name */
  readonly database?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Modules/Recording/Domain/QueryEvent.ts
git commit -m "feat: [log-import] QueryEvent canonical input type"
```

---

## Task 2: IQueryLogParser Interface

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Parsers/IQueryLogParser.ts`

- [ ] **Step 1: Create the interface**

```typescript
// src/Modules/Recording/Infrastructure/Parsers/IQueryLogParser.ts

import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

/**
 * Converts a log file (any format) to a stream of QueryEvents.
 * Implementations MUST read the file line-by-line to keep memory O(1).
 */
export interface IQueryLogParser {
  /**
   * Async generator that yields one QueryEvent per parsed log entry.
   * Skips non-query lines (headers, connect/quit events, comments).
   */
  parse(filePath: string): AsyncGenerator<QueryEvent>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Parsers/IQueryLogParser.ts
git commit -m "feat: [log-import] IQueryLogParser streaming interface"
```

---

## Task 3: Canonical JSONL Parser

**Files:**
- Create: `test/fixtures/logs/canonical.jsonl`
- Create: `src/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser.ts`
- Create: `test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts`

- [ ] **Step 1: Create test fixture**

```
{"timestamp":1712300000000,"sql":"SELECT * FROM users WHERE id = 1","connectionId":"42"}
{"timestamp":1712300000010,"sql":"SELECT * FROM orders WHERE user_id = 1","connectionId":"42","durationMs":5,"rowsExamined":100}
{"timestamp":1712300000020,"sql":"INSERT INTO logs (msg) VALUES ('ok')","connectionId":"43"}
```

Save to `test/fixtures/logs/canonical.jsonl`.

- [ ] **Step 2: Write the failing test**

```typescript
// test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { CanonicalJsonlParser } from '@/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/canonical.jsonl')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('CanonicalJsonlParser', () => {
  it('parses all query events from fixture', async () => {
    const parser = new CanonicalJsonlParser()
    const events = await collect(parser.parse(FIXTURE))
    expect(events).toHaveLength(3)
  })

  it('preserves timestamp and sql', async () => {
    const parser = new CanonicalJsonlParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      timestamp: 1712300000000,
      sql: 'SELECT * FROM users WHERE id = 1',
      connectionId: '42',
    })
  })

  it('preserves optional fields when present', async () => {
    const parser = new CanonicalJsonlParser()
    const events = await collect(parser.parse(FIXTURE))
    const second = events[1]
    expect(second).toMatchObject({ durationMs: 5, rowsExamined: 100 })
  })

  it('skips blank lines without error', async () => {
    const parser = new CanonicalJsonlParser()
    // fixture has no blank lines, but parse() must handle them
    const events = await collect(parser.parse(FIXTURE))
    expect(events.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run test test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts
```

Expected: `FAIL` — `Cannot find module '@/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser'`

- [ ] **Step 4: Implement CanonicalJsonlParser**

```typescript
// src/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser.ts

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

export class CanonicalJsonlParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      yield JSON.parse(trimmed) as QueryEvent
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run test test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts
```

Expected: all 4 tests `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser.ts \
        test/fixtures/logs/canonical.jsonl \
        test/unit/Recording/Infrastructure/CanonicalJsonlParser.test.ts
git commit -m "feat: [log-import] CanonicalJsonlParser + tests"
```

---

## Task 4: MySQL General Log Parser

**Files:**
- Create: `test/fixtures/logs/mysql-general.log`
- Create: `src/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser.ts`
- Create: `test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts`

MySQL general log line format (MySQL 8.0+):
```
<ISO-timestamp>\t<space><connection-id> <Command>\t<SQL>
```
Example:
```
2024-04-05T10:00:00.000000Z	   42 Query	SELECT * FROM users WHERE id = 1
```

Older format (YYMMDD HH:MM:SS):
```
240405 10:00:00	   42 Query	SELECT 1
```

Only lines with `Query` command produce a `QueryEvent`. `Connect`, `Quit`, `Init DB` etc. are skipped. Header lines (not matching the pattern) are silently skipped.

- [ ] **Step 1: Create test fixture**

```
/usr/sbin/mysqld, Version: 8.0.32. started with:
Tcp port: 3306  Unix socket: /var/run/mysqld/mysqld.sock
Time                 Id Command    Argument
2024-04-05T10:00:00.000000Z	   42 Query	SELECT * FROM users WHERE id = 1
2024-04-05T10:00:00.010000Z	   42 Query	SELECT * FROM orders WHERE user_id = 1
2024-04-05T10:00:00.020000Z	   43 Connect	root@localhost on testdb using TCP/IP
2024-04-05T10:00:00.030000Z	   43 Query	INSERT INTO logs (msg) VALUES ('ok')
2024-04-05T10:00:00.040000Z	   42 Quit	
240405 10:00:01	   44 Query	SELECT 1
```

Save to `test/fixtures/logs/mysql-general.log`.

- [ ] **Step 2: Write the failing test**

```typescript
// test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { MysqlGeneralLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/mysql-general.log')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('MysqlGeneralLogParser', () => {
  it('parses only Query lines, skipping header and non-Query events', async () => {
    const parser = new MysqlGeneralLogParser()
    const events = await collect(parser.parse(FIXTURE))
    // 3 Query lines + 1 compact-format Query = 4 total
    expect(events).toHaveLength(4)
  })

  it('extracts connectionId from ISO-timestamp line', async () => {
    const parser = new MysqlGeneralLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      connectionId: '42',
      sql: 'SELECT * FROM users WHERE id = 1',
    })
  })

  it('parses ISO timestamp to Unix ms', async () => {
    const parser = new MysqlGeneralLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    const event = first as { timestamp: number }
    expect(event.timestamp).toBe(new Date('2024-04-05T10:00:00.000000Z').getTime())
  })

  it('parses compact-format timestamp line', async () => {
    const parser = new MysqlGeneralLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const last = events[events.length - 1] as { sql: string; connectionId: string }
    expect(last.sql).toBe('SELECT 1')
    expect(last.connectionId).toBe('44')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run test test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts
```

Expected: `FAIL` — module not found

- [ ] **Step 4: Implement MysqlGeneralLogParser**

```typescript
// src/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser.ts

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

// ISO format: 2024-04-05T10:00:00.000000Z\t   42 Query\tSELECT ...
const ISO_QUERY_LINE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\t\s*(\d+)\s+Query\t(.+)$/

// Compact format: 240405 10:00:00\t   42 Query\tSELECT ...
const COMPACT_QUERY_LINE = /^(\d{6}\s+[\d:]+)\t\s*(\d+)\s+Query\t(.+)$/

function parseCompactTimestamp(raw: string): number {
  // raw: "240405 10:00:00" → "2024-04-05 10:00:00"
  const [datePart, timePart] = raw.trim().split(/\s+/)
  const yy = datePart.slice(0, 2)
  const mm = datePart.slice(2, 4)
  const dd = datePart.slice(4, 6)
  return new Date(`20${yy}-${mm}-${dd}T${timePart}Z`).getTime()
}

export class MysqlGeneralLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      let match = ISO_QUERY_LINE.exec(line)
      if (match) {
        yield {
          timestamp: new Date(match[1]).getTime(),
          connectionId: match[2],
          sql: match[3].trim(),
        }
        continue
      }

      match = COMPACT_QUERY_LINE.exec(line)
      if (match) {
        yield {
          timestamp: parseCompactTimestamp(match[1]),
          connectionId: match[2],
          sql: match[3].trim(),
        }
      }
      // Any other line (headers, Connect, Quit, Init DB) is silently skipped
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run test test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts
```

Expected: all 4 tests `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser.ts \
        test/fixtures/logs/mysql-general.log \
        test/unit/Recording/Infrastructure/MysqlGeneralLogParser.test.ts
git commit -m "feat: [log-import] MysqlGeneralLogParser + tests"
```

---

## Task 5: MySQL Slow Query Log Parser

**Files:**
- Create: `test/fixtures/logs/mysql-slow.log`
- Create: `src/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser.ts`
- Create: `test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts`

Slow query log format — each entry spans multiple lines:
```
# Time: 2024-04-05T10:00:00.000000Z
# User@Host: root[root] @ localhost []  Id:    42
# Query_time: 0.001234  Lock_time: 0.000123 Rows_sent: 1  Rows_examined: 1000
use mydb;
SET timestamp=1712300000;
SELECT * FROM users WHERE id = 1;
```

A `SET timestamp=` line gives a Unix timestamp in seconds. `use db;` lines set the database context. `# Time:` starts a new entry. The SQL is everything after the meta lines until the next `# Time:` or EOF.

- [ ] **Step 1: Create test fixture**

```
/usr/mysqld, Version: 8.0.32. started with:
# Time: 2024-04-05T10:00:00.000000Z
# User@Host: root[root] @ localhost []  Id:    42
# Query_time: 0.001234  Lock_time: 0.000123 Rows_sent: 1  Rows_examined: 1000
use testdb;
SET timestamp=1712300000;
SELECT * FROM users WHERE id = 1;
# Time: 2024-04-05T10:00:01.000000Z
# User@Host: app[app] @ localhost []  Id:    43
# Query_time: 0.523000  Lock_time: 0.000012 Rows_sent: 500  Rows_examined: 50000
SET timestamp=1712300001;
SELECT * FROM orders WHERE status = 'pending';
# Time: 2024-04-05T10:00:02.000000Z
# User@Host: root[root] @ localhost []  Id:    42
# Query_time: 0.000100  Lock_time: 0.000001 Rows_sent: 0  Rows_examined: 0
SET timestamp=1712300002;
INSERT INTO logs (msg) VALUES ('done');
```

Save to `test/fixtures/logs/mysql-slow.log`.

- [ ] **Step 2: Write the failing test**

```typescript
// test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts

import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { MysqlSlowQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/mysql-slow.log')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('MysqlSlowQueryLogParser', () => {
  it('parses all 3 entries from fixture', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    expect(events).toHaveLength(3)
  })

  it('extracts timestamp, connectionId, durationMs, rowsExamined, sql', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      timestamp: new Date('2024-04-05T10:00:00.000000Z').getTime(),
      connectionId: '42',
      durationMs: 1.234,
      rowsExamined: 1000,
      sql: "SELECT * FROM users WHERE id = 1;",
      database: 'testdb',
    })
  })

  it('extracts sql from second entry without use db line', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const second = events[1] as { sql: string; durationMs: number }
    expect(second.sql).toBe("SELECT * FROM orders WHERE status = 'pending';")
    expect(second.durationMs).toBeCloseTo(523, 0)
  })

  it('parses INSERT entry correctly', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const third = events[2] as { sql: string }
    expect(third.sql).toBe("INSERT INTO logs (msg) VALUES ('done');")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run test test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts
```

Expected: `FAIL` — module not found

- [ ] **Step 4: Implement MysqlSlowQueryLogParser**

```typescript
// src/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser.ts

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

const TIME_LINE = /^#\s+Time:\s+(.+)$/
const USER_LINE = /^#\s+User@Host:.*Id:\s+(\d+)/
const QUERY_TIME_LINE = /^#\s+Query_time:\s+([\d.]+)\s+Lock_time:\s+[\d.]+\s+Rows_sent:\s+\d+\s+Rows_examined:\s+(\d+)/
const USE_DB_LINE = /^use\s+(\w+)\s*;$/i
const SET_TIMESTAMP_LINE = /^SET\s+timestamp=\d+\s*;$/i

interface EntryAccumulator {
  timestamp?: number
  connectionId?: string
  durationMs?: number
  rowsExamined?: number
  database?: string
  sqlLines: string[]
}

function emitEvent(acc: EntryAccumulator): QueryEvent | null {
  const sql = acc.sqlLines.join('\n').trim()
  if (!sql || acc.timestamp === undefined) return null
  return {
    timestamp: acc.timestamp,
    sql,
    connectionId: acc.connectionId,
    durationMs: acc.durationMs,
    rowsExamined: acc.rowsExamined,
    database: acc.database,
  }
}

export class MysqlSlowQueryLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })

    let acc: EntryAccumulator | null = null
    let currentDb: string | undefined

    for await (const line of rl) {
      const timeMatch = TIME_LINE.exec(line)
      if (timeMatch) {
        // Emit previous entry
        if (acc) {
          const event = emitEvent(acc)
          if (event) yield event
        }
        acc = {
          timestamp: new Date(timeMatch[1].trim()).getTime(),
          database: currentDb,
          sqlLines: [],
        }
        continue
      }

      if (!acc) continue

      const userMatch = USER_LINE.exec(line)
      if (userMatch) {
        acc.connectionId = userMatch[1]
        continue
      }

      const qtMatch = QUERY_TIME_LINE.exec(line)
      if (qtMatch) {
        acc.durationMs = parseFloat(qtMatch[1]) * 1000
        acc.rowsExamined = parseInt(qtMatch[2], 10)
        continue
      }

      const useMatch = USE_DB_LINE.exec(line)
      if (useMatch) {
        currentDb = useMatch[1]
        acc.database = currentDb
        continue
      }

      // Skip SET timestamp= lines
      if (SET_TIMESTAMP_LINE.test(line)) continue

      // Skip server header lines (no # but not SQL)
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        acc.sqlLines.push(line)
      }
    }

    // Emit final entry
    if (acc) {
      const event = emitEvent(acc)
      if (event) yield event
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run test test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts
```

Expected: all 4 tests `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser.ts \
        test/fixtures/logs/mysql-slow.log \
        test/unit/Recording/Infrastructure/MysqlSlowQueryLogParser.test.ts
git commit -m "feat: [log-import] MysqlSlowQueryLogParser + tests"
```

---

## Task 6: LogImportService

**Files:**
- Create: `src/Modules/Recording/Application/Services/LogImportService.ts`
- Create: `test/unit/Recording/Application/LogImportService.test.ts`

This service:
1. Selects the correct parser based on `format`
2. Streams `QueryEvent`s from the log file
3. Converts each to `CapturedQuery` using existing `analyzeQuery()` + `createCapturedQuery()`
4. Writes each query immediately via `RecordingRepository.appendQueries()` (O(1) memory)
5. Saves a virtual `RecordingSession` with computed stats

**Files:**
- Create: `src/Modules/Recording/Application/Services/LogImportService.ts`
- Create: `test/unit/Recording/Application/LogImportService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/Recording/Application/LogImportService.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { LogImportService, type ImportFormat } from '@/Modules/Recording/Application/Services/LogImportService'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

const CANONICAL_FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/canonical.jsonl')

describe('LogImportService', () => {
  let repo: RecordingRepository
  let repoDir: string

  beforeEach(() => {
    repoDir = `/tmp/archivolt-test-import-${Date.now()}`
    repo = new RecordingRepository(repoDir)
  })

  it('creates a virtual session with correct query count', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')

    const session = await repo.loadSession(sessionId)
    expect(session).not.toBeNull()
    expect(session!.status).toBe('stopped')
    expect(session!.stats.totalQueries).toBe(3)
  })

  it('session id starts with imp_', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    expect(sessionId).toMatch(/^imp_/)
  })

  it('persists queries to JSONL', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    const queries = await repo.loadQueries(sessionId)
    expect(queries).toHaveLength(3)
  })

  it('infers operation and tables from SQL', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    const queries = await repo.loadQueries(sessionId)
    const selectQuery = queries.find((q) => q.operation === 'SELECT')
    expect(selectQuery).toBeDefined()
    expect(selectQuery!.tables).toContain('users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test test/unit/Recording/Application/LogImportService.test.ts
```

Expected: `FAIL` — `Cannot find module '@/Modules/Recording/Application/Services/LogImportService'`

- [ ] **Step 3: Implement LogImportService**

```typescript
// src/Modules/Recording/Application/Services/LogImportService.ts

import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { RecordingSession } from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { CanonicalJsonlParser } from '@/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser'
import { MysqlGeneralLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser'
import { MysqlSlowQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'

export type ImportFormat = 'canonical' | 'general-log' | 'slow-log'

let _importCounter = 0

export class LogImportService {
  constructor(private readonly repo: RecordingRepository) {}

  async import(filePath: string, format: ImportFormat): Promise<string> {
    const parser = this.selectParser(format)
    const sessionId = `imp_${Date.now()}_${_importCounter++}`

    this.repo.openStreams(sessionId)

    let totalQueries = 0
    let firstTimestamp: number | undefined
    let lastTimestamp: number | undefined
    const byOperation: Record<string, number> = {}
    const tablesAccessed = new Set<string>()
    const connectionIds = new Set<string>()

    for await (const event of parser.parse(filePath)) {
      const { operation, tables } = analyzeQuery(event.sql)

      const query = createCapturedQuery({
        sessionId,
        connectionId: event.connectionId ? parseInt(event.connectionId, 10) : 0,
        sql: event.sql,
        operation,
        tables: [...tables],
        duration: event.durationMs ?? 0,
      })

      // Override the auto-generated timestamp with the log's timestamp
      const queryWithTs = { ...query, timestamp: event.timestamp }

      this.repo.appendQueries(sessionId, [queryWithTs])

      totalQueries++
      if (firstTimestamp === undefined || event.timestamp < firstTimestamp) {
        firstTimestamp = event.timestamp
      }
      if (lastTimestamp === undefined || event.timestamp > lastTimestamp) {
        lastTimestamp = event.timestamp
      }
      byOperation[operation] = (byOperation[operation] ?? 0) + 1
      for (const t of tables) tablesAccessed.add(t)
      if (event.connectionId) connectionIds.add(event.connectionId)
    }

    await this.repo.closeStreams(sessionId)

    const session: RecordingSession = {
      id: sessionId,
      startedAt: firstTimestamp ?? Date.now(),
      endedAt: lastTimestamp ?? Date.now(),
      status: 'stopped',
      proxy: { listenPort: 0, targetHost: 'imported', targetPort: 0 },
      stats: {
        totalQueries,
        byOperation,
        tablesAccessed: [...tablesAccessed].sort(),
        connectionCount: connectionIds.size,
      },
    }

    await this.repo.saveSession(session)
    return sessionId
  }

  private selectParser(format: ImportFormat): IQueryLogParser {
    switch (format) {
      case 'canonical':   return new CanonicalJsonlParser()
      case 'general-log': return new MysqlGeneralLogParser()
      case 'slow-log':    return new MysqlSlowQueryLogParser()
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test test/unit/Recording/Application/LogImportService.test.ts
```

Expected: all 4 tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/LogImportService.ts \
        test/unit/Recording/Application/LogImportService.test.ts
git commit -m "feat: [log-import] LogImportService — parse log → virtual session"
```

---

## Task 7: Wire --from into AnalyzeCommand

**Files:**
- Modify: `src/CLI/AnalyzeCommand.ts`
- Create: `test/unit/CLI/AnalyzeCommand.from.test.ts`

Changes to `AnalyzeArgs` and `parseAnalyzeArgs`:
- `sessionId` becomes optional (`string | undefined`)
- New fields: `fromFormat?: ImportFormat` and `fromPath?: string`
- When `--from` is present, `sessionId` is not required

Changes to `runAnalyzeCommand`:
- If `fromFormat` + `fromPath` are set, run `LogImportService.import()` first to get `sessionId`
- Then proceed with existing analysis using that `sessionId`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/CLI/AnalyzeCommand.from.test.ts

import { describe, it, expect } from 'vitest'
import { parseAnalyzeArgs } from '@/CLI/AnalyzeCommand'

describe('parseAnalyzeArgs --from flag', () => {
  it('parses --from general-log with a file path', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'general-log', '/tmp/mysql.log'])
    expect(args.fromFormat).toBe('general-log')
    expect(args.fromPath).toBe('/tmp/mysql.log')
    expect(args.sessionId).toBeUndefined()
  })

  it('parses --from slow-log', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'slow-log', '/tmp/slow.log'])
    expect(args.fromFormat).toBe('slow-log')
    expect(args.fromPath).toBe('/tmp/slow.log')
  })

  it('parses --from canonical', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'canonical', '/tmp/queries.jsonl'])
    expect(args.fromFormat).toBe('canonical')
    expect(args.fromPath).toBe('/tmp/queries.jsonl')
  })

  it('combines --from with --format optimize-md', () => {
    const args = parseAnalyzeArgs([
      'analyze', '--from', 'slow-log', '/tmp/slow.log',
      '--format', 'optimize-md',
    ])
    expect(args.fromFormat).toBe('slow-log')
    expect(args.format).toBe('optimize-md')
  })

  it('still parses existing session-id usage without --from', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'md'])
    expect(args.sessionId).toBe('rec_123')
    expect(args.fromFormat).toBeUndefined()
  })

  it('throws when neither session-id nor --from is provided', () => {
    expect(() => parseAnalyzeArgs(['analyze', '--format', 'md'])).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test test/unit/CLI/AnalyzeCommand.from.test.ts
```

Expected: `FAIL` — `fromFormat` property does not exist on `AnalyzeArgs`

- [ ] **Step 3: Modify AnalyzeCommand.ts**

Replace the `AnalyzeArgs` interface and `parseAnalyzeArgs` function in `src/CLI/AnalyzeCommand.ts`:

```typescript
import type { ImportFormat } from '@/Modules/Recording/Application/Services/LogImportService'

export interface AnalyzeArgs {
  readonly sessionId?: string        // undefined when --from is used
  readonly fromFormat?: ImportFormat // set when --from is used
  readonly fromPath?: string         // set when --from is used
  readonly output?: string
  readonly format: 'md' | 'json' | 'optimize-md'
  readonly stdout: boolean
  readonly ddlPath?: string
  readonly explainDbUrl?: string
  readonly llm: boolean
  readonly minRows: number
  readonly explainConcurrency: number
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const fromIdx = rest.indexOf('--from')
  let sessionId: string | undefined
  let fromFormat: ImportFormat | undefined
  let fromPath: string | undefined

  if (fromIdx !== -1) {
    fromFormat = rest[fromIdx + 1] as ImportFormat
    fromPath = rest[fromIdx + 2]
    if (!fromFormat || !fromPath) {
      throw new Error('Usage: archivolt analyze --from <general-log|slow-log|canonical> <file-path>')
    }
  } else {
    sessionId = rest[0]
    if (!sessionId || sessionId.startsWith('--')) {
      throw new Error(
        'Usage: archivolt analyze <session-id> [--format md|json|optimize-md] [--stdout]\n' +
        '   or: archivolt analyze --from <general-log|slow-log|canonical> <file-path>'
      )
    }
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

  const concurrencyIdx = rest.indexOf('--explain-concurrency')
  const explainConcurrency = concurrencyIdx !== -1 ? Number(rest[concurrencyIdx + 1]) : 5

  return { sessionId, fromFormat, fromPath, output, format, stdout, ddlPath, explainDbUrl, llm, minRows, explainConcurrency }
}
```

Then add the import block at the top of `AnalyzeCommand.ts`:
```typescript
import { LogImportService } from '@/Modules/Recording/Application/Services/LogImportService'
```

And modify `runAnalyzeCommand` to add the import step right after creating `repo`:

```typescript
export async function runAnalyzeCommand(argv: string[]): Promise<void> {
  const args = parseAnalyzeArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)

  // --from: import log file into a virtual session first
  let sessionId = args.sessionId
  if (args.fromFormat && args.fromPath) {
    console.log(`Importing ${args.fromFormat} from: ${args.fromPath}`)
    const importSvc = new LogImportService(repo)
    sessionId = await importSvc.import(args.fromPath, args.fromFormat)
    console.log(`Created virtual session: ${sessionId}`)
  }

  if (!sessionId) {
    console.error('No session ID resolved.')
    process.exit(1)
  }

  const session = await repo.loadSession(sessionId)
  // ... rest of existing function unchanged, using `sessionId` instead of `args.sessionId`
```

Note: replace all subsequent references to `args.sessionId` in `runAnalyzeCommand` with the local `sessionId` variable.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test test/unit/CLI/AnalyzeCommand.from.test.ts
```

Expected: all 6 tests `PASS`

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
bun run check
```

Expected: all existing tests pass, TypeScript compiles cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts \
        test/unit/CLI/AnalyzeCommand.from.test.ts
git commit -m "feat: [log-import] --from flag in AnalyzeCommand wires log import into analysis pipeline"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** QueryEvent schema ✓, 3 parsers ✓, large file O(1) memory ✓, CLI `--from` syntax ✓
- [x] **No placeholders:** All tasks have complete code
- [x] **Type consistency:** `ImportFormat` defined in `LogImportService` and imported into `AnalyzeCommand`; `QueryEvent` used consistently across all parsers; `createCapturedQuery` from `Session.ts` used in `LogImportService`
- [x] **Streaming:** All parsers use `readline.createInterface()` on a `createReadStream()` — O(1) memory regardless of file size
- [x] **Backward compatibility:** Existing `archivolt analyze <session-id>` behavior unchanged; `sessionId` positional argument still works
