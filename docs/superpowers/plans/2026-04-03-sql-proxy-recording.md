# SQL Proxy 側錄模組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 Archivolt 新增 Recording 模組，提供 MySQL TCP Proxy 側錄服務，透明攔截 SQL 通訊並捕捉完整資料流。

**Architecture:** DDD 分層，與現有 Schema 模組並列。TcpProxy 使用 Bun 原生 TCP socket 實作 MySQL wire protocol 解析，QueryAnalyzer 做輕量 SQL 分類，RecordingRepository 以 JSONL 格式持久化。CLI 指令控制 session 生命週期，REST API 預留供前端使用。

**Tech Stack:** Bun TCP socket, TypeScript, Vitest, JSONL, MySQL wire protocol (text protocol subset)

---

## File Structure

### Create（新增檔案）

| 檔案 | 職責 |
|------|------|
| `src/Modules/Recording/Domain/Session.ts` | RecordingSession 與 CapturedQuery 型別定義 |
| `src/Modules/Recording/Domain/ProtocolParser.ts` | Wire protocol 解析介面 |
| `src/Modules/Recording/Application/Services/QueryAnalyzer.ts` | SQL 分類與 table 名提取 |
| `src/Modules/Recording/Application/Services/RecordingService.ts` | Session 生命週期管理 |
| `src/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser.ts` | MySQL wire protocol 解析器 |
| `src/Modules/Recording/Infrastructure/Proxy/TcpProxy.ts` | Bun TCP proxy 核心 |
| `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts` | JSONL 檔案持久化 |
| `src/Modules/Recording/Infrastructure/Providers/RecordingServiceProvider.ts` | DI 容器註冊 |
| `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` | REST API |
| `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` | 路由定義 |
| `src/CLI/RecordCommand.ts` | CLI record 子指令 |
| `src/wiring/recording.ts` | Recording 模組 wiring |
| `test/unit/Recording/Domain/Session.test.ts` | Session 型別測試 |
| `test/unit/Recording/Application/QueryAnalyzer.test.ts` | SQL 分類測試 |
| `test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts` | Protocol 解析測試 |
| `test/unit/Recording/Infrastructure/TcpProxy.test.ts` | Proxy 轉發測試 |
| `test/unit/Recording/Infrastructure/RecordingRepository.test.ts` | JSONL 持久化測試 |
| `test/unit/Recording/Application/RecordingService.test.ts` | Session 管理整合測試 |
| `test/unit/Recording/CLI/RecordCommand.test.ts` | CLI 指令測試 |

### Modify（修改檔案）

| 檔案 | 變更 |
|------|------|
| `src/bootstrap.ts` | 註冊 RecordingServiceProvider |
| `src/routes.ts` | 註冊 Recording routes |
| `src/wiring/index.ts` | 匯出 registerRecording |
| `src/index.ts` | 加入 `record` CLI 子指令路由 |

---

## Task 1: Domain 型別定義

**Files:**
- Create: `src/Modules/Recording/Domain/Session.ts`
- Create: `src/Modules/Recording/Domain/ProtocolParser.ts`
- Test: `test/unit/Recording/Domain/Session.test.ts`

- [ ] **Step 1: 建立 Session.ts — 定義所有 Domain 型別**

```typescript
// src/Modules/Recording/Domain/Session.ts

export interface CapturedQuery {
  readonly id: string
  readonly sessionId: string
  readonly connectionId: number
  readonly timestamp: number
  readonly duration: number
  readonly sql: string
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly affectedRows?: number
  readonly resultSummary?: {
    readonly columnCount: number
    readonly rowCount: number
    readonly columns: readonly string[]
    readonly sampleRows: readonly Record<string, unknown>[]
  }
  readonly error?: string
}

export interface ProxyConfig {
  readonly listenPort: number
  readonly targetHost: string
  readonly targetPort: number
}

export interface SessionStats {
  readonly totalQueries: number
  readonly byOperation: Record<string, number>
  readonly tablesAccessed: readonly string[]
  readonly connectionCount: number
}

export interface RecordingSession {
  readonly id: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly status: 'recording' | 'stopped'
  readonly proxy: ProxyConfig
  readonly stats: SessionStats
}

let _counter = 0

export function createSession(proxy: ProxyConfig): RecordingSession {
  return {
    id: `rec_${Date.now()}_${_counter++}`,
    startedAt: Date.now(),
    status: 'recording',
    proxy,
    stats: {
      totalQueries: 0,
      byOperation: {},
      tablesAccessed: [],
      connectionCount: 0,
    },
  }
}

export function stopSession(session: RecordingSession): RecordingSession {
  return {
    ...session,
    endedAt: Date.now(),
    status: 'stopped',
  }
}

export function updateSessionStats(
  session: RecordingSession,
  queries: readonly CapturedQuery[],
  connectionCount: number,
): RecordingSession {
  const byOperation: Record<string, number> = {}
  const tablesSet = new Set<string>()

  for (const q of queries) {
    byOperation[q.operation] = (byOperation[q.operation] ?? 0) + 1
    for (const t of q.tables) {
      tablesSet.add(t)
    }
  }

  return {
    ...session,
    stats: {
      totalQueries: queries.length,
      byOperation,
      tablesAccessed: [...tablesSet].sort(),
      connectionCount,
    },
  }
}

export function createCapturedQuery(params: {
  sessionId: string
  connectionId: number
  sql: string
  operation: CapturedQuery['operation']
  tables: readonly string[]
  duration: number
  affectedRows?: number
  resultSummary?: CapturedQuery['resultSummary']
  error?: string
}): CapturedQuery {
  return {
    id: `q_${Date.now()}_${_counter++}`,
    timestamp: Date.now(),
    ...params,
  }
}
```

- [ ] **Step 2: 建立 ProtocolParser.ts — 定義 protocol 解析介面**

```typescript
// src/Modules/Recording/Domain/ProtocolParser.ts

export interface ParsedQuery {
  readonly sql: string
}

export interface ParsedResultSet {
  readonly columnCount: number
  readonly columns: readonly string[]
  readonly rowCount: number
  readonly rows: readonly Record<string, unknown>[]
  readonly affectedRows?: number
}

export interface ParsedError {
  readonly code: number
  readonly message: string
}

export type ParsedServerResponse =
  | { readonly type: 'resultSet'; readonly data: ParsedResultSet }
  | { readonly type: 'ok'; readonly affectedRows: number }
  | { readonly type: 'error'; readonly data: ParsedError }
  | { readonly type: 'unknown' }

export interface IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null
  parseResponse(data: Buffer): ParsedServerResponse
  isHandshakePhase(data: Buffer, fromServer: boolean): boolean
}
```

- [ ] **Step 3: 寫測試 — 驗證 createSession、stopSession、updateSessionStats 的 immutability 和正確性**

