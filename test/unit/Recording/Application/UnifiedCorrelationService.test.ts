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
