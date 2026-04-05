import { describe, it, expect, vi } from 'vitest'
import {
  runExplainAnalysis,
  detectFullScans,
} from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import type { ExplainAnalyzerAdapter, ExplainRow } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

const makeQuery = (id: string, sql: string): CapturedQuery => ({
  id,
  sessionId: 'sess_1',
  connectionId: 1,
  timestamp: 1000,
  duration: 100,
  sql,
  operation: 'SELECT',
  tables: ['orders'],
})

const makeAdapter = (rows: ExplainRow[]): ExplainAnalyzerAdapter => ({
  dialect: 'mysql',
  explain: vi.fn(async () => rows),
  close: vi.fn(async () => {}),
})

describe('runExplainAnalysis', () => {
  it('returns empty array for empty queries', async () => {
    const adapter = makeAdapter([])
    const result = await runExplainAnalysis([], adapter, 1000)
    expect(result).toHaveLength(0)
  })

  it('deduplicates queries with the same hash', async () => {
    const sql = 'SELECT * FROM orders WHERE user_id = 1'
    const q1 = makeQuery('q1', sql)
    const q2 = makeQuery('q2', sql)
    const adapter = makeAdapter([{ type: 'ALL', table: 'orders', rows: 50000, possibleKeys: null, key: null, extra: null }])

    await runExplainAnalysis([q1, q2], adapter, 100)
    expect(adapter.explain).toHaveBeenCalledTimes(1)
  })

  it('skips non-SELECT queries', async () => {
    const q = { ...makeQuery('q1', 'INSERT INTO orders VALUES (1)'), operation: 'INSERT' as const }
    const adapter = makeAdapter([])
    await runExplainAnalysis([q], adapter, 100)
    expect(adapter.explain).not.toHaveBeenCalled()
  })
})

describe('detectFullScans', () => {
  it('returns empty when no full scans', () => {
    const rows: ExplainRow[] = [
      { type: 'ref', table: 'orders', rows: 100, possibleKeys: 'idx', key: 'idx', extra: null },
    ]
    expect(detectFullScans('SELECT * FROM orders WHERE id = 1', 'hash1', rows, 1000)).toHaveLength(0)
  })

  it('detects type=ALL with rows above minRows', () => {
    const rows: ExplainRow[] = [
      { type: 'ALL', table: 'orders', rows: 50000, possibleKeys: null, key: null, extra: null },
    ]
    const findings = detectFullScans('SELECT * FROM orders WHERE user_id = 1', 'hash1', rows, 1000)
    expect(findings).toHaveLength(1)
    expect(findings[0].table).toBe('orders')
    expect(findings[0].estimatedRows).toBe(50000)
    expect(findings[0].suggestedIndex).toContain('CREATE INDEX')
    expect(findings[0].suggestedIndex).toContain('user_id')
  })

  it('ignores type=ALL when rows below minRows', () => {
    const rows: ExplainRow[] = [
      { type: 'ALL', table: 'orders', rows: 100, possibleKeys: null, key: null, extra: null },
    ]
    expect(detectFullScans('SELECT * FROM orders WHERE id = 1', 'hash1', rows, 1000)).toHaveLength(0)
  })
})
