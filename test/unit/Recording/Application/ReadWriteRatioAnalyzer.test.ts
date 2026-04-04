// test/unit/Recording/Application/ReadWriteRatioAnalyzer.test.ts

import { describe, it, expect } from 'vitest'
import { analyzeReadWriteRatio } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeQuery(
  operation: CapturedQuery['operation'],
  tables: string[],
  error?: string,
): CapturedQuery {
  return {
    id: `q_${Math.random()}`,
    sessionId: 'rec_1',
    connectionId: 1,
    timestamp: Date.now(),
    duration: 5,
    sql: '',
    operation,
    tables,
    error,
  }
}

describe('analyzeReadWriteRatio', () => {
  it('計算單一資料表的讀寫統計', () => {
    const queries = [
      makeQuery('SELECT', ['users']),
      makeQuery('SELECT', ['users']),
      makeQuery('SELECT', ['users']),
      makeQuery('INSERT', ['users']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const users = report.tables.find((t) => t.table === 'users')
    expect(users).toBeDefined()
    expect(users!.reads).toBe(3)
    expect(users!.writes).toBe(1)
    expect(users!.readRatio).toBeCloseTo(0.75)
  })

  it('多資料表各自獨立統計', () => {
    const queries = [
      makeQuery('SELECT', ['users', 'orders']),
      makeQuery('INSERT', ['orders']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const users = report.tables.find((t) => t.table === 'users')
    const orders = report.tables.find((t) => t.table === 'orders')
    expect(users!.reads).toBe(1)
    expect(users!.writes).toBe(0)
    expect(users!.readRatio).toBe(1)
    expect(orders!.reads).toBe(1)
    expect(orders!.writes).toBe(1)
    expect(orders!.readRatio).toBe(0.5)
  })

  it('readRatio >= 0.9 且量 >= 10 觸發 redis_cache 建議', () => {
    const queries = [
      ...Array.from({ length: 9 }, () => makeQuery('SELECT', ['products'])),
      makeQuery('INSERT', ['products']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'products')
    expect(sugg).toBeDefined()
    expect(sugg!.type).toBe('redis_cache')
    expect(sugg!.reason).toContain('90%')
    expect(sugg!.reason).toContain('totalQueries=10')
  })

  it('readRatio = 0.9 (邊界值) 觸發 redis_cache', () => {
    const queries = [
      ...Array.from({ length: 9 }, () => makeQuery('SELECT', ['cache_table'])),
      makeQuery('UPDATE', ['cache_table']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'cache_table')
    expect(sugg!.type).toBe('redis_cache')
  })

  it('readRatio >= 0.9 但 totalQueries < 10 不觸發任何建議', () => {
    const queries = [
      ...Array.from({ length: 9 }, () => makeQuery('SELECT', ['sparse_table'])),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'sparse_table')
    expect(sugg).toBeUndefined()
  })

  it('errored 查詢不計入讀寫統計', () => {
    const queries = [
      ...Array.from({ length: 9 }, () => makeQuery('SELECT', ['users'])),
      makeQuery('INSERT', ['users'], 'Deadlock found'),
      makeQuery('INSERT', ['users'], 'Deadlock found'),
    ]
    const report = analyzeReadWriteRatio(queries)
    const users = report.tables.find((t) => t.table === 'users')
    expect(users!.reads).toBe(9)
    expect(users!.writes).toBe(0)
    expect(users!.readRatio).toBe(1)
  })

  it('errored SELECT 不影響讀取比率', () => {
    const queries = [
      makeQuery('SELECT', ['orders']),
      makeQuery('SELECT', ['orders'], 'Table not found'),
      makeQuery('INSERT', ['orders']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const orders = report.tables.find((t) => t.table === 'orders')
    expect(orders!.reads).toBe(1)
    expect(orders!.writes).toBe(1)
    expect(orders!.readRatio).toBe(0.5)
  })

  it('readRatio >= 0.8 且 totalQueries > 100 觸發 read_replica 建議', () => {
    const queries = [
      ...Array.from({ length: 90 }, () => makeQuery('SELECT', ['big_table'])),
      ...Array.from({ length: 20 }, () => makeQuery('UPDATE', ['big_table'])),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'big_table')
    expect(sugg).toBeDefined()
    expect(sugg!.type).toBe('read_replica')
    expect(sugg!.reason).toContain('totalQueries=110')
  })

  it('readRatio >= 0.8 但 totalQueries <= 100 不觸發 read_replica', () => {
    const queries = [
      ...Array.from({ length: 8 }, () => makeQuery('SELECT', ['small_table'])),
      ...Array.from({ length: 2 }, () => makeQuery('UPDATE', ['small_table'])),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'small_table')
    expect(sugg).toBeUndefined()
  })

  it('redis_cache 優先於 read_replica（readRatio >= 0.9 且量大）', () => {
    const queries = [
      ...Array.from({ length: 200 }, () => makeQuery('SELECT', ['hot_table'])),
      ...Array.from({ length: 5 }, () => makeQuery('INSERT', ['hot_table'])),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions.find((s) => s.table === 'hot_table')
    expect(sugg!.type).toBe('redis_cache')
  })

  it('OTHER 操作不計入讀寫統計', () => {
    const queries = [
      makeQuery('OTHER', ['users']),
      makeQuery('SELECT', ['users']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const users = report.tables.find((t) => t.table === 'users')
    expect(users!.reads).toBe(1)
    expect(users!.writes).toBe(0)
  })

  it('空查詢集回傳空報告', () => {
    const report = analyzeReadWriteRatio([])
    expect(report.tables).toHaveLength(0)
    expect(report.suggestions).toHaveLength(0)
  })

  it('tables 依 readRatio 遞減排序', () => {
    const queries = [
      makeQuery('SELECT', ['a']),
      makeQuery('SELECT', ['b']),
      makeQuery('SELECT', ['b']),
      makeQuery('UPDATE', ['b']),
    ]
    const report = analyzeReadWriteRatio(queries)
    expect(report.tables[0].table).toBe('a')
    expect(report.tables[0].readRatio).toBe(1)
    expect(report.tables[1].table).toBe('b')
    expect(report.tables[1].readRatio).toBeCloseTo(0.667)
  })

  it('sql 欄位包含可 copy-paste 的 Redis 建議', () => {
    const queries = [
      ...Array.from({ length: 9 }, () => makeQuery('SELECT', ['users'])),
      makeQuery('DELETE', ['users']),
    ]
    const report = analyzeReadWriteRatio(queries)
    const sugg = report.suggestions[0]
    expect(sugg.sql).toContain('Redis')
    expect(sugg.sql).toContain('users:{id}')
  })
})
