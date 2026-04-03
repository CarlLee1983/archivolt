import { describe, it, expect } from 'vitest'
import { groupIntoFlows } from '@/Modules/Recording/Application/Strategies/FlowGrouper'
import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'
import type { OperationEntry } from '@/Modules/Recording/Domain/OperationManifest'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

function makeMarker(
  timestamp: number,
  url: string,
  action: OperationMarker['action'] = 'navigate',
): OperationMarker {
  return { id: `mk_${timestamp}`, sessionId: 'rec_1', timestamp, url, action }
}

function makeChunk(overrides: {
  timestamp: number
  tables?: string[]
  pattern?: QueryChunk['pattern']
  marker?: OperationMarker
}): QueryChunk {
  return {
    id: `chunk_${overrides.timestamp}`,
    sessionId: 'rec_1',
    startTime: overrides.timestamp,
    endTime: overrides.timestamp + 10,
    queries: [],
    tables: overrides.tables ?? [],
    operations: [],
    pattern: overrides.pattern ?? 'read',
    marker: overrides.marker,
  }
}

function makeOp(index: number, tables: readonly string[] = []): OperationEntry {
  return {
    chunkId: `chunk_${index}`,
    index,
    label: `op_${index}`,
    pattern: 'read',
    tables,
    sqlSummaries: [],
    inferredRelations: [],
    semantic: '',
  }
}

describe('groupIntoFlows', () => {
  it('returns empty flows and bootstrap when no navigate markers', () => {
    const chunks = [makeChunk({ timestamp: 1000, tables: ['sessions'] })]
    const ops = [makeOp(0, ['sessions'])]
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows).toEqual([])
    expect(result.bootstrap.queryCount).toBe(0)
    expect(result.bootstrap.tablesAccessed).toEqual(['sessions'])
  })

  it('captures pre-navigate chunks in bootstrap, not in flows', () => {
    const chunks = [
      makeChunk({ timestamp: 500, tables: ['migrations'] }),
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/home'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.bootstrap.tablesAccessed).toEqual(['migrations'])
    expect(result.flows).toHaveLength(1)
    expect(result.flows[0].url).toBe('/home')
    expect(result.flows[0].chunkIndices).toEqual([1, 2])
  })

  it('groups chunks between consecutive navigate markers into separate flows', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/login'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'write' }),
      makeChunk({ timestamp: 2000, marker: makeMarker(2000, '/dashboard'), pattern: 'marker' }),
      makeChunk({ timestamp: 2010, tables: ['orders'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows).toHaveLength(2)
    expect(result.flows[0].url).toBe('/login')
    expect(result.flows[0].tables).toEqual(['users'])
    expect(result.flows[1].url).toBe('/dashboard')
    expect(result.flows[1].tables).toEqual(['orders'])
  })

  it('excludes noise tables from semanticTables but keeps them in tables', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/products'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users', 'products'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, ['users'])
    expect(result.flows[0].tables).toEqual(['products', 'users'])
    expect(result.flows[0].semanticTables).toEqual(['products'])
  })

  it('computes chunkPatternSequence excluding marker-only chunks', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/checkout'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['orders'], pattern: 'read' }),
      makeChunk({ timestamp: 1020, tables: ['orders', 'items'], pattern: 'write' }),
      makeChunk({ timestamp: 1030, tables: ['orders'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkPatternSequence).toBe('read → write → read')
  })

  it('returns "(no queries)" as sequence for navigate-only flow', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/logout'), pattern: 'marker' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkPatternSequence).toBe('(no queries)')
  })

  it('computes dominantPattern as mixed when both read and write present', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/cart'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, pattern: 'read' }),
      makeChunk({ timestamp: 1020, pattern: 'write' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].dominantPattern).toBe('mixed')
  })

  it('computes dominantPattern as write when all non-marker chunks are write', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/delete'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, pattern: 'write' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].dominantPattern).toBe('write')
  })

  it('stores correct chunkIndices referencing full original array positions', () => {
    const chunks = [
      makeChunk({ timestamp: 500, tables: ['boot'] }),
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/home'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['users'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].chunkIndices).toEqual([1, 2])
  })

  it('filters inferredRelations to exclude noise table relations', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/orders'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['orders', 'users'], pattern: 'read' }),
    ]
    const ops: OperationEntry[] = [
      makeOp(0, []),
      {
        ...makeOp(1, ['orders', 'users']),
        inferredRelations: [
          {
            sourceTable: 'orders',
            sourceColumn: 'user_id',
            targetTable: 'users',
            targetColumn: 'id',
            confidence: 'high',
            evidence: 'JOIN ON in chunk_1010',
          },
          {
            sourceTable: 'orders',
            sourceColumn: 'product_id',
            targetTable: 'products',
            targetColumn: 'id',
            confidence: 'low',
            evidence: 'co-occurring in chunk_1010',
          },
        ],
      },
    ]
    const result = groupIntoFlows(chunks, ops, ['users'])
    // orders → users 被過濾（users 是噪音）
    // orders → products 保留
    expect(result.flows[0].inferredRelations).toHaveLength(1)
    expect(result.flows[0].inferredRelations[0].targetTable).toBe('products')
  })

  it('sets correct startTime and endTime on flow', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/page'), pattern: 'marker' }),
      makeChunk({ timestamp: 1050, pattern: 'read' }),
    ]
    // endTime = timestamp + 10 per makeChunk
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows[0].startTime).toBe(1000)
    expect(result.flows[0].endTime).toBe(1060)
  })

  it('finalizes the last flow when no subsequent navigate marker exists', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/first'), pattern: 'marker' }),
      makeChunk({ timestamp: 1010, tables: ['orders'], pattern: 'read' }),
      makeChunk({ timestamp: 2000, marker: makeMarker(2000, '/second'), pattern: 'marker' }),
      makeChunk({ timestamp: 2010, tables: ['products'], pattern: 'write' }),
      makeChunk({ timestamp: 2020, tables: ['products'], pattern: 'read' }),
    ]
    const ops = chunks.map((c, i) => makeOp(i, c.tables))
    const result = groupIntoFlows(chunks, ops, [])
    expect(result.flows).toHaveLength(2)
    expect(result.flows[1].tables).toEqual(['products'])
    expect(result.flows[1].chunkPatternSequence).toBe('write → read')
  })

  it('throws when chunks and operations arrays have different lengths', () => {
    const chunks = [
      makeChunk({ timestamp: 1000, marker: makeMarker(1000, '/page'), pattern: 'marker' }),
    ]
    const ops: OperationEntry[] = []  // 長度不符
    expect(() => groupIntoFlows(chunks, ops, [])).toThrow(
      'groupIntoFlows: chunks.length (1) !== operations.length (0)'
    )
  })
})