```typescript
// test/unit/Recording/Domain/Session.test.ts

import { describe, it, expect } from 'vitest'
import {
  createSession,
  stopSession,
  updateSessionStats,
  createCapturedQuery,
  type ProxyConfig,
  type CapturedQuery,
} from '@/Modules/Recording/Domain/Session'

const proxyConfig: ProxyConfig = {
  listenPort: 13306,
  targetHost: 'localhost',
  targetPort: 3306,
}

describe('createSession', () => {
  it('creates a session with recording status', () => {
    const session = createSession(proxyConfig)
    expect(session.status).toBe('recording')
    expect(session.proxy).toEqual(proxyConfig)
    expect(session.stats.totalQueries).toBe(0)
    expect(session.endedAt).toBeUndefined()
  })

  it('generates unique ids', () => {
    const a = createSession(proxyConfig)
    const b = createSession(proxyConfig)
    expect(a.id).not.toBe(b.id)
  })
})

describe('stopSession', () => {
  it('marks session as stopped with endedAt', () => {
    const session = createSession(proxyConfig)
    const stopped = stopSession(session)
    expect(stopped.status).toBe('stopped')
    expect(stopped.endedAt).toBeDefined()
    expect(stopped.endedAt).toBeGreaterThanOrEqual(stopped.startedAt)
  })

  it('returns a new object (immutable)', () => {
    const session = createSession(proxyConfig)
    const stopped = stopSession(session)
    expect(stopped).not.toBe(session)
    expect(session.status).toBe('recording')
  })
})

describe('updateSessionStats', () => {
  it('computes stats from queries', () => {
    const session = createSession(proxyConfig)
    const queries: CapturedQuery[] = [
      createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT * FROM users',
        operation: 'SELECT',
        tables: ['users'],
        duration: 5,
      }),
      createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'INSERT INTO orders (user_id) VALUES (1)',
        operation: 'INSERT',
        tables: ['orders'],
        duration: 3,
      }),
      createCapturedQuery({
        sessionId: session.id,
        connectionId: 2,
        sql: 'SELECT * FROM users',
        operation: 'SELECT',
        tables: ['users'],
        duration: 2,
      }),
    ]

    const updated = updateSessionStats(session, queries, 2)
    expect(updated.stats.totalQueries).toBe(3)
    expect(updated.stats.byOperation).toEqual({ SELECT: 2, INSERT: 1 })
    expect(updated.stats.tablesAccessed).toEqual(['orders', 'users'])
    expect(updated.stats.connectionCount).toBe(2)
  })

  it('returns a new object (immutable)', () => {
    const session = createSession(proxyConfig)
    const updated = updateSessionStats(session, [], 0)
    expect(updated).not.toBe(session)
    expect(session.stats.totalQueries).toBe(0)
  })
})

describe('createCapturedQuery', () => {
  it('creates a query with timestamp and unique id', () => {
    const q = createCapturedQuery({
      sessionId: 'rec_1',
      connectionId: 1,
      sql: 'SELECT 1',
      operation: 'SELECT',
      tables: [],
      duration: 1,
    })
    expect(q.id).toMatch(/^q_/)
    expect(q.timestamp).toBeGreaterThan(0)
    expect(q.sql).toBe('SELECT 1')
  })
})
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Domain/Session.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Domain/Session.ts src/Modules/Recording/Domain/ProtocolParser.ts test/unit/Recording/Domain/Session.test.ts
git commit -m "feat: [recording] Domain 型別定義 — Session、CapturedQuery、ProtocolParser 介面"
```

---

## Task 2: QueryAnalyzer — SQL 分類與 table 名提取

**Files:**
- Create: `src/Modules/Recording/Application/Services/QueryAnalyzer.ts`
- Test: `test/unit/Recording/Application/QueryAnalyzer.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// test/unit/Recording/Application/QueryAnalyzer.test.ts

import { describe, it, expect } from 'vitest'
import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'

describe('analyzeQuery', () => {
  describe('operation detection', () => {
    it('detects SELECT', () => {
      const result = analyzeQuery('SELECT * FROM users WHERE id = 1')
      expect(result.operation).toBe('SELECT')
    })

    it('detects INSERT', () => {
      const result = analyzeQuery('INSERT INTO orders (user_id) VALUES (1)')
      expect(result.operation).toBe('INSERT')
    })

    it('detects UPDATE', () => {
      const result = analyzeQuery('UPDATE users SET name = "bob" WHERE id = 1')
      expect(result.operation).toBe('UPDATE')
    })

    it('detects DELETE', () => {
      const result = analyzeQuery('DELETE FROM orders WHERE id = 1')
      expect(result.operation).toBe('DELETE')
    })

    it('detects OTHER for SET statements', () => {
      const result = analyzeQuery('SET NAMES utf8mb4')
      expect(result.operation).toBe('OTHER')
    })

    it('handles case insensitivity', () => {
      const result = analyzeQuery('select * from users')
      expect(result.operation).toBe('SELECT')
    })

    it('handles leading whitespace', () => {
      const result = analyzeQuery('  SELECT * FROM users')
      expect(result.operation).toBe('SELECT')
    })
  })

  describe('table extraction', () => {
    it('extracts table from SELECT ... FROM', () => {
      const result = analyzeQuery('SELECT * FROM users WHERE id = 1')
      expect(result.tables).toEqual(['users'])
    })

    it('extracts table from INSERT INTO', () => {
      const result = analyzeQuery('INSERT INTO orders (user_id) VALUES (1)')
      expect(result.tables).toEqual(['orders'])
    })

    it('extracts table from UPDATE', () => {
      const result = analyzeQuery('UPDATE users SET name = "bob"')
      expect(result.tables).toEqual(['users'])
    })

    it('extracts table from DELETE FROM', () => {
      const result = analyzeQuery('DELETE FROM orders WHERE id = 1')
      expect(result.tables).toEqual(['orders'])
    })

    it('extracts multiple tables from JOIN', () => {
      const result = analyzeQuery('SELECT u.name, o.id FROM users u JOIN orders o ON u.id = o.user_id')
      expect(result.tables).toContain('users')
      expect(result.tables).toContain('orders')
    })

    it('handles backtick-quoted table names', () => {
      const result = analyzeQuery('SELECT * FROM `user-data` WHERE id = 1')
      expect(result.tables).toEqual(['user-data'])
    })

    it('strips schema prefix from table names', () => {
      const result = analyzeQuery('SELECT * FROM mydb.users')
      expect(result.tables).toEqual(['users'])
    })

    it('returns empty array for unparseable queries', () => {
      const result = analyzeQuery('SET NAMES utf8mb4')
      expect(result.tables).toEqual([])
    })
  })

  describe('transaction detection', () => {
    it('detects BEGIN', () => {
      expect(analyzeQuery('BEGIN').isTransaction).toBe(true)
    })

    it('detects START TRANSACTION', () => {
      expect(analyzeQuery('START TRANSACTION').isTransaction).toBe(true)
    })

    it('detects COMMIT', () => {
      expect(analyzeQuery('COMMIT').isTransaction).toBe(true)
    })

    it('detects ROLLBACK', () => {
      expect(analyzeQuery('ROLLBACK').isTransaction).toBe(true)
    })

    it('returns false for regular queries', () => {
      expect(analyzeQuery('SELECT 1').isTransaction).toBe(false)
    })
  })

  describe('schema change detection', () => {
    it('detects ALTER TABLE', () => {
      expect(analyzeQuery('ALTER TABLE users ADD COLUMN email VARCHAR(255)').isSchemaChange).toBe(true)
    })

    it('detects CREATE TABLE', () => {
      expect(analyzeQuery('CREATE TABLE logs (id INT)').isSchemaChange).toBe(true)
    })

    it('detects DROP TABLE', () => {
      expect(analyzeQuery('DROP TABLE temp_data').isSchemaChange).toBe(true)
    })

    it('returns false for DML', () => {
      expect(analyzeQuery('SELECT 1').isSchemaChange).toBe(false)
    })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/Application/QueryAnalyzer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 QueryAnalyzer**

```typescript
// src/Modules/Recording/Application/Services/QueryAnalyzer.ts

