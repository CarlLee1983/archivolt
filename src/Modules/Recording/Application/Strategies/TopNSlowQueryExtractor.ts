import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

export type FindingType = 'full-scan' | 'n1' | 'fragmentation'

export interface LlmSuggestion {
  readonly findingType: FindingType
  readonly queryHash: string
  readonly exampleSql: string
  readonly aiRecommendation: string
}

export interface TopNEntry {
  readonly findingType: FindingType
  readonly queryHash: string
  readonly exampleSql: string
  readonly context: string
}

export function extractTopN(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  fullScanFindings: readonly FullScanFinding[],
  topN: number,
): readonly TopNEntry[] {
  const slotSize = Math.ceil(topN / 3)

  const sortedFullScans = [...fullScanFindings].sort((a, b) => b.estimatedRows - a.estimatedRows)
  const sortedN1 = [...n1Findings].sort((a, b) => b.occurrences - a.occurrences)
  const sortedFragmentation = [...fragmentationFindings].sort((a, b) => b.callsPerRequest - a.callsPerRequest)

  // Redistribute unused slots forward (full-scan → n1 → fragmentation) but not backward.
  // If only full-scans exist with topN=5, you get ceil(5/3)=2 results, not 5.
  const fsCount = Math.min(slotSize, sortedFullScans.length)
  const n1Count = Math.min(slotSize + (slotSize - fsCount), sortedN1.length)
  const fragCount = Math.min(slotSize + (slotSize - fsCount) + (slotSize - n1Count), sortedFragmentation.length)

  const fullScanEntries: TopNEntry[] = sortedFullScans.slice(0, fsCount).map(f => ({
    findingType: 'full-scan' as const,
    queryHash: f.queryHash,
    exampleSql: f.sql,
    context: `Full table scan on \`${f.table}\` (~${f.estimatedRows.toLocaleString()} rows estimated). Suggested index: ${f.suggestedIndex}`,
  }))

  const n1Entries: TopNEntry[] = sortedN1.slice(0, n1Count).map(f => ({
    findingType: 'n1' as const,
    queryHash: f.repeatedQueryHash,
    exampleSql: f.exampleSql,
    context: `N+1 query on \`${f.affectedTable}\` repeated ${f.occurrences} times per API call to ${f.apiPath}. Suggested fix: ${f.suggestion}. Batch SQL: ${f.batchSql}`,
  }))

  const fragmentationEntries: TopNEntry[] = sortedFragmentation.slice(0, fragCount).map(f => ({
    findingType: 'fragmentation' as const,
    queryHash: '',
    exampleSql: f.exampleSql,
    context: `Query fragmentation on ${f.apiPath}: ${f.callsPerRequest} calls/request. Pattern: ${f.queryPattern}. Strategy: ${f.suggestion}`,
  }))

  return [...fullScanEntries, ...n1Entries, ...fragmentationEntries].slice(0, topN)
}
