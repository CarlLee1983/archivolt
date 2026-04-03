// src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts

import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

export function skeletonizeSql(sql: string): string {
  return sql
    .replace(/\bIN\s*\([^)]+\)/gi, 'IN (?)')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
}

export function inferSemantic(queries: readonly CapturedQuery[]): string {
  if (queries.length === 0) return '(no database operations)'

  const opToTables = new Map<string, Set<string>>()
  for (const q of queries) {
    const tables = opToTables.get(q.operation) ?? new Set<string>()
    for (const t of q.tables) tables.add(t)
    opToTables.set(q.operation, tables)
  }

  return [...opToTables.entries()]
    .map(([op, tables]) => `${op} ${[...tables].join(', ')}`)
    .join('; ')
}

export function buildLabel(marker: OperationMarker | undefined): string {
  if (!marker) return '(silence-based split)'
  const { action, url, target, label } = marker
  if (action === 'navigate') {
    return label ? `navigate ${url} — "${label}"` : `navigate ${url}`
  }
  if (target) {
    return `${action} ${target} (on ${url})`
  }
  return `${action} ${url}`
}

export function extractSqlSummaries(queries: readonly CapturedQuery[]): readonly string[] {
  const seen = new Set<string>()
  const summaries: string[] = []
  for (const q of queries) {
    const skeleton = skeletonizeSql(q.sql)
    if (!seen.has(skeleton)) {
      seen.add(skeleton)
      summaries.push(skeleton)
    }
  }
  return summaries
}
