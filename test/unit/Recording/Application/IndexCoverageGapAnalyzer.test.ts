import { describe, it, expect } from 'vitest'
import { analyzeIndexCoverageGaps } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

const schemaWithIndexOnUserId: ParsedSchema = {
  tables: [{
    name: 'orders',
    columns: ['id', 'user_id', 'status'],
    primaryKey: ['id'],
    indexes: [{ name: 'orders_user_id_index', columns: ['user_id'], unique: false }],
  }],
}

const schemaNoIndexes: ParsedSchema = {
  tables: [{
    name: 'orders',
    columns: ['id', 'user_id', 'status'],
    primaryKey: ['id'],
    indexes: [],
  }],
}

const n1Finding: N1Finding = {
  apiPath: '/users/:id',
  repeatedQueryHash: 'abc',
  occurrences: 5,
  exampleSql: 'SELECT * FROM orders WHERE user_id = 42',
  affectedTable: 'orders',
  suggestion: 'use batch query',
  batchSql: 'SELECT * FROM orders WHERE user_id IN (?, ?)',
}

describe('analyzeIndexCoverageGaps', () => {
  it('returns empty when schema covers all WHERE columns', () => {
    const gaps = analyzeIndexCoverageGaps([n1Finding], [], schemaWithIndexOnUserId)
    expect(gaps).toHaveLength(0)
  })

  it('detects gap when WHERE column has no index', () => {
    const gaps = analyzeIndexCoverageGaps([n1Finding], [], schemaNoIndexes)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0].table).toBe('orders')
    expect(gaps[0].column).toBe('user_id')
    expect(gaps[0].suggestedIndex).toContain('CREATE INDEX')
    expect(gaps[0].suggestedIndex).toContain('orders')
    expect(gaps[0].suggestedIndex).toContain('user_id')
    expect(gaps[0].source).toBe('ddl')
  })

  it('also detects gaps from fragmentation findings', () => {
    const fragFinding: FragmentationFinding = {
      apiPath: '/dashboard',
      queryPattern: 'select * from orders where status = ?',
      callsPerRequest: 4,
      suggestion: 'cache',
      exampleSql: 'SELECT * FROM orders WHERE status = "active"',
    }
    const gaps = analyzeIndexCoverageGaps([], [fragFinding], schemaNoIndexes)
    expect(gaps.some((g) => g.column === 'status')).toBe(true)
  })

  it('does not duplicate gaps for same table.column', () => {
    const fragFinding: FragmentationFinding = {
      apiPath: '/dashboard',
      queryPattern: 'select * from orders where user_id = ?',
      callsPerRequest: 4,
      suggestion: 'dataloader',
      exampleSql: 'SELECT * FROM orders WHERE user_id = 1',
    }
    const gaps = analyzeIndexCoverageGaps([n1Finding], [fragFinding], schemaNoIndexes)
    const userIdGaps = gaps.filter((g) => g.column === 'user_id')
    expect(userIdGaps).toHaveLength(1) // deduplicated
  })
})
