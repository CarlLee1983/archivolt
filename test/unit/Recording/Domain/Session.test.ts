import { describe, it, expect } from 'vitest'
import {
  createSession,
  stopSession,
  updateSessionStats,
  createCapturedQuery,
  applyIncrementalStats,
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

describe('applyIncrementalStats', () => {
  it('writes incremental stats into session', () => {
    const session = createSession(proxyConfig)
    const stats = {
      totalQueries: 5,
      byOperation: { SELECT: 3, INSERT: 2 },
      tablesAccessed: new Set(['users', 'orders']),
    }

    const updated = applyIncrementalStats(session, stats, 2)

    expect(updated.stats.totalQueries).toBe(5)
    expect(updated.stats.byOperation).toEqual({ SELECT: 3, INSERT: 2 })
    expect(updated.stats.tablesAccessed).toEqual(['orders', 'users'])
    expect(updated.stats.connectionCount).toBe(2)
  })

  it('does not mutate original session (immutable)', () => {
    const session = createSession(proxyConfig)
    const stats = {
      totalQueries: 1,
      byOperation: { SELECT: 1 },
      tablesAccessed: new Set(['users']),
    }
    applyIncrementalStats(session, stats, 1)
    expect(session.stats.totalQueries).toBe(0)
  })
})