export interface AnalyzedQuery {
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly isTransaction: boolean
  readonly isSchemaChange: boolean
}

const TRANSACTION_KEYWORDS = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i
const SCHEMA_CHANGE_KEYWORDS = /^\s*(ALTER|CREATE|DROP|TRUNCATE)\s+(TABLE|INDEX|DATABASE)\b/i

const TABLE_PATTERNS = [
  /\bFROM\s+`?(\w[\w.-]*)`?/gi,
  /\bJOIN\s+`?(\w[\w.-]*)`?/gi,
  /\bINTO\s+`?(\w[\w.-]*)`?/gi,
  /\bUPDATE\s+`?(\w[\w.-]*)`?/gi,
]

function extractOperation(sql: string): AnalyzedQuery['operation'] {
  const trimmed = sql.trimStart().toUpperCase()
  if (trimmed.startsWith('SELECT')) return 'SELECT'
  if (trimmed.startsWith('INSERT')) return 'INSERT'
  if (trimmed.startsWith('UPDATE')) return 'UPDATE'
  if (trimmed.startsWith('DELETE')) return 'DELETE'
  return 'OTHER'
}

function extractTables(sql: string): readonly string[] {
  const tables = new Set<string>()

  for (const pattern of TABLE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sql)) !== null) {
      let tableName = match[1]
      // Strip schema prefix: mydb.users → users
      const dotIdx = tableName.lastIndexOf('.')
      if (dotIdx !== -1) {
        tableName = tableName.slice(dotIdx + 1)
      }
      tables.add(tableName)
    }
  }

  return [...tables]
}

