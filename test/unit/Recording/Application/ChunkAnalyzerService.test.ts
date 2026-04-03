// test/unit/Recording/Application/ChunkAnalyzerService.test.ts

import { describe, it, expect } from 'vitest'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { RecordingSession } from '@/Modules/Recording/Domain/Session'

function makeQuery(overrides: {
  timestamp: number
  sql: string
  tables: string[]
  operation: CapturedQuery['operation']
}): CapturedQuery {
  return {
    id: `q_${overrides.timestamp}`,
    sessionId: 'rec_1',
    connectionId: 1,
    duration: 5,
    ...overrides,
  }
}

function makeMarker(overrides: {
  timestamp: number
  url: string
  action: OperationMarker['action']
  target?: string
  label?: string
  request?: OperationMarker['request']
}): OperationMarker {
  return {
    id: `mk_${overrides.timestamp}`,
    sessionId: 'rec_1',
    ...overrides,
  }
}

const mockSession: RecordingSession = {
  id: 'rec_1',
  startedAt: 1000,
  endedAt: 2000,
  status: 'stopped',
  proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
  stats: { totalQueries: 0, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
}

describe('ChunkAnalyzerService', () => {
  const service = new ChunkAnalyzerService()

  it('produces a manifest with correct stats', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'INSERT INTO orders (user_id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/checkout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.sessionId).toBe('rec_1')
    expect(manifest.stats.totalChunks).toBe(2)
    expect(manifest.stats.readOps).toBe(1)
    expect(manifest.stats.writeOps).toBe(1)
  })

  it('builds correct labels from markers', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate', label: '商品列表' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.operations[0].label).toBe('navigate /products — "商品列表"')
  })

  it('preserves chunks with only markers and no queries', () => {
    const queries: CapturedQuery[] = []
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate', label: '商品列表' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)

    expect(manifest.stats.totalChunks).toBe(1)
    expect(manifest.operations[0].label).toBe('navigate /products — "商品列表"')
    expect(manifest.operations[0].semantic).toBe('(no database operations)')
    expect(manifest.operations[0].pattern).toBe('marker')
  })

  it('does not count marker-only chunks in readOps/writeOps/mixedOps', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/logout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.stats.totalChunks).toBe(2)
    expect(manifest.stats.readOps).toBe(1)
    expect(manifest.stats.writeOps).toBe(0)
    expect(manifest.stats.mixedOps).toBe(0)
  })

  it('counts silence-based splits', () => {
    const queries = [
      makeQuery({ timestamp: 1000, sql: 'SELECT 1', tables: ['a'], operation: 'SELECT' }),
      makeQuery({ timestamp: 5000, sql: 'SELECT 2', tables: ['b'], operation: 'SELECT' }),
    ]
    const manifest = service.analyze(mockSession, queries, [])
    expect(manifest.stats.silenceSplit).toBe(2)
    expect(manifest.operations[0].label).toBe('(silence-based split)')
  })

  it('produces table matrix with correct counts', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 1020, sql: 'SELECT * FROM products', tables: ['products'], operation: 'SELECT' }),
      makeQuery({ timestamp: 2010, sql: 'INSERT INTO orders (id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/products', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/checkout', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    const productsEntry = manifest.tableMatrix.find((t) => t.table === 'products')
    expect(productsEntry?.readCount).toBe(1)
    expect(productsEntry?.operationIndices).toEqual([0])
    const ordersEntry = manifest.tableMatrix.find((t) => t.table === 'orders')
    expect(ordersEntry?.writeCount).toBe(1)
    expect(ordersEntry?.operationIndices).toEqual([1])
  })

  it('includes requestBody from marker when present', () => {
    const queries = [
      makeQuery({ timestamp: 1010, sql: 'INSERT INTO orders (id) VALUES (1)', tables: ['orders'], operation: 'INSERT' }),
    ]
    const markers = [
      makeMarker({
        timestamp: 1000, url: '/checkout', action: 'request', target: 'POST /api/orders',
        request: { method: 'POST', url: '/api/orders', body: '{"productId":5}' },
      }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    expect(manifest.operations[0].requestBody).toBe('{"productId":5}')
  })

  it('merges inferred relations across chunks', () => {
    const queries = [
      makeQuery({
        timestamp: 1010,
        sql: 'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        tables: ['products', 'categories'],
        operation: 'SELECT',
      }),
      makeQuery({
        timestamp: 2010,
        sql: 'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        tables: ['products', 'categories'],
        operation: 'SELECT',
      }),
    ]
    const markers = [
      makeMarker({ timestamp: 1000, url: '/a', action: 'navigate' }),
      makeMarker({ timestamp: 2000, url: '/b', action: 'navigate' }),
    ]
    const manifest = service.analyze(mockSession, queries, markers)
    const highRels = manifest.inferredRelations.filter((r) => r.confidence === 'high')
    expect(highRels).toHaveLength(1)
  })
})
