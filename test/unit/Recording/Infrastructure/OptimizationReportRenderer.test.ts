import { describe, it, expect } from 'vitest'
import { renderOptimizationReport } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import type { OptimizationReportData } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'

const baseData: OptimizationReportData = {
  sessionId: 'rec_test',
  generatedAt: '2026-04-04T15:00:00.000Z',
  enabledLayers: ['pattern'],
  readWriteReport: {
    tables: [
      { table: 'users', reads: 1240, writes: 12, readRatio: 0.99 },
    ],
    suggestions: [
      {
        table: 'users',
        type: 'redis_cache',
        reason: 'readRatio=0.99 (99% reads)',
        sql: '-- users 資料表讀取佔 99%，建議在應用層加入 Redis cache\n-- TTL 建議：60 秒\n-- Redis key pattern：users:{id}',
      },
    ],
  },
  n1Findings: [
    {
      apiPath: '/users/:id',
      repeatedQueryHash: 'abc123',
      occurrences: 8,
      exampleSql: 'SELECT * FROM orders WHERE user_id = 42',
      affectedTable: 'orders',
      suggestion: '/users/:id 內 orders 資料表重複查詢 8 次/請求',
      batchSql: 'select * from orders where user_id in (?, ?, ?, ?, ?, ?, ?, ?)',
    },
  ],
  fragmentationFindings: [],
}

describe('renderOptimizationReport', () => {
  it('includes report header with session ID', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('# Archivolt 效能診斷報告')
    expect(md).toContain('rec_test')
  })

  it('includes read/write ratio table', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('## 📊 讀寫比分析')
    expect(md).toContain('users')
    expect(md).toContain('1240')
    expect(md).toContain('99%')
  })

  it('includes N+1 section with example SQL', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('## 🔴 N+1 問題')
    expect(md).toContain('/users/:id')
    expect(md).toContain('8 次')
    expect(md).toContain('SELECT * FROM orders')
  })

  it('includes runnable SQL blocks', () => {
    const md = renderOptimizationReport(baseData)
    expect(md).toContain('```sql')
    expect(md).toContain('user_id')
  })

  it('omits N+1 section when no findings', () => {
    const data = { ...baseData, n1Findings: [] }
    const md = renderOptimizationReport(data)
    expect(md).not.toContain('## 🔴 N+1 問題')
  })

  it('includes fragmentation section when findings exist', () => {
    const data = {
      ...baseData,
      fragmentationFindings: [{
        apiPath: '/dashboard',
        queryPattern: 'select * from permissions where user_id = ?',
        callsPerRequest: 5,
        suggestion: 'dataloader' as const,
        exampleSql: 'SELECT * FROM permissions WHERE user_id = 1',
      }],
    }
    const md = renderOptimizationReport(data)
    expect(md).toContain('## 🟡 查詢碎片化')
    expect(md).toContain('/dashboard')
    expect(md).toContain('5 次/請求')
  })
})
