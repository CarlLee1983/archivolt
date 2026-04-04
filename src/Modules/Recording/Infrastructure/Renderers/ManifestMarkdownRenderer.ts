// src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts

import type {
  OperationManifest,
  OperationEntry,
  OperationFlow,
} from '@/Modules/Recording/Domain/OperationManifest'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'

function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

function renderOperation(op: OperationEntry): string {
  const lines: string[] = []
  lines.push(`### ${op.index + 1}. ${op.label}`)
  lines.push(`- **Chunk ID**: ${op.chunkId}`)
  lines.push(`- **Pattern**: ${op.pattern}`)

  if (op.marker) {
    const markerDesc = op.marker.target
      ? `${op.marker.action} — ${op.marker.target}`
      : `${op.marker.action} — ${op.marker.url}`
    lines.push(`- **Marker**: ${markerDesc}`)
  }

  if (op.tables.length === 0) {
    lines.push('- **Tables**: (無直接 query)')
  } else {
    lines.push(`- **Tables**: ${op.tables.map((t) => `\`${t}\``).join(', ')}`)
  }

  if (op.requestBody) {
    lines.push(`- **Request Body**: \`${op.requestBody}\``)
  }

  if (op.sqlSummaries.length > 0) {
    lines.push('- **SQL 摘要**:')
    for (const sql of op.sqlSummaries) {
      lines.push(`  - \`${sql}\``)
    }
  }

  if (op.inferredRelations.length > 0) {
    const relStr = op.inferredRelations
      .map((r) => `${r.sourceTable} → ${r.targetTable} (${r.sourceColumn})`)
      .join(', ')
    lines.push(`- **推斷關係**: ${relStr}`)
  }

  lines.push(`- **語義**: ${op.semantic}`)

  return lines.join('\n')
}

function renderFlow(flow: OperationFlow, index: number): string {
  const lines: string[] = []
  lines.push(`### Flow ${index + 1}: ${flow.label}`)
  lines.push(`- **Pattern Sequence**: ${flow.chunkPatternSequence}`)
  lines.push(`- **Dominant Pattern**: ${flow.dominantPattern}`)

  if (flow.semanticTables.length > 0) {
    lines.push(`- **Semantic Tables**: ${flow.semanticTables.map((t) => `\`${t}\``).join(', ')}`)
  } else {
    lines.push('- **Semantic Tables**: (全為噪音資料表)')
  }

  if (flow.inferredRelations.length > 0) {
    const relStr = flow.inferredRelations
      .map((r) => `${r.sourceTable} → ${r.targetTable} (${r.sourceColumn}, ${r.confidence})`)
      .join(', ')
    lines.push(`- **推斷關係**: ${relStr}`)
  }

  lines.push(`- **Chunks**: ${flow.chunkIndices.map((i) => `#${i + 1}`).join(', ')}`)

  return lines.join('\n')
}

function renderApiCallFlow(flow: ApiCallFlow, index: number): string {
  const lines: string[] = []
  lines.push(`### API ${index + 1}: ${flow.method} ${flow.path}`)
  lines.push(`- **Status**: ${flow.statusCode}`)
  lines.push(`- **Duration**: ${flow.durationMs}ms`)
  lines.push(`- **DB Queries**: ${flow.dbQueries.length}`)

  const n1Queries = flow.dbQueries.filter((q) => q.isN1Candidate)
  if (n1Queries.length > 0) {
    const uniqueN1 = new Set(n1Queries.map((q) => q.queryHash))
    lines.push(`- **N+1 偵測**: ${uniqueN1.size} 個 query pattern 重複出現`)
  }

  const allTables = [...new Set(flow.dbQueries.flatMap((q) => q.tableTouched))].sort()
  if (allTables.length > 0) {
    lines.push(`- **Tables Touched**: ${allTables.map((t) => `\`${t}\``).join(', ')}`)
  }

  if (flow.dbQueries.length > 0) {
    lines.push('- **Query Timeline**:')
    for (const q of flow.dbQueries) {
      const n1Label = q.isN1Candidate ? ' ⚠️ N+1' : ''
      const tables = q.tableTouched.join(', ')
      lines.push(`  - \`${q.queryHash}\` +${q.offsetMs}ms [${tables}]${n1Label}`)
    }
  }

  return lines.join('\n')
}

