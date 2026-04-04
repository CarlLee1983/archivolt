import { describe, it, expect } from 'vitest'
import { mergeIndexSuggestions } from '@/Modules/Recording/Application/Services/IndexSuggestionService'
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

describe('mergeIndexSuggestions', () => {
  it('returns only ddl findings when no explain findings', () => {
    const ddl: IndexGapFinding[] = [{
      table: 'orders',
      column: 'user_id',
      sourceQueryHash: 'abc',
      exampleSql: 'SELECT * FROM orders WHERE user_id = 1',
      confidence: 'high',
      source: 'ddl',
      suggestedIndex: 'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const merged = mergeIndexSuggestions(ddl, [])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('ddl')
  })

  it('marks source as "both" when ddl and explain agree on same table+column', () => {
    const ddl: IndexGapFinding[] = [{
      table: 'orders',
      column: 'user_id',
      sourceQueryHash: 'abc',
      exampleSql: 'SELECT * FROM orders WHERE user_id = 1',
      confidence: 'high',
      source: 'ddl',
      suggestedIndex: 'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const explain: FullScanFinding[] = [{
      sql: 'SELECT * FROM orders WHERE user_id = 1',
      queryHash: 'abc',
      table: 'orders',
      estimatedRows: 50000,
      suggestedIndex: '-- [EXPLAIN 確認] 全表掃描: orders (估計 ~50,000 rows)\n-- WHERE 過濾: user_id\nCREATE INDEX idx_orders_user_id ON orders(user_id);',
    }]
    const merged = mergeIndexSuggestions(ddl, explain)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('both')
    expect(merged[0].suggestedIndex).toContain('EXPLAIN 確認')
  })

  it('returns explain-only finding when no matching ddl', () => {
    const explain: FullScanFinding[] = [{
      sql: 'SELECT * FROM logs WHERE event_type = "login"',
      queryHash: 'xyz',
      table: 'logs',
      estimatedRows: 200000,
      suggestedIndex: 'CREATE INDEX idx_logs_event_type ON logs(event_type);',
    }]
    const merged = mergeIndexSuggestions([], explain)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('explain')
  })

  it('returns empty when both inputs empty', () => {
    expect(mergeIndexSuggestions([], [])).toHaveLength(0)
  })
})
