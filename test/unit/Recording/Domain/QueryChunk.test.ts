import { describe, it, expect } from 'vitest'
import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

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
    const queries = [makeQuery({ timestamp: 1010 })]
    const markers = [makeMarker(1000, '/login')]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].marker?.url).toBe('/login')
    expect(chunks[0].queries).toHaveLength(1)
  })

  it('handles marker with no following queries', () => {
    const queries = [makeQuery({ timestamp: 1000 })]
    const markers = [makeMarker(2000, '/logout')]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].queries).toHaveLength(1)
    expect(chunks[1].marker?.url).toBe('/logout')
    expect(chunks[1].queries).toHaveLength(0)
  })

  it('assigns pattern marker for marker-only chunks with no queries', () => {
    const markers = [makeMarker(1000, '/login'), makeMarker(2000, '/dashboard')]
    const chunks = buildChunks([], markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].pattern).toBe('marker')
    expect(chunks[0].queries).toHaveLength(0)
    expect(chunks[1].pattern).toBe('marker')
    expect(chunks[1].queries).toHaveLength(0)
  })

  it('handles consecutive markers', () => {
    const queries = [
      makeQuery({ timestamp: 1010 }),
      makeQuery({ timestamp: 1020 }),
      makeQuery({ timestamp: 1110 }),
    ]
    const markers = [
      makeMarker(1000, '/page-a'),
      makeMarker(1050, '/no-query-page'),
      makeMarker(1100, '/page-b'),
    ]
    const chunks = buildChunks(queries, markers, DEFAULT_CONFIG)
    expect(chunks).toHaveLength(3)
    expect(chunks[0].marker?.url).toBe('/page-a')
    expect(chunks[0].queries).toHaveLength(2)
    expect(chunks[1].marker?.url).toBe('/no-query-page')
    expect(chunks[1].queries).toHaveLength(0)
    expect(chunks[2].marker?.url).toBe('/page-b')
    expect(chunks[2].queries).toHaveLength(1)
  })
})
