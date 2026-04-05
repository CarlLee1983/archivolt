import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'

export type EnabledLayer = 'pattern' | 'ddl' | 'explain' | 'llm'

export interface OptimizationReportData {
  readonly sessionId: string
  readonly generatedAt: string
  readonly enabledLayers: readonly EnabledLayer[]
  readonly readWriteReport: ReadWriteReport
  readonly n1Findings: readonly N1Finding[]
  readonly fragmentationFindings: readonly FragmentationFinding[]
  readonly indexGapFindings?: readonly IndexGapFinding[]
  readonly fullScanFindings?: readonly FullScanFinding[]
  readonly explainWarning?: string
  readonly llmSuggestions?: readonly LlmSuggestion[]
  readonly llmInterrupted?: boolean
  readonly llmTotal?: number
}

function renderHeader(data: OptimizationReportData): string {
  const layersLabel = data.enabledLayers.join(', ')
  return [
    '# Archivolt 效能診斷報告',
    '',
    `- **Session ID**: ${data.sessionId}`,
    `- **產生時間**: ${data.generatedAt}`,
    `- **啟用層級**: ${layersLabel}`,
    '',
  ].join('\n')
}

function renderReadWriteSection(report: ReadWriteReport): string {
  const lines: string[] = [
    '## 📊 讀寫比分析',
    '',
    '| 資料表 | 讀次 | 寫次 | 讀佔比 | 建議 |',
    '|--------|------|------|--------|------|',
  ]

  for (const t of report.tables) {
    const pct = `${Math.round(t.readRatio * 100)}%`
    const suggestion = report.suggestions.find(s => s.table === t.table)
    const suggestionLabel = suggestion ? suggestion.type : '—'
    lines.push(`| ${t.table} | ${t.reads} | ${t.writes} | ${pct} | ${suggestionLabel} |`)
  }

  if (report.suggestions.length > 0) {
    lines.push('')
    lines.push('### 快取建議 SQL')
    for (const s of report.suggestions) {
      lines.push('')
      lines.push(`**${s.table}** — ${s.reason}`)
      lines.push('')
      lines.push('```sql')
      lines.push(s.sql)
      lines.push('```')
    }
  }

  lines.push('')
  return lines.join('\n')
}

function renderN1Section(findings: readonly N1Finding[]): string {
  if (findings.length === 0) return ''

  const lines: string[] = [
    '## 🔴 N+1 問題',
    '',
  ]

  for (const f of findings) {
    lines.push(`### ${f.apiPath}`)
    lines.push('')
    lines.push(`重複查詢 **${f.occurrences} 次**，影響資料表：\`${f.affectedTable}\``)
    lines.push('')
    lines.push('**重複 SQL（範例）**')
    lines.push('')
    lines.push('```sql')
    lines.push(f.exampleSql)
    lines.push('```')
    lines.push('')
    lines.push('**建議改寫（批次查詢）**')
    lines.push('')
    lines.push('```sql')
    lines.push(f.batchSql)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

function renderFragmentationSection(findings: readonly FragmentationFinding[]): string {
  if (findings.length === 0) return ''

  const lines: string[] = [
    '## 🟡 查詢碎片化',
    '',
  ]

  for (const f of findings) {
    lines.push(`### ${f.apiPath}`)
    lines.push('')
    lines.push(`每次請求執行 **${f.callsPerRequest} 次/請求**，建議策略：\`${f.suggestion}\``)
    lines.push('')
    lines.push('**SQL 範例**')
    lines.push('')
    lines.push('```sql')
    lines.push(f.exampleSql)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

function renderIndexGapSection(findings: readonly IndexGapFinding[]): string {
  if (findings.length === 0) return ''

  const lines: string[] = [
    '## 🟠 索引缺失',
    '',
  ]

  for (const f of findings) {
    lines.push(`- **${f.table}.${f.column}** (來源: ${f.source})`)
    lines.push('')
    lines.push('```sql')
    lines.push(f.suggestedIndex)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

function renderFullScanSection(findings: readonly FullScanFinding[]): string {
  if (findings.length === 0) return ''

  const lines: string[] = [
    '## 🔴 全表掃描 (EXPLAIN 確認)',
    '',
  ]

  for (const f of findings) {
    lines.push(`- **${f.table}**（預估掃描行數：${f.estimatedRows.toLocaleString()}）`)
    lines.push('')
    lines.push('```sql')
    lines.push(f.sql)
    lines.push('```')
    lines.push('')
    lines.push('建議索引：')
    lines.push('')
    lines.push('```sql')
    lines.push(f.suggestedIndex)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

function renderFooter(explainWarning?: string): string {
  const lines: string[] = []

  if (explainWarning) {
    lines.push(`> ⚠️ ${explainWarning}`)
    lines.push('')
  }

  lines.push('*本報告由 Archivolt 自動生成。*')
  lines.push('')

  return lines.join('\n')
}

export function renderOptimizationReport(data: OptimizationReportData): string {
  const sections: string[] = [
    renderHeader(data),
    renderReadWriteSection(data.readWriteReport),
    renderN1Section(data.n1Findings),
    renderFragmentationSection(data.fragmentationFindings),
  ]

  if (data.indexGapFindings && data.indexGapFindings.length > 0) {
    sections.push(renderIndexGapSection(data.indexGapFindings))
  }

  if (data.fullScanFindings && data.fullScanFindings.length > 0) {
    sections.push(renderFullScanSection(data.fullScanFindings))
  }

  sections.push(renderFooter(data.explainWarning))

  return sections.join('\n')
}
