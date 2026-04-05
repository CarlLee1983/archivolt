import type { LlmSuggestion, FindingType } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'

const FINDING_LABEL: Record<FindingType, string> = {
  'full-scan': 'Full Scan',
  'n1': 'N+1',
  'fragmentation': 'Fragmentation',
}

export function renderLlmSection(
  suggestions: readonly LlmSuggestion[],
  interrupted: boolean,
  totalRequested: number,
): string {
  if (suggestions.length === 0) return ''

  const lines: string[] = [
    '## AI Recommendations (Layer 3 — claude-haiku-4-5)',
    '',
  ]

  if (interrupted) {
    lines.push(`> ⚠ Interrupted after ${suggestions.length}/${totalRequested} findings`)
    lines.push('')
  }

  for (const s of suggestions) {
    const label = FINDING_LABEL[s.findingType]
    lines.push(`### [${label}] ${s.exampleSql}`)
    lines.push('')
    for (const line of s.aiRecommendation.split('\n')) {
      lines.push(`> ${line}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