export function renderManifest(
  manifest: OperationManifest,
  apiFlows?: readonly ApiCallFlow[],
): string {
  const uniqueTables = new Set(manifest.tableMatrix.map((t) => t.table))
  const startDate = formatDate(manifest.recordedAt.start)
  const endDate = formatDate(manifest.recordedAt.end)

  const sections: string[] = []

  sections.push(`# Operation Manifest — Session: ${manifest.sessionId}`)
  sections.push(`> 錄製時間: ${startDate} ~ ${endDate} | Chunks: ${manifest.stats.totalChunks} | Tables: ${uniqueTables.size}`)
  sections.push('')
  sections.push('## Operations')
  sections.push('')
  for (const op of manifest.operations) {
    sections.push(renderOperation(op))
    sections.push('')
  }

  if (manifest.flows.length > 0) {
    const noiseLabel =
      manifest.noiseTables.length > 0
        ? ` (noise tables: ${manifest.noiseTables.map((t) => `\`${t}\``).join(', ')})`
        : ''
    sections.push(`## Flows${noiseLabel}`)
    sections.push('')
    for (let i = 0; i < manifest.flows.length; i++) {
      sections.push(renderFlow(manifest.flows[i], i))
      sections.push('')
    }
  }

  sections.push('## Bootstrap (Pre-Navigation)')
  sections.push('')
  sections.push(`- **Queries captured**: ${manifest.bootstrap.queryCount}`)
  sections.push(`- **OTHER operations**: ${manifest.bootstrap.otherOperationCount}`)
  if (manifest.bootstrap.tablesAccessed.length > 0) {
    sections.push(`- **Tables accessed**: ${manifest.bootstrap.tablesAccessed.map((t) => `\`${t}\``).join(', ')}`)
  } else {
    sections.push('- **Tables accessed**: (none)')
  }
  sections.push('')

  if (apiFlows && apiFlows.length > 0) {
    sections.push('## API Call Flows')
    sections.push('')
    sections.push(
      `> ${apiFlows.length} 個 HTTP request，已對應 DB query patterns（時間窗口 500ms）`,
    )
    sections.push('')
    for (let i = 0; i < apiFlows.length; i++) {
      sections.push(renderApiCallFlow(apiFlows[i], i))
      sections.push('')
    }
  }

  sections.push('## Table Involvement Matrix')
  sections.push('')
  sections.push('| Table | Read | Write | Operations |')
  sections.push('|-------|------|-------|------------|')
  for (const t of manifest.tableMatrix) {
    const ops = t.operationIndices.map((i) => `#${i + 1}`).join(', ')
    sections.push(`| ${t.table} | ${t.readCount} | ${t.writeCount} | ${ops} |`)
  }

  if (manifest.inferredRelations.length > 0) {
    sections.push('')
    sections.push('## Inferred Relations (Virtual FK Candidates)')
    sections.push('')
    sections.push('| Source Table | Column | Target Table | Column | Confidence | Evidence |')
    sections.push('|-------------|--------|-------------|--------|------------|----------|')
    for (const r of manifest.inferredRelations) {
      sections.push(`| ${r.sourceTable} | ${r.sourceColumn} | ${r.targetTable} | ${r.targetColumn} | ${r.confidence} | ${r.evidence} |`)
    }
  }

  sections.push('')
  sections.push('## Machine-Readable Summary')
  sections.push('')
  sections.push('```json')
  sections.push(JSON.stringify(manifest, null, 2))
  sections.push('```')

  return sections.join('\n')
}
