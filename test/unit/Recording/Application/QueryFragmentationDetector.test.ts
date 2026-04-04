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
    const sql = "SELECT * FROM tags WHERE post_id = ?"
    const q = makeQuery('q1', sql, ['tags'])
    const hash = computeQueryHash(sql)
    const flow = makeFlow('/posts', [
      { queryHash: hash, offsetMs: 10, tableTouched: ['tags'], isN1Candidate: true },
      { queryHash: hash, offsetMs: 20, tableTouched: ['tags'], isN1Candidate: true },
    ])
    expect(detectQueryFragmentation([flow], [q])).toHaveLength(0)
  })

  it('detects fragmentation when same query appears 3+ times in one flow', () => {
    const sql = "SELECT * FROM permissions WHERE user_id = ?"
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
    const sql = "SELECT * FROM settings WHERE org_id = ?"
    const q = makeQuery('q3', sql, ['settings'])
    const hash = computeQueryHash(sql)
    const ref = { queryHash: hash, offsetMs: 0, tableTouched: ['settings'], isN1Candidate: true }
    const flow1 = makeFlow('/orgs/:id', [ref, ref, ref])       // 3 per request
    const flow2 = { ...makeFlow('/orgs/:id', [ref, ref, ref, ref, ref]), requestId: 'req2' } // 5 per request

    const findings = detectQueryFragmentation([flow1, flow2], [q])
    expect(findings).toHaveLength(1)
    expect(findings[0].callsPerRequest).toBe(4) // (3+5)/2
  })
})
