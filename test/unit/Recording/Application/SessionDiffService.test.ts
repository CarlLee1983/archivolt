import { describe, it, expect } from 'vitest'
import { diffManifests } from '@/Modules/Recording/Application/Services/SessionDiffService'
import type { OperationManifest } from '@/Modules/Recording/Domain/OperationManifest'

const manifestA: OperationManifest = {
  sessionId: 'session-a',
  recordedAt: { start: 1000, end: 2000 },
  operations: [],
  tableMatrix: [
    { table: 'orders', readCount: 10, writeCount: 3, operationIndices: [] },
    { table: 'users', readCount: 5, writeCount: 0, operationIndices: [] },
  ],
  inferredRelations: [
    {
      sourceTable: 'orders',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'naming convention',
    },
  ],
  stats: { totalChunks: 5, readOps: 3, writeOps: 1, mixedOps: 1, silenceSplit: 0 },
}

const manifestB: OperationManifest = {
  sessionId: 'session-b',
  recordedAt: { start: 3000, end: 4000 },
  operations: [],
  tableMatrix: [
    { table: 'orders', readCount: 8, writeCount: 3, operationIndices: [] },
    { table: 'payments', readCount: 5, writeCount: 2, operationIndices: [] },
  ],
  inferredRelations: [
    {
      sourceTable: 'orders',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'naming convention',
    },
    {
      sourceTable: 'payments',
      sourceColumn: 'order_id',
      targetTable: 'orders',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'naming convention',
    },
  ],
  stats: { totalChunks: 4, readOps: 2, writeOps: 1, mixedOps: 1, silenceSplit: 0 },
}

describe('diffManifests', () => {
  it('identifies added tables (payments) and removed tables (users)', () => {
    const diff = diffManifests(manifestA, manifestB)

    expect(diff.tables.added).toHaveLength(1)
    expect(diff.tables.added[0].table).toBe('payments')

    expect(diff.tables.removed).toHaveLength(1)
    expect(diff.tables.removed[0].table).toBe('users')
  })

  it('identifies changed tables (orders: readDelta=-2, writeDelta=0)', () => {
    const diff = diffManifests(manifestA, manifestB)

    expect(diff.tables.changed).toHaveLength(1)
    const ordersDiff = diff.tables.changed[0]
    expect(ordersDiff.table).toBe('orders')
    expect(ordersDiff.readDelta).toBe(-2)
    expect(ordersDiff.writeDelta).toBe(0)
    expect(ordersDiff.readA).toBe(10)
    expect(ordersDiff.writeA).toBe(3)
    expect(ordersDiff.readB).toBe(8)
    expect(ordersDiff.writeB).toBe(3)
  })

  it('reports stats delta (chunksDelta=-1)', () => {
    const diff = diffManifests(manifestA, manifestB)

    expect(diff.stats.chunksA).toBe(5)
    expect(diff.stats.chunksB).toBe(4)
    expect(diff.stats.chunksDelta).toBe(-1)

    // queriesA = readOps + writeOps + mixedOps = 3+1+1 = 5
    expect(diff.stats.queriesA).toBe(5)
    // queriesB = 2+1+1 = 4
    expect(diff.stats.queriesB).toBe(4)
    expect(diff.stats.queriesDelta).toBe(-1)

    expect(diff.stats.tablesA).toBe(2)
    expect(diff.stats.tablesB).toBe(2)
    expect(diff.stats.tablesDelta).toBe(0)
  })

  it('identifies added relations (payments.order_id→orders.id) and removed=0', () => {
    const diff = diffManifests(manifestA, manifestB)

    expect(diff.relations.removed).toHaveLength(0)
    expect(diff.relations.added).toHaveLength(1)
    expect(diff.relations.added[0].sourceTable).toBe('payments')
    expect(diff.relations.added[0].sourceColumn).toBe('order_id')
    expect(diff.relations.added[0].targetTable).toBe('orders')
    expect(diff.relations.added[0].targetColumn).toBe('id')
  })

  it('sets sessionA and sessionB correctly', () => {
    const diff = diffManifests(manifestA, manifestB)

    expect(diff.sessionA).toBe('session-a')
    expect(diff.sessionB).toBe('session-b')
  })
})
