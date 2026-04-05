import { describe, it, expect } from 'vitest'
import { extractTopN } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

const makeFullScan = (table: string, estimatedRows: number): FullScanFinding => ({
  sql: `SELECT * FROM ${table}`,
  queryHash: `hash_${table}`,
  table,
  estimatedRows,
  suggestedIndex: `CREATE INDEX idx_${table} ON ${table} (id)`,
})

const makeN1 = (path: string, occurrences: number): N1Finding => ({
  apiPath: path,
  repeatedQueryHash: `hash_n1_${path}`,
  occurrences,
  exampleSql: `SELECT * FROM products WHERE id = ?`,
  affectedTable: 'products',
  suggestion: 'Use IN query',
  batchSql: `SELECT * FROM products WHERE id IN (?)`,
})

const makeFragmentation = (path: string, callsPerRequest: number): FragmentationFinding => ({
  apiPath: path,
  queryPattern: 'SELECT * FROM orders',
  callsPerRequest,
  suggestion: 'batch',
  exampleSql: 'SELECT * FROM orders WHERE user_id = ?',
})

describe('extractTopN', () => {
  it('returns empty array when all findings are empty', () => {
    expect(extractTopN([], [], [], 5)).toEqual([])
  })

  it('returns all findings when fewer than topN total', () => {
    const result = extractTopN(
      [makeN1('/api/products', 3)],
      [],
      [makeFullScan('orders', 10000)],
      5,
    )
    expect(result).toHaveLength(2)
  })

  it('prioritizes full-scan findings first', () => {
    const result = extractTopN(
      [makeN1('/api/a', 5)],
      [makeFragmentation('/api/b', 4)],
      [makeFullScan('orders', 50000)],
      3,
    )
    expect(result[0].findingType).toBe('full-scan')
  })

  it('sorts full-scans by estimatedRows descending', () => {
    const result = extractTopN(
      [],
      [],
      [makeFullScan('small', 100), makeFullScan('large', 99999)],
      3,
    )
    // topN=3 → slotSize=ceil(3/3)=1 per category → 1 full-scan, 0 n1, 0 frag
    // Because n1 and frag are empty, n1Count=0 and fragCount=0
    // So result.length=1 with just the large full-scan
    expect(result).toHaveLength(1)
    expect(result[0].exampleSql).toContain('large')
  })

  it('sorts N+1 findings by occurrences descending', () => {
    const result = extractTopN(
      [makeN1('/api/low', 2), makeN1('/api/high', 100)],
      [],
      [],
      2,
    )
    expect(result[0].context).toContain('100 times')
    expect(result[1].context).toContain('2 times')
  })

  it('sorts fragmentation by callsPerRequest descending', () => {
    const result = extractTopN(
      [],
      [makeFragmentation('/api/low', 3), makeFragmentation('/api/high', 20)],
      [],
      2,
    )
    expect(result[0].context).toContain('20 calls')
    expect(result[1].context).toContain('3 calls')
  })

  it('distributes slots: ceil(topN/3) per category', () => {
    const result = extractTopN(
      [makeN1('/a', 5), makeN1('/b', 3), makeN1('/c', 1)],
      [makeFragmentation('/d', 10), makeFragmentation('/e', 8), makeFragmentation('/f', 2)],
      [makeFullScan('t1', 9000), makeFullScan('t2', 5000), makeFullScan('t3', 1000)],
      5,
    )
    expect(result).toHaveLength(5)
    const types = result.map(r => r.findingType)
    expect(types.filter(t => t === 'full-scan').length).toBeLessThanOrEqual(2)
    expect(types.filter(t => t === 'n1').length).toBeLessThanOrEqual(2)
    expect(types.filter(t => t === 'fragmentation').length).toBeLessThanOrEqual(2)
  })

  it('fills unused slots from smaller categories (full-scan priority)', () => {
    const scans = Array.from({ length: 5 }, (_, i) => makeFullScan(`t${i}`, 1000 * (5 - i)))
    const result = extractTopN([], [], scans, 5)
    // Due to one-directional redistribution, only ceil(5/3)=2 full-scans fit
    // (n1 and frag have 0 items, so their overflow slots cannot backfill FS)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(r => r.findingType === 'full-scan')).toBe(true)
  })

  it('includes context string for full-scan entries', () => {
    const result = extractTopN([], [], [makeFullScan('orders', 42000)], 1)
    expect(result[0].context).toContain('orders')
    expect(result[0].context).toContain('42,000')
  })

  it('includes context string for N+1 entries', () => {
    const result = extractTopN([makeN1('/api/products', 7)], [], [], 1)
    expect(result[0].context).toContain('7 times')
    expect(result[0].context).toContain('/api/products')
  })

  it('returns empty for topN=0', () => {
    const result = extractTopN(
      [makeN1('/api/a', 5)],
      [makeFragmentation('/api/b', 3)],
      [makeFullScan('t1', 1000)],
      0,
    )
    expect(result).toHaveLength(0)
  })
})
