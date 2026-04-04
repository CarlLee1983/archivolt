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
    const sql = "SELECT * FROM orders WHERE user_id = ?"
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
    const sql = "SELECT * FROM tags WHERE post_id = ?"
    const q = makeQuery('q3', sql, ['tags'])
    const hash = computeQueryHash(sql)
    const ref = { queryHash: hash, offsetMs: 0, tableTouched: ['tags'], isN1Candidate: true }
    const flow1 = makeFlow('/posts/:id', [ref, ref])
    const flow2 = { ...makeFlow('/posts/:id', [ref, ref, ref]), requestId: 'req2' }

    const findings = detectN1Queries([flow1, flow2], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].occurrences).toBe(3)
  })
})
