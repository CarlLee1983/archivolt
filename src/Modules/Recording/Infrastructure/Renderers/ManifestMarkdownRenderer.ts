// src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts

import type {
  OperationManifest,
  OperationEntry,
} from '@/Modules/Recording/Domain/OperationManifest'

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

export function renderManifest(manifest: OperationManifest): string {
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
