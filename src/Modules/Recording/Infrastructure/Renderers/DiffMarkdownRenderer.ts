import type { SessionDiff } from '@/Modules/Recording/Application/Services/SessionDiffService'

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '0'
}

export function renderDiff(diff: SessionDiff): string {
  const sections: string[] = []

  sections.push(`## Session Diff: ${diff.sessionA} vs ${diff.sessionB}`)
  sections.push('')
  sections.push('### Table 存取差異')
  sections.push('')
  sections.push('| Table | A (read/write) | B (read/write) | 變化 |')
  sections.push('|-------|----------------|----------------|------|')

  const removedSet = new Set(diff.tables.removed.map((t) => t.table))
  const addedSet = new Set(diff.tables.added.map((t) => t.table))
  const changedMap = new Map(diff.tables.changed.map((t) => [t.table, t]))

  const allTables = new Set<string>([
    ...diff.tables.removed.map((t) => t.table),
    ...diff.tables.changed.map((t) => t.table),
    ...diff.tables.added.map((t) => t.table),
  ])

  for (const table of allTables) {
    if (removedSet.has(table)) {
      const t = diff.tables.removed.find((r) => r.table === table)!
      sections.push(`| ${table} | ${t.readCount} / ${t.writeCount} | — | 🗑 消失 |`)
    } else if (addedSet.has(table)) {
      const t = diff.tables.added.find((a) => a.table === table)!
      sections.push(`| ${table} | — | ${t.readCount} / ${t.writeCount} | 🆕 新增 |`)
    } else if (changedMap.has(table)) {
      const t = changedMap.get(table)!
      const changes: string[] = []
      if (t.readDelta !== 0) changes.push(`read ${formatDelta(t.readDelta)}`)
      if (t.writeDelta !== 0) changes.push(`write ${formatDelta(t.writeDelta)}`)
      sections.push(`| ${table} | ${t.readA} / ${t.writeA} | ${t.readB} / ${t.writeB} | ${changes.join(', ')} |`)
    }
  }

  if (diff.relations.added.length > 0 || diff.relations.removed.length > 0) {
    sections.push('')
    sections.push('### 關係推斷差異')
    sections.push('')
    for (const r of diff.relations.added) {
      sections.push(`- 🆕 ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.confidence})`)
    }
    for (const r of diff.relations.removed) {
      sections.push(`- 🗑 ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.confidence})`)
    }
  }

  sections.push('')
  sections.push('### 統計摘要')
  sections.push('')
  sections.push(`- Chunks: ${diff.stats.chunksA} → ${diff.stats.chunksB} (${formatDelta(diff.stats.chunksDelta)})`)
  sections.push(`- Queries: ${diff.stats.queriesA} → ${diff.stats.queriesB} (${formatDelta(diff.stats.queriesDelta)})`)
  sections.push(`- Tables: ${diff.stats.tablesA} → ${diff.stats.tablesB} (${formatDelta(diff.stats.tablesDelta)})`)

  return sections.join('\n')
}
