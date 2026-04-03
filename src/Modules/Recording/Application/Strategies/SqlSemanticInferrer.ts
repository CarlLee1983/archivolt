// src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts

import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

export function skeletonizeSql(sql: string): string {
  return sql
    .replace(/\bIN\s*\([^)]+\)/gi, 'IN (?)')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
}

export function inferSemantic(
  operations: readonly string[],
  tables: readonly string[],
): string {
  const uniqueOps = [...new Set(operations)]
  if (uniqueOps.length === 1) {
    return `${uniqueOps[0]} ${tables.join(', ')}`
  }
  return uniqueOps.map((op) => `${op} ${tables.join(', ')}`).join('; ')
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
