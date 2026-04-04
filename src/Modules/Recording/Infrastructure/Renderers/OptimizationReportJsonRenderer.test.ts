import { describe, it, expect } from 'vitest'
import { renderOptimizationReportJson } from './OptimizationReportJsonRenderer'
import type { OptimizationReportData } from './OptimizationReportRenderer'

const sampleData: OptimizationReportData = {
  sessionId: 'test-123',
  generatedAt: '2026-04-04T00:00:00.000Z',
  enabledLayers: ['pattern'],
  readWriteReport: {
    tables: [{ table: 'orders', reads: 10, writes: 2, readRatio: 0.83 }],
    suggestions: [],
  },
  n1Findings: [],
  fragmentationFindings: [],
}

describe('renderOptimizationReportJson', () => {
  it('產出合法 JSON 字串', () => {
    const result = renderOptimizationReportJson(sampleData)
    const parsed = JSON.parse(result)
    expect(parsed.sessionId).toBe('test-123')
    expect(parsed.readWriteReport.tables).toHaveLength(1)
    expect(parsed.n1Findings).toEqual([])
  })

  it('包含所有 OptimizationReportData 欄位', () => {
    const result = renderOptimizationReportJson(sampleData)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty('enabledLayers')
    expect(parsed).toHaveProperty('readWriteReport')
    expect(parsed).toHaveProperty('n1Findings')
    expect(parsed).toHaveProperty('fragmentationFindings')
  })
})