export function analyzeQuery(sql: string): AnalyzedQuery {
  return {
    operation: extractOperation(sql),
    tables: extractTables(sql),
    isTransaction: TRANSACTION_KEYWORDS.test(sql),
    isSchemaChange: SCHEMA_CHANGE_KEYWORDS.test(sql),
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Application/QueryAnalyzer.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/QueryAnalyzer.ts test/unit/Recording/Application/QueryAnalyzer.test.ts
git commit -m "feat: [recording] QueryAnalyzer — SQL 分類與 table 名提取"
```

---

## Task 3: MysqlProtocolParser — MySQL Wire Protocol 解析

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser.ts`
- Test: `test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts`

- [ ] **Step 1: 寫測試 — 用預製 binary 封包驗證解析**

```typescript
// test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts

import { describe, it, expect } from 'vitest'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'

// MySQL packet helpers: 3-byte length (little-endian) + 1-byte sequence + payload
function buildPacket(sequenceId: number, payload: Buffer): Buffer {
  const length = Buffer.alloc(3)
  length.writeUIntLE(payload.length, 0, 3)
  const seq = Buffer.from([sequenceId])
  return Buffer.concat([length, seq, payload])
}

// COM_QUERY packet: command byte 0x03 + SQL string
function buildComQuery(sql: string, sequenceId = 0): Buffer {
  const payload = Buffer.concat([Buffer.from([0x03]), Buffer.from(sql, 'utf-8')])
  return buildPacket(sequenceId, payload)
}

// OK packet: 0x00 header + affected_rows (lenenc) + last_insert_id (lenenc)
function buildOkPacket(affectedRows: number, sequenceId = 1): Buffer {
  const payload = Buffer.from([0x00, affectedRows, 0x00, 0x00, 0x00])
  return buildPacket(sequenceId, payload)
}

// ERR packet: 0xFF header + error_code (2 bytes LE) + '#' + sqlstate (5) + message
function buildErrPacket(code: number, message: string, sequenceId = 1): Buffer {
  const header = Buffer.from([0xff])
  const errCode = Buffer.alloc(2)
  errCode.writeUInt16LE(code)
  const marker = Buffer.from('#')
  const sqlState = Buffer.from('HY000')
  const msg = Buffer.from(message, 'utf-8')
  const payload = Buffer.concat([header, errCode, marker, sqlState, msg])
  return buildPacket(sequenceId, payload)
}

// Handshake packet: starts with protocol version 10
function buildHandshakePacket(): Buffer {
  const protocolVersion = Buffer.from([0x0a])
  const serverVersion = Buffer.from('8.0.36\0', 'utf-8')
  const connectionId = Buffer.alloc(4)
  connectionId.writeUInt32LE(1)
  const filler = Buffer.alloc(30, 0)
  const payload = Buffer.concat([protocolVersion, serverVersion, connectionId, filler])
  return buildPacket(0, payload)
}

describe('MysqlProtocolParser', () => {
  const parser = new MysqlProtocolParser()

  describe('extractQuery', () => {
    it('extracts SQL from COM_QUERY packet', () => {
      const packet = buildComQuery('SELECT * FROM users')
      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe('SELECT * FROM users')
    })

    it('returns null for non-COM_QUERY packets', () => {
      // COM_QUIT = 0x01
      const payload = Buffer.from([0x01])
      const packet = buildPacket(0, payload)
      const result = parser.extractQuery(packet)
      expect(result).toBeNull()
    })

    it('handles empty SQL', () => {
      const packet = buildComQuery('')
      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe('')
    })

    it('handles multi-byte characters', () => {
      const packet = buildComQuery('SELECT * FROM users WHERE name = "測試"')
      const result = parser.extractQuery(packet)
      expect(result!.sql).toBe('SELECT * FROM users WHERE name = "測試"')
    })
  })

  describe('parseResponse', () => {
    it('parses OK packet', () => {
      const packet = buildOkPacket(5)
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('ok')
      if (result.type === 'ok') {
        expect(result.affectedRows).toBe(5)
      }
    })

    it('parses ERR packet', () => {
      const packet = buildErrPacket(1146, 'Table not found')
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.data.code).toBe(1146)
        expect(result.data.message).toBe('Table not found')
      }
    })

    it('returns unknown for unrecognized packets', () => {
      const payload = Buffer.from([0x02, 0x00, 0x00])
      const packet = buildPacket(1, payload)
      const result = parser.parseResponse(packet)
      // column count packet (0x02) → result set start, treated as unknown in simple parsing
      expect(result.type).toBe('resultSet')
    })
  })

  describe('isHandshakePhase', () => {
    it('detects server handshake packet', () => {
      const packet = buildHandshakePacket()
      expect(parser.isHandshakePhase(packet, true)).toBe(true)
    })

    it('returns false for non-handshake server packet', () => {
      const packet = buildOkPacket(0)
      expect(parser.isHandshakePhase(packet, true)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 MysqlProtocolParser**

```typescript
// src/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser.ts

import type {
  IProtocolParser,
  ParsedQuery,
  ParsedServerResponse,
} from '@/Modules/Recording/Domain/ProtocolParser'

// MySQL Command Bytes
const COM_QUERY = 0x03

// MySQL Response Headers
const OK_HEADER = 0x00
const ERR_HEADER = 0xff
const EOF_HEADER = 0xfe

// Handshake protocol version
const PROTOCOL_VERSION_10 = 0x0a

function readPacketPayload(data: Buffer): { sequenceId: number; payload: Buffer } | null {
  if (data.length < 4) return null
  const payloadLength = data.readUIntLE(0, 3)
  const sequenceId = data[3]
  if (data.length < 4 + payloadLength) return null
  const payload = data.subarray(4, 4 + payloadLength)
  return { sequenceId, payload }
}

function readLenencInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  const first = buf[offset]
  if (first < 0xfb) return { value: first, bytesRead: 1 }
  if (first === 0xfc) return { value: buf.readUInt16LE(offset + 1), bytesRead: 3 }
  if (first === 0xfd) return { value: buf.readUIntLE(offset + 1, 3), bytesRead: 4 }
  // 0xfe — 8-byte int, truncate to number for our purposes
  return { value: Number(buf.readBigUInt64LE(offset + 1)), bytesRead: 9 }
}

export class MysqlProtocolParser implements IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null {
    const packet = readPacketPayload(data)
    if (!packet) return null

    const { payload } = packet
    if (payload.length < 1) return null
    if (payload[0] !== COM_QUERY) return null

    const sql = payload.subarray(1).toString('utf-8')
    return { sql }
  }

  parseResponse(data: Buffer): ParsedServerResponse {
    const packet = readPacketPayload(data)
    if (!packet) return { type: 'unknown' }

    const { payload } = packet
    if (payload.length < 1) return { type: 'unknown' }

    const header = payload[0]

    if (header === OK_HEADER && payload.length >= 2) {
      const { value: affectedRows } = readLenencInt(payload, 1)
      return { type: 'ok', affectedRows }
    }

    if (header === ERR_HEADER && payload.length >= 4) {
      const code = payload.readUInt16LE(1)
      // Skip '#' marker (1 byte) + SQL state (5 bytes) if present
      let msgOffset = 3
      if (payload.length > 3 && payload[3] === 0x23) {
        // '#' marker present
        msgOffset = 9 // 1 (header) + 2 (code) + 1 ('#') + 5 (sqlstate)
      }
      const message = payload.subarray(msgOffset).toString('utf-8')
      return { type: 'error', data: { code, message } }
    }

    // Column count packet signals result set start
    if (header !== EOF_HEADER && header !== OK_HEADER && header !== ERR_HEADER) {
      const { value: columnCount } = readLenencInt(payload, 0)
      return {
        type: 'resultSet',
        data: {
          columnCount,
          columns: [],
          rowCount: 0,
          rows: [],
        },
      }
    }

    return { type: 'unknown' }
  }

  isHandshakePhase(data: Buffer, fromServer: boolean): boolean {
    if (!fromServer) return false
    const packet = readPacketPayload(data)
    if (!packet) return false
    if (packet.sequenceId !== 0) return false
    return packet.payload.length > 0 && packet.payload[0] === PROTOCOL_VERSION_10
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser.ts test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts
git commit -m "feat: [recording] MysqlProtocolParser — MySQL wire protocol 封包解析"
```

---

## Task 4: RecordingRepository — JSONL 持久化

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts`
- Test: `test/unit/Recording/Infrastructure/RecordingRepository.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// test/unit/Recording/Infrastructure/RecordingRepository.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { createSession, createCapturedQuery, type ProxyConfig } from '@/Modules/Recording/Domain/Session'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const TEST_DIR = path.resolve(import.meta.dirname, '../../../__test_recordings__')

const proxyConfig: ProxyConfig = {
  listenPort: 13306,
  targetHost: 'localhost',
  targetPort: 3306,
}

describe('RecordingRepository', () => {
  let repo: RecordingRepository

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  describe('saveSession / loadSession', () => {
    it('saves and loads a session', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)
      const loaded = await repo.loadSession(session.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe(session.id)
      expect(loaded!.status).toBe('recording')
      expect(loaded!.proxy).toEqual(proxyConfig)
    })

    it('returns null for non-existent session', async () => {
      const loaded = await repo.loadSession('nonexistent')
      expect(loaded).toBeNull()
    })
  })

  describe('appendQueries / loadQueries', () => {
    it('appends and loads queries in JSONL format', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)

      const q1 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT * FROM users',
        operation: 'SELECT',
        tables: ['users'],
        duration: 5,
      })
      const q2 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'INSERT INTO orders (user_id) VALUES (1)',
        operation: 'INSERT',
        tables: ['orders'],
        duration: 3,
      })

      await repo.appendQueries(session.id, [q1, q2])

      const loaded = await repo.loadQueries(session.id)
      expect(loaded.length).toBe(2)
      expect(loaded[0].sql).toBe('SELECT * FROM users')
      expect(loaded[1].sql).toBe('INSERT INTO orders (user_id) VALUES (1)')
    })

    it('appends across multiple calls', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)

      const q1 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT 1',
        operation: 'SELECT',
        tables: [],
        duration: 1,
      })
      const q2 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT 2',
        operation: 'SELECT',
        tables: [],
        duration: 1,
      })

      await repo.appendQueries(session.id, [q1])
      await repo.appendQueries(session.id, [q2])

      const loaded = await repo.loadQueries(session.id)
      expect(loaded.length).toBe(2)
    })

    it('returns empty array for session with no queries', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)
      const loaded = await repo.loadQueries(session.id)
      expect(loaded).toEqual([])
    })
  })

  describe('listSessions', () => {
    it('lists all sessions', async () => {
      const s1 = createSession(proxyConfig)
      const s2 = createSession(proxyConfig)
      await repo.saveSession(s1)
      await repo.saveSession(s2)

      const sessions = await repo.listSessions()
      expect(sessions.length).toBe(2)
      const ids = sessions.map((s) => s.id)
      expect(ids).toContain(s1.id)
      expect(ids).toContain(s2.id)
    })

    it('returns empty array when no sessions', async () => {
      const sessions = await repo.listSessions()
      expect(sessions).toEqual([])
    })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/Infrastructure/RecordingRepository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 RecordingRepository**

```typescript
// src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'

export class RecordingRepository {
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

  async saveSession(session: RecordingSession): Promise<void> {
    const dir = this.sessionDir(session.id)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const json = JSON.stringify(session, null, 2)
    await Bun.write(this.sessionFile(session.id), json)
  }

  async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const filePath = this.sessionFile(sessionId)
    const file = Bun.file(filePath)
    if (!(await file.exists())) return null
    return file.json() as Promise<RecordingSession>
  }

  async appendQueries(sessionId: string, queries: readonly CapturedQuery[]): Promise<void> {
    if (queries.length === 0) return
    const lines = queries.map((q) => JSON.stringify(q)).join('\n') + '\n'
    const filePath = this.queriesFile(sessionId)
    const file = Bun.file(filePath)
    const existing = (await file.exists()) ? await file.text() : ''
    await Bun.write(filePath, existing + lines)
  }

  async loadQueries(sessionId: string): Promise<CapturedQuery[]> {
    const filePath = this.queriesFile(sessionId)
    const file = Bun.file(filePath)
    if (!(await file.exists())) return []
    const text = await file.text()
    if (!text.trim()) return []
    return text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as CapturedQuery)
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

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Infrastructure/RecordingRepository.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Persistence/RecordingRepository.ts test/unit/Recording/Infrastructure/RecordingRepository.test.ts
git commit -m "feat: [recording] RecordingRepository — JSONL 持久化"
```

---

## Task 5: TcpProxy — Bun TCP Socket Proxy 核心

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Proxy/TcpProxy.ts`
- Test: `test/unit/Recording/Infrastructure/TcpProxy.test.ts`

- [ ] **Step 1: 寫測試 — 用 Bun TCP server 模擬 echo DB 驗證轉發**

```typescript
// test/unit/Recording/Infrastructure/TcpProxy.test.ts

import { describe, it, expect, afterEach } from 'vitest'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

// Helper: build a MySQL COM_QUERY packet
function buildComQuery(sql: string): Buffer {
  const sqlBuf = Buffer.from(sql, 'utf-8')
  const payloadLen = 1 + sqlBuf.length
  const header = Buffer.alloc(4)
  header.writeUIntLE(payloadLen, 0, 3)
  header[3] = 0 // sequence id
  return Buffer.concat([header, Buffer.from([0x03]), sqlBuf])
}

// Helper: build a MySQL OK packet
function buildOkPacket(affectedRows: number): Buffer {
  const payload = Buffer.from([0x00, affectedRows, 0x00, 0x00, 0x00])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 1
  return Buffer.concat([header, payload])
}

// Helper: build a handshake packet
function buildHandshakePacket(): Buffer {
  const protocolVersion = Buffer.from([0x0a])
  const serverVersion = Buffer.from('8.0.36\0', 'utf-8')
  const connectionId = Buffer.alloc(4)
  connectionId.writeUInt32LE(1)
  const filler = Buffer.alloc(30, 0)
  const payload = Buffer.concat([protocolVersion, serverVersion, connectionId, filler])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 0
  return Buffer.concat([header, payload])
}

describe('TcpProxy', () => {
  let proxy: TcpProxy | null = null
  let mockDb: ReturnType<typeof Bun.listen> | null = null

  afterEach(async () => {
    if (proxy) {
      await proxy.stop()
      proxy = null
    }
    if (mockDb) {
      mockDb.stop()
      mockDb = null
    }
  })

  it('forwards data between client and server', async () => {
    // Start a mock DB server that sends handshake then echoes OK for any query
    const handshake = buildHandshakePacket()
    const okResponse = buildOkPacket(1)

    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0, // random available port
      socket: {
        open(socket) {
          socket.write(handshake)
        },
        data(socket, data) {
          // Reply OK to any client data after handshake
          socket.write(okResponse)
        },
        close() {},
        error() {},
      },
    })

    const mockDbPort = mockDb.port
    const captured: CapturedQuery[] = []

    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDbPort,
      parser: new MysqlProtocolParser(),
      onQuery: (query) => {
        captured.push(query)
      },
    })

    const proxyPort = await proxy.start()

    // Connect as a client through the proxy
    const client = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    })

    // Wait for handshake
    await new Promise((r) => setTimeout(r, 100))

    // Send a COM_QUERY
    const queryPacket = buildComQuery('SELECT * FROM users')
    client.write(queryPacket)

    // Wait for proxy to process
    await new Promise((r) => setTimeout(r, 200))

    client.end()

    expect(captured.length).toBeGreaterThanOrEqual(1)
    expect(captured[0].sql).toBe('SELECT * FROM users')
    expect(captured[0].operation).toBe('SELECT')
    expect(captured[0].tables).toContain('users')
  })

  it('reports connection count', async () => {
    const handshake = buildHandshakePacket()

    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) {
          socket.write(handshake)
        },
        data() {},
        close() {},
        error() {},
      },
    })

    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDb.port,
      parser: new MysqlProtocolParser(),
      onQuery: () => {},
    })

    const proxyPort = await proxy.start()

    const c1 = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(proxy.connectionCount).toBe(1)

    c1.end()
    await new Promise((r) => setTimeout(r, 50))
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/Infrastructure/TcpProxy.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 TcpProxy**

```typescript
// src/Modules/Recording/Infrastructure/Proxy/TcpProxy.ts

import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'
import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'
import type { Socket, TCPSocketListener } from 'bun'

const MAX_SAMPLE_ROWS = 10

interface TcpProxyConfig {
  readonly listenPort: number
  readonly targetHost: string
  readonly targetPort: number
  readonly parser: IProtocolParser
  readonly onQuery: (query: CapturedQuery) => void
}

interface ConnectionState {
  readonly id: number
  readonly sessionId: string
  handshakeComplete: boolean
  pendingQuery: { sql: string; startTime: number } | null
  serverSocket: Socket<ConnectionState> | null
}

export class TcpProxy {
  private readonly config: TcpProxyConfig
  private listener: TCPSocketListener<ConnectionState> | null = null
  private _connectionCount = 0
  private connectionIdCounter = 0
  private readonly sessionId: string

  constructor(config: TcpProxyConfig) {
    this.config = config
    this.sessionId = `proxy_${Date.now()}`
  }

  get connectionCount(): number {
    return this._connectionCount
  }

  async start(): Promise<number> {
    const { targetHost, targetPort, parser, onQuery } = this.config
    const self = this

    this.listener = Bun.listen<ConnectionState>({
      hostname: '127.0.0.1',
      port: this.config.listenPort,
      socket: {
        async open(clientSocket) {
          const connId = ++self.connectionIdCounter
          self._connectionCount++

          const state: ConnectionState = {
            id: connId,
            sessionId: self.sessionId,
            handshakeComplete: false,
            pendingQuery: null,
            serverSocket: null,
          }
          clientSocket.data = state

          // Connect to the real DB
          const serverSocket = await Bun.connect<ConnectionState>({
            hostname: targetHost,
            port: targetPort,
            socket: {
              data(serverSock, data) {
                const clientState = serverSock.data
                const buf = Buffer.from(data)

                // Detect handshake phase
                if (!clientState.handshakeComplete) {
                  if (parser.isHandshakePhase(buf, true)) {
                    // Just forward handshake
                    clientSocket.write(data)
                    return
                  }
                  // After handshake, first OK from server means auth success
                  clientState.handshakeComplete = true
                  clientSocket.write(data)
                  return
                }

                // Process response for pending query
                if (clientState.pendingQuery) {
                  const { sql, startTime } = clientState.pendingQuery
                  const duration = Date.now() - startTime
                  const analysis = analyzeQuery(sql)
                  const response = parser.parseResponse(buf)

                  const captured = createCapturedQuery({
                    sessionId: clientState.sessionId,
                    connectionId: clientState.id,
                    sql,
                    operation: analysis.operation,
                    tables: analysis.tables as string[],
                    duration,
                    affectedRows: response.type === 'ok' ? response.affectedRows : undefined,
                    resultSummary:
                      response.type === 'resultSet'
                        ? {
                            columnCount: response.data.columnCount,
                            rowCount: response.data.rowCount,
                            columns: response.data.columns as string[],
                            sampleRows: response.data.rows.slice(0, MAX_SAMPLE_ROWS) as Record<string, unknown>[],
                          }
                        : undefined,
                    error: response.type === 'error' ? response.data.message : undefined,
                  })

                  onQuery(captured)
                  clientState.pendingQuery = null
                }

                // Forward to client
                clientSocket.write(data)
              },
              open(serverSock) {
                serverSock.data = state
              },
              close() {
                clientSocket.end()
              },
              error() {
                clientSocket.end()
              },
            },
          })

          state.serverSocket = serverSocket
        },

        data(clientSocket, data) {
          const state = clientSocket.data
          if (!state?.serverSocket) return

          const buf = Buffer.from(data)

          // Try to extract a query
          const query = parser.extractQuery(buf)
          if (query) {
            state.pendingQuery = {
              sql: query.sql,
              startTime: Date.now(),
            }
          }

          // Forward to real DB
          state.serverSocket.write(data)
        },

        close(clientSocket) {
          const state = clientSocket.data
          if (state?.serverSocket) {
            state.serverSocket.end()
          }
          self._connectionCount--
        },

        error(clientSocket) {
          const state = clientSocket.data
          if (state?.serverSocket) {
            state.serverSocket.end()
          }
          self._connectionCount--
        },
      },
    })

    return this.listener.port
  }

  async stop(): Promise<void> {
    if (this.listener) {
      this.listener.stop()
      this.listener = null
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Infrastructure/TcpProxy.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/TcpProxy.ts test/unit/Recording/Infrastructure/TcpProxy.test.ts
git commit -m "feat: [recording] TcpProxy — Bun TCP socket proxy 核心"
```

---

## Task 6: RecordingService — Session 生命週期管理

**Files:**
- Create: `src/Modules/Recording/Application/Services/RecordingService.ts`
- Test: `test/unit/Recording/Application/RecordingService.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// test/unit/Recording/Application/RecordingService.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const TEST_DIR = path.resolve(import.meta.dirname, '../../../__test_rec_service__')

// Mock DB: sends handshake then OK for every query
function buildHandshakePacket(): Buffer {
  const protocolVersion = Buffer.from([0x0a])
  const serverVersion = Buffer.from('8.0.36\0', 'utf-8')
  const connectionId = Buffer.alloc(4)
  connectionId.writeUInt32LE(1)
  const filler = Buffer.alloc(30, 0)
  const payload = Buffer.concat([protocolVersion, serverVersion, connectionId, filler])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 0
  return Buffer.concat([header, payload])
}

function buildOkPacket(): Buffer {
  const payload = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 1
  return Buffer.concat([header, payload])
}

function buildComQuery(sql: string): Buffer {
  const sqlBuf = Buffer.from(sql, 'utf-8')
  const payloadLen = 1 + sqlBuf.length
  const header = Buffer.alloc(4)
  header.writeUIntLE(payloadLen, 0, 3)
  header[3] = 0
  return Buffer.concat([header, Buffer.from([0x03]), sqlBuf])
}

describe('RecordingService', () => {
  let service: RecordingService
  let repo: RecordingRepository
  let mockDb: ReturnType<typeof Bun.listen> | null = null

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
    service = new RecordingService(repo, new MysqlProtocolParser())
  })

  afterEach(async () => {
    if (service.isRecording) {
      await service.stop()
    }
    if (mockDb) {
      mockDb.stop()
      mockDb = null
    }
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  function startMockDb(): number {
    const handshake = buildHandshakePacket()
    const ok = buildOkPacket()
    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) { socket.write(handshake) },
        data(socket) { socket.write(ok) },
        close() {},
        error() {},
      },
    })
    return mockDb.port
  }

  it('starts and stops a recording session', async () => {
    const dbPort = startMockDb()
    const session = await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    expect(session.status).toBe('recording')
    expect(service.isRecording).toBe(true)

    const stopped = await service.stop()
    expect(stopped.status).toBe('stopped')
    expect(stopped.endedAt).toBeDefined()
    expect(service.isRecording).toBe(false)
  })

  it('throws if starting while already recording', async () => {
    const dbPort = startMockDb()
    await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    await expect(
      service.start({ listenPort: 0, targetHost: '127.0.0.1', targetPort: dbPort }),
    ).rejects.toThrow('already recording')
  })

  it('captures queries during session', async () => {
    const dbPort = startMockDb()
    const session = await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    const proxyPort = service.proxyPort!

    // Connect and send a query
    const client = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })

    await new Promise((r) => setTimeout(r, 100))
    client.write(buildComQuery('INSERT INTO orders (user_id) VALUES (1)'))
    await new Promise((r) => setTimeout(r, 200))
    client.end()

    const stopped = await service.stop()
    const queries = await repo.loadQueries(stopped.id)

    expect(queries.length).toBeGreaterThanOrEqual(1)
    expect(queries[0].sql).toBe('INSERT INTO orders (user_id) VALUES (1)')
  })

  it('returns session status', async () => {
    expect(service.status()).toBeNull()

    const dbPort = startMockDb()
    await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    const status = service.status()
    expect(status).not.toBeNull()
    expect(status!.status).toBe('recording')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/Application/RecordingService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 RecordingService**

```typescript
// src/Modules/Recording/Application/Services/RecordingService.ts

import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import {
  createSession,
  stopSession,
  updateSessionStats,
  type RecordingSession,
  type CapturedQuery,
  type ProxyConfig,
} from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'

const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_SIZE = 100

export class RecordingService {
  private currentSession: RecordingSession | null = null
  private proxy: TcpProxy | null = null
  private buffer: CapturedQuery[] = []
  private allQueries: CapturedQuery[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private _proxyPort: number | null = null

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
      throw new Error('Already recording. Stop current session first.')
    }

    const session = createSession(config)
    this.currentSession = session

    this.proxy = new TcpProxy({
      listenPort: config.listenPort,
      targetHost: config.targetHost,
      targetPort: config.targetPort,
      parser: this.parser,
      onQuery: (query) => this.handleQuery(query),
    })

    this._proxyPort = await this.proxy.start()
    await this.repo.saveSession(session)

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)

    return session
  }

  async stop(): Promise<RecordingSession> {
    if (!this.currentSession) {
      throw new Error('No active recording session.')
    }

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    const connectionCount = this.proxy?.connectionCount ?? 0

    await this.proxy?.stop()
    this.proxy = null
    this._proxyPort = null

    // Final flush
    await this.flush()
    const stopped = stopSession(
      updateSessionStats(this.currentSession, this.allQueries, connectionCount),
    )

    await this.repo.saveSession(stopped)

    this.currentSession = null
    this.allQueries = []

    return stopped
  }

  status(): RecordingSession | null {
    return this.currentSession
  }

  private handleQuery(query: CapturedQuery): void {
    this.buffer.push(query)
    this.allQueries.push(query)

    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      this.flush()
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.currentSession) return
    const toFlush = [...this.buffer]
    this.buffer = []
    await this.repo.appendQueries(this.currentSession.id, toFlush)
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/Application/RecordingService.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/RecordingService.ts test/unit/Recording/Application/RecordingService.test.ts
git commit -m "feat: [recording] RecordingService — session 生命週期管理與 buffer flush"
```

---

## Task 7: RecordingServiceProvider — DI 註冊

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Providers/RecordingServiceProvider.ts`

- [ ] **Step 1: 實作 RecordingServiceProvider**

```typescript
// src/Modules/Recording/Infrastructure/Providers/RecordingServiceProvider.ts

import { ModuleServiceProvider, type IContainer } from '@/Shared/Infrastructure/IServiceProvider'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import path from 'node:path'

export class RecordingServiceProvider extends ModuleServiceProvider {
  register(container: IContainer): void {
    container.singleton('recordingRepository', () => {
      const dir = process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
      return new RecordingRepository(dir)
    })

    container.singleton('recordingService', (c) => {
      const repo = c.make('recordingRepository') as RecordingRepository
      const parser = new MysqlProtocolParser()
      return new RecordingService(repo, parser)
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Providers/RecordingServiceProvider.ts
git commit -m "feat: [recording] RecordingServiceProvider — DI 容器註冊"
```

---

## Task 8: RecordingController + Routes — REST API

**Files:**
- Create: `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`
- Create: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`

- [ ] **Step 1: 實作 RecordingController**

```typescript
// src/Modules/Recording/Presentation/Controllers/RecordingController.ts

import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

export class RecordingController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
  ) {}

  async start(ctx: IHttpContext): Promise<Response> {
    const body = await ctx.getBody<{
      targetHost: string
      targetPort: number
      listenPort?: number
    }>()

    try {
      const session = await this.service.start({
        listenPort: body.listenPort ?? 13306,
        targetHost: body.targetHost,
        targetPort: body.targetPort,
      })
      return ctx.json(
        ApiResponse.success({
          ...session,
          proxyPort: this.service.proxyPort,
        }),
        201,
      )
    } catch (error: any) {
      return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
    }
  }

  async stop(ctx: IHttpContext): Promise<Response> {
    try {
      const session = await this.service.stop()
      return ctx.json(ApiResponse.success(session))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
    }
  }

  async status(ctx: IHttpContext): Promise<Response> {
    const session = this.service.status()
    if (!session) {
      return ctx.json(ApiResponse.success({ recording: false }))
    }
    return ctx.json(
      ApiResponse.success({
        recording: true,
        session,
        proxyPort: this.service.proxyPort,
      }),
    )
  }

  async list(ctx: IHttpContext): Promise<Response> {
    const sessions = await this.repo.listSessions()
    return ctx.json(ApiResponse.success(sessions))
  }

  async getSession(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const session = await this.repo.loadSession(id)
    if (!session) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
    }
    const queries = await this.repo.loadQueries(id)
    return ctx.json(ApiResponse.success({ session, queries }))
  }
}
```

- [ ] **Step 2: 實作 Recording.routes.ts**

```typescript
// src/Modules/Recording/Presentation/Routes/Recording.routes.ts

import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'

export function registerRecordingRoutes(router: IModuleRouter, controller: RecordingController): void {
  router.group('/api', (r) => {
    r.post('/recording/start', (ctx) => controller.start(ctx))
    r.post('/recording/stop', (ctx) => controller.stop(ctx))
    r.get('/recording/status', (ctx) => controller.status(ctx))
    r.get('/recordings', (ctx) => controller.list(ctx))
    r.get('/recordings/:id', (ctx) => controller.getSession(ctx))
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Recording/Presentation/Controllers/RecordingController.ts src/Modules/Recording/Presentation/Routes/Recording.routes.ts
git commit -m "feat: [recording] RecordingController + Routes — REST API"
```

---

## Task 9: CLI RecordCommand

**Files:**
- Create: `src/CLI/RecordCommand.ts`
- Test: `test/unit/Recording/CLI/RecordCommand.test.ts`

- [ ] **Step 1: 寫測試**

```typescript
// test/unit/Recording/CLI/RecordCommand.test.ts

import { describe, it, expect } from 'vitest'
import { parseRecordArgs } from '@/CLI/RecordCommand'

describe('parseRecordArgs', () => {
  it('parses start with --target', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.subcommand).toBe('start')
    expect(args.targetHost).toBe('localhost')
    expect(args.targetPort).toBe(3306)
  })

  it('parses start with --port', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306', '--port', '13306'])
    expect(args.listenPort).toBe(13306)
  })

  it('defaults listenPort to 13306', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.listenPort).toBe(13306)
  })

  it('parses start with --from-env', () => {
    const args = parseRecordArgs(['record', 'start', '--from-env', '/path/to/.env'])
    expect(args.subcommand).toBe('start')
    expect(args.fromEnv).toBe('/path/to/.env')
  })

  it('parses stop subcommand', () => {
    const args = parseRecordArgs(['record', 'stop'])
    expect(args.subcommand).toBe('stop')
  })

  it('parses status subcommand', () => {
    const args = parseRecordArgs(['record', 'status'])
    expect(args.subcommand).toBe('status')
  })

  it('parses list subcommand', () => {
    const args = parseRecordArgs(['record', 'list'])
    expect(args.subcommand).toBe('list')
  })

  it('parses summary with session id', () => {
    const args = parseRecordArgs(['record', 'summary', 'rec_123'])
    expect(args.subcommand).toBe('summary')
    expect(args.sessionId).toBe('rec_123')
  })

  it('throws if subcommand is missing', () => {
    expect(() => parseRecordArgs(['record'])).toThrow()
  })

  it('throws if --target format is invalid', () => {
    expect(() => parseRecordArgs(['record', 'start', '--target', 'no-port'])).toThrow()
  })

  it('throws if start has no --target and no --from-env', () => {
    expect(() => parseRecordArgs(['record', 'start'])).toThrow()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bunx vitest run test/unit/Recording/CLI/RecordCommand.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 RecordCommand**

```typescript
// src/CLI/RecordCommand.ts

import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import path from 'node:path'

export interface RecordArgs {
  readonly subcommand: 'start' | 'stop' | 'status' | 'list' | 'summary'
  readonly targetHost?: string
  readonly targetPort?: number
  readonly listenPort: number
  readonly fromEnv?: string
  readonly sessionId?: string
}

const VALID_SUBCOMMANDS = ['start', 'stop', 'status', 'list', 'summary'] as const

export function parseRecordArgs(argv: string[]): RecordArgs {
  const recordIdx = argv.indexOf('record')
  const rest = argv.slice(recordIdx + 1)

  const subcommand = rest[0] as RecordArgs['subcommand']
  if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`Missing subcommand. Available: ${VALID_SUBCOMMANDS.join(', ')}`)
  }

  const listenPort = (() => {
    const idx = rest.indexOf('--port')
    return idx !== -1 ? Number.parseInt(rest[idx + 1], 10) : 13306
  })()

  const fromEnvIdx = rest.indexOf('--from-env')
  const fromEnv = fromEnvIdx !== -1 ? rest[fromEnvIdx + 1] : undefined

  const targetIdx = rest.indexOf('--target')
  let targetHost: string | undefined
  let targetPort: number | undefined

  if (targetIdx !== -1) {
    const target = rest[targetIdx + 1]
    const parts = target.split(':')
    if (parts.length !== 2 || !parts[1]) {
      throw new Error('--target must be in format host:port (e.g., localhost:3306)')
    }
    targetHost = parts[0]
    targetPort = Number.parseInt(parts[1], 10)
  }

  if (subcommand === 'start' && !targetHost && !fromEnv) {
    throw new Error('start requires --target host:port or --from-env /path/to/.env')
  }

  const sessionId = subcommand === 'summary' ? rest[1] : undefined

  return { subcommand, targetHost, targetPort, listenPort, fromEnv, sessionId }
}

function parseEnvFile(envPath: string): { host: string; port: number } {
  const text = require('node:fs').readFileSync(envPath, 'utf-8') as string
  const lines = text.split('\n')
  const env: Record<string, string> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = value
  }

  const host = env.DB_HOST ?? 'localhost'
  const port = Number.parseInt(env.DB_PORT ?? '3306', 10)
  return { host, port }
}

export async function runRecordCommand(argv: string[]): Promise<void> {
  const args = parseRecordArgs(argv)
  const recordingsDir = process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)
  const service = new RecordingService(repo, new MysqlProtocolParser())

  switch (args.subcommand) {
    case 'start': {
      let targetHost = args.targetHost ?? 'localhost'
      let targetPort = args.targetPort ?? 3306

      if (args.fromEnv) {
        const envConfig = parseEnvFile(args.fromEnv)
        targetHost = envConfig.host
        targetPort = envConfig.port
      }

      const session = await service.start({
        listenPort: args.listenPort,
        targetHost,
        targetPort,
      })

      console.log(`
╔══════════════════════════════════════════╗
║     Recording Started                    ║
╚══════════════════════════════════════════╝

Session:  ${session.id}
Proxy:    127.0.0.1:${service.proxyPort}
Target:   ${targetHost}:${targetPort}

Point your application's DB connection to 127.0.0.1:${service.proxyPort}
Press Ctrl+C to stop recording.
`)

      // Keep process alive until SIGINT
      process.on('SIGINT', async () => {
        const stopped = await service.stop()
        console.log(`\nRecording stopped. ${stopped.stats.totalQueries} queries captured.`)
        console.log(`Session: ${stopped.id}`)
        process.exit(0)
      })

      // Block indefinitely
      await new Promise(() => {})
      break
    }

    case 'stop': {
      console.log('Use Ctrl+C in the recording terminal to stop.')
      break
    }

    case 'status': {
      const sessions = await repo.listSessions()
      const active = sessions.find((s) => s.status === 'recording')
      if (active) {
        console.log(`Recording in progress: ${active.id}`)
        console.log(`Proxy: 127.0.0.1:${active.proxy.listenPort} → ${active.proxy.targetHost}:${active.proxy.targetPort}`)
      } else {
        console.log('No active recording session.')
      }
      break
    }

    case 'list': {
      const sessions = await repo.listSessions()
      if (sessions.length === 0) {
        console.log('No recording sessions found.')
        return
      }
      for (const s of sessions) {
        const date = new Date(s.startedAt).toISOString()
        console.log(`${s.id}  ${s.status.padEnd(10)}  ${date}  ${s.stats.totalQueries} queries`)
      }
      break
    }

    case 'summary': {
      if (!args.sessionId) {
        console.error('Usage: archivolt record summary <session-id>')
        process.exit(1)
      }
      const session = await repo.loadSession(args.sessionId)
      if (!session) {
        console.error(`Session not found: ${args.sessionId}`)
        process.exit(1)
      }
      console.log(`Session:    ${session.id}`)
      console.log(`Status:     ${session.status}`)
      console.log(`Started:    ${new Date(session.startedAt).toISOString()}`)
      if (session.endedAt) {
        console.log(`Ended:      ${new Date(session.endedAt).toISOString()}`)
        console.log(`Duration:   ${((session.endedAt - session.startedAt) / 1000).toFixed(1)}s`)
      }
      console.log(`Queries:    ${session.stats.totalQueries}`)
      console.log(`Operations: ${JSON.stringify(session.stats.byOperation)}`)
      console.log(`Tables:     ${session.stats.tablesAccessed.join(', ') || '(none)'}`)
      console.log(`Connections: ${session.stats.connectionCount}`)
      break
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bunx vitest run test/unit/Recording/CLI/RecordCommand.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/CLI/RecordCommand.ts test/unit/Recording/CLI/RecordCommand.test.ts
git commit -m "feat: [recording] RecordCommand — CLI record 子指令"
```

---

## Task 10: Wiring + Bootstrap 整合

**Files:**
- Create: `src/wiring/recording.ts`
- Modify: `src/wiring/index.ts`
- Modify: `src/bootstrap.ts`
- Modify: `src/routes.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 建立 recording wiring**

```typescript
// src/wiring/recording.ts

import type { PlanetCore } from '@gravito/core'
import { createGravitoModuleRouter } from '@/Shared/Infrastructure/Framework/GravitoModuleRouter'
import { RecordingController } from '@/Modules/Recording/Presentation/Controllers/RecordingController'
import { registerRecordingRoutes } from '@/Modules/Recording/Presentation/Routes/Recording.routes'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

export const registerRecording = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const service = core.container.make('recordingService') as RecordingService
  const repo = core.container.make('recordingRepository') as RecordingRepository
  const controller = new RecordingController(service, repo)
  registerRecordingRoutes(router, controller)
}
```

- [ ] **Step 2: 修改 src/wiring/index.ts — 匯出 registerRecording**

在檔案末尾加入：

```typescript
export { registerRecording } from './recording'
```

- [ ] **Step 3: 修改 src/bootstrap.ts — 註冊 RecordingServiceProvider**

在 `SchemaServiceProvider` import 下方加入：

```typescript
import { RecordingServiceProvider } from '@/Modules/Recording/Infrastructure/Providers/RecordingServiceProvider'
```

在 `core.register(createGravitoServiceProvider(new SchemaServiceProvider()))` 下方加入：

```typescript
core.register(createGravitoServiceProvider(new RecordingServiceProvider()))
```

- [ ] **Step 4: 修改 src/routes.ts — 註冊 Recording routes**

在 `import { registerSchema } from './wiring'` 改為：

```typescript
import { registerSchema, registerRecording } from './wiring'
```

在 `registerSchema(core)` 下方加入：

```typescript
registerRecording(core)
```

- [ ] **Step 5: 修改 src/index.ts — 加入 record CLI 路由**

在 `if (args[0] === 'export')` 區塊之後加入：

```typescript
if (args[0] === 'record') {
  const { runRecordCommand } = await import('@/CLI/RecordCommand')
  await runRecordCommand(['record', ...args.slice(1)])
  process.exit(0)
}
```

- [ ] **Step 6: 驗證 typecheck 通過**

Run: `bun run typecheck`
Expected: 無錯誤

- [ ] **Step 7: 執行所有測試確認通過**

Run: `bun run test`
Expected: 全部 PASS

- [ ] **Step 8: Commit**

```bash
git add src/wiring/recording.ts src/wiring/index.ts src/bootstrap.ts src/routes.ts src/index.ts
git commit -m "feat: [recording] 整合 Recording 模組 — DI、路由、CLI 入口"
```

---

## Task 11: Integration 驗證 — 手動端對端測試指引

此 task 不是自動化測試，而是提供手動驗證步驟，確保完整流程正常運作。

- [ ] **Step 1: 確認有可連線的 MySQL 實例**

確保本地或遠端有一個可連線的 MySQL。記下 host 和 port。

- [ ] **Step 2: 啟動側錄**

```bash
bun run dev record start --target <mysql-host>:<mysql-port>
```

Expected: 顯示 Proxy 啟動訊息，含 proxy port。

- [ ] **Step 3: 透過 Proxy 連線 MySQL**

```bash
mysql -h 127.0.0.1 -P 13306 -u <user> -p
```

在 MySQL client 中執行幾條 SQL：

```sql
SHOW DATABASES;
USE some_database;
SELECT * FROM some_table LIMIT 5;
INSERT INTO some_table (col) VALUES ('test');
```

- [ ] **Step 4: 停止側錄（Ctrl+C）**

Expected: 顯示捕捉的 query 數量和 session id。

- [ ] **Step 5: 查看側錄結果**

```bash
bun run dev record summary <session-id>
```

Expected: 顯示 query 統計（SELECT/INSERT 數量、涉及的 tables）。

- [ ] **Step 6: 檢查 JSONL 檔案**

```bash
cat data/recordings/<session-id>/queries.jsonl | head -5
```

Expected: 每行一筆 JSON，包含 sql、operation、tables、duration 等欄位。
