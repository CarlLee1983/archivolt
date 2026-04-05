import { describe, it, expect } from 'vitest'
import { renderLlmSection } from '@/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer'
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'

const makeSuggestion = (type: LlmSuggestion['findingType'], sql: string, rec: string): LlmSuggestion => ({
  findingType: type,
  queryHash: 'abc123',
  exampleSql: sql,
  aiRecommendation: rec,
})

describe('renderLlmSection', () => {
  it('renders section header', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Use batch')], false, 1)
    expect(result).toContain('## AI Recommendations')
    expect(result).toContain('claude-haiku-4-5')
  })

  it('renders each suggestion with findingType label', () => {
    const result = renderLlmSection([
      makeSuggestion('full-scan', 'SELECT * FROM orders', 'Add index on status'),
    ], false, 1)
    expect(result).toContain('[Full Scan]')
    expect(result).toContain('SELECT * FROM orders')
    expect(result).toContain('Add index on status')
  })

  it('uses correct label for n1 type', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch it')], false, 1)
    expect(result).toContain('[N+1]')
  })

  it('uses correct label for fragmentation type', () => {
    const result = renderLlmSection([makeSuggestion('fragmentation', 'SELECT 1', 'Use cache')], false, 1)
    expect(result).toContain('[Fragmentation]')
  })

  it('shows interrupted notice when interrupted is true', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch')], true, 3)
    expect(result).toContain('Interrupted after 1/3')
  })

  it('does not show interrupted notice when not interrupted', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch')], false, 1)
    expect(result).not.toContain('Interrupted')
  })

  it('returns empty string for empty suggestions', () => {
    expect(renderLlmSection([], false, 0)).toBe('')
  })
})
