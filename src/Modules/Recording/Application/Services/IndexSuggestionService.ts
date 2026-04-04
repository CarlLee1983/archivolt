import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

export interface MergedIndexFinding {
  readonly table: string
  readonly column: string
  readonly suggestedIndex: string
  readonly source: 'ddl' | 'explain' | 'both'
  readonly estimatedRows?: number
  readonly confidence: 'high' | 'low' | 'confirmed'
}

export function mergeIndexSuggestions(
  ddlFindings: readonly IndexGapFinding[],
  explainFindings: readonly FullScanFinding[],
): readonly MergedIndexFinding[] {
  const results = new Map<string, MergedIndexFinding>()

  for (const d of ddlFindings) {
    const key = `${d.table}.${d.column}`
    results.set(key, {
      table: d.table,
      column: d.column,
      suggestedIndex: d.suggestedIndex,
      source: 'ddl',
      confidence: d.confidence,
    })
  }

  for (const e of explainFindings) {
    // Extract first WHERE column from the suggestedIndex CREATE INDEX statement
    const colMatch = e.suggestedIndex.match(/ON\s+\w+\(([^,)]+)/)
    const column = colMatch ? colMatch[1].trim() : 'unknown'
    const key = `${e.table}.${column}`

    if (results.has(key)) {
      // Both confirmed — prefer EXPLAIN's suggestion (has row counts)
      results.set(key, {
        table: e.table,
        column,
        suggestedIndex: e.suggestedIndex,
        source: 'both',
        estimatedRows: e.estimatedRows,
        confidence: 'confirmed',
      })
    } else {
      results.set(key, {
        table: e.table,
        column,
        suggestedIndex: e.suggestedIndex,
        source: 'explain',
        estimatedRows: e.estimatedRows,
        confidence: 'confirmed',
      })
    }
  }

  return [...results.values()].sort((a, b) => {
    const priority: Record<string, number> = { confirmed: 0, high: 1, low: 2 }
    return (priority[a.confidence] ?? 2) - (priority[b.confidence] ?? 2)
  })
}
