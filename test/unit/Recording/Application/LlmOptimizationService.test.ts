import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TopNEntry } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Use an index on the status column.' }],
      }),
    }
  },
}))

const makeEntry = (type: TopNEntry['findingType'], sql: string): TopNEntry => ({
  findingType: type,
  queryHash: `hash_${sql}`,
  exampleSql: sql,
  context: `Issue with ${sql}`,
})

const emptyReport: ReadWriteReport = { tables: [], suggestions: [] }

describe('runLlmOptimization', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  })

  it('throws if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    await expect(runLlmOptimization({
      topNEntries: [makeEntry('n1', 'SELECT 1')],
      readWriteReport: emptyReport,
      onResult: () => {},
    })).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('returns one suggestion per entry', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const entries = [makeEntry('full-scan', 'SELECT * FROM orders'), makeEntry('n1', 'SELECT * FROM products WHERE id = ?')]
    const results = await runLlmOptimization({ topNEntries: entries, readWriteReport: emptyReport, onResult: () => {} })
    expect(results).toHaveLength(2)
  })

  it('calls onResult callback after each entry', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const calls: string[] = []
    const entries = [makeEntry('full-scan', 'SELECT * FROM a'), makeEntry('n1', 'SELECT * FROM b')]
    await runLlmOptimization({
      topNEntries: entries,
      readWriteReport: emptyReport,
      onResult: s => calls.push(s.findingType),
    })
    expect(calls).toEqual(['full-scan', 'n1'])
  })

  it('stops early when AbortSignal is aborted', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const controller = new AbortController()
    const entries = [
      makeEntry('full-scan', 'SELECT * FROM a'),
      makeEntry('n1', 'SELECT * FROM b'),
      makeEntry('fragmentation', 'SELECT * FROM c'),
    ]
    const calls: string[] = []
    const results = await runLlmOptimization({
      topNEntries: entries,
      readWriteReport: emptyReport,
      onResult: s => {
        calls.push(s.findingType)
        controller.abort()
      },
      signal: controller.signal,
    })
    expect(results).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('maps findingType and exampleSql into suggestion', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const results = await runLlmOptimization({
      topNEntries: [makeEntry('full-scan', 'SELECT * FROM orders')],
      readWriteReport: emptyReport,
      onResult: () => {},
    })
    expect(results[0].findingType).toBe('full-scan')
    expect(results[0].exampleSql).toBe('SELECT * FROM orders')
    expect(results[0].aiRecommendation).toBe('Use an index on the status column.')
  })

  it('returns empty array when topNEntries is empty', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const results = await runLlmOptimization({
      topNEntries: [],
      readWriteReport: emptyReport,
      onResult: () => {},
    })
    expect(results).toHaveLength(0)
  })
})
