import Anthropic from '@anthropic-ai/sdk'
import type { TopNEntry, LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

export interface LlmOptimizationOptions {
  readonly topNEntries: readonly TopNEntry[]
  readonly readWriteReport: ReadWriteReport
  readonly ddlSchema?: ParsedSchema
  readonly onResult: (suggestion: LlmSuggestion) => void
  readonly signal?: AbortSignal
}

function buildReadWriteSummary(report: ReadWriteReport): string {
  if (report.tables.length === 0) return 'No read/write data available.'
  const lines = report.tables
    .slice(0, 10)
    .map(t => `- \`${t.table}\`: ${Math.round(t.readRatio * 100)}% reads, ${t.reads + t.writes} total queries`)
  const suggestions = report.suggestions
    .map(s => `- \`${s.table}\`: ${s.type} recommended (${s.reason})`)
    .join('\n')
  return lines.join('\n') + (suggestions ? '\n\nCache/replica candidates:\n' + suggestions : '')
}

function reconstructDdl(table: import('@/Modules/Recording/Application/Strategies/DdlSchemaParser').ParsedTable): string {
  const cols = table.columns.map(c => `  \`${c}\` TEXT`).join(',\n')
  const pk = table.primaryKey.length > 0
    ? `,\n  PRIMARY KEY (${table.primaryKey.map(c => `\`${c}\``).join(', ')})`
    : ''
  const indexes = table.indexes
    .map(idx => {
      const unique = idx.unique ? 'UNIQUE ' : ''
      return `,\n  ${unique}KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`
    })
    .join('')
  return `CREATE TABLE \`${table.name}\` (\n${cols}${pk}${indexes}\n);`
}

function buildSchemaContext(sql: string, schema?: ParsedSchema): string {
  if (!schema) return ''
  const tableMatches = sql.match(/\bFROM\s+`?(\w+)`?|\bJOIN\s+`?(\w+)`?/gi) ?? []
  const tableNames = new Set(
    tableMatches.map(m => m.replace(/^(FROM|JOIN)\s+`?/i, '').replace(/`$/, '').toLowerCase())
  )
  const relevantTables = schema.tables.filter(t => tableNames.has(t.name.toLowerCase()))
  if (relevantTables.length === 0) return ''
  return relevantTables.map(t => reconstructDdl(t)).join('\n\n')
}

function buildPrompt(entry: TopNEntry, report: ReadWriteReport, schema?: ParsedSchema): string {
  const schemaSection = buildSchemaContext(entry.exampleSql, schema)
  return [
    'You are a MySQL performance expert. Given the following query issue,',
    'provide a concise, actionable recommendation (max 200 words).',
    '',
    '## Query',
    entry.exampleSql,
    '',
    '## Issue',
    entry.context,
    ...(schemaSection ? ['', '## Schema Context', schemaSection] : []),
    '',
    '## Read/Write Profile',
    buildReadWriteSummary(report),
    '',
    'Respond with: 1) root cause, 2) recommended fix with example SQL if applicable.',
  ].join('\n')
}

export async function runLlmOptimization(options: LlmOptimizationOptions): Promise<readonly LlmSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Export it before using --llm.\n  export ANTHROPIC_API_KEY=sk-ant-...'
    )
  }

  const client = new Anthropic({ apiKey })
  const results: LlmSuggestion[] = []

  for (const entry of options.topNEntries) {
    if (options.signal?.aborted) break

    const prompt = buildPrompt(entry, options.readWriteReport, options.ddlSchema)
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const suggestion: LlmSuggestion = {
      findingType: entry.findingType,
      queryHash: entry.queryHash,
      exampleSql: entry.exampleSql,
      aiRecommendation: text,
    }

    results.push(suggestion)
    options.onResult(suggestion)
  }

  return results
}
