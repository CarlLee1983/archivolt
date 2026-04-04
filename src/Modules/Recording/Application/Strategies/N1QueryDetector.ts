import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash, normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface N1Finding {
  readonly apiPath: string
  readonly repeatedQueryHash: string
  readonly occurrences: number
  readonly exampleSql: string
  readonly affectedTable: string
  readonly suggestion: string
  readonly batchSql: string
}

function buildBatchSql(exampleSql: string, occurrences: number): string {
  const normalized = normalizeSql(exampleSql)
  const placeholders = Array(occurrences).fill('?').join(', ')

  // Try to replace "= ?" at end of WHERE clause with "IN (...)"
  let batched = normalized.replace(/(\b\w+)\s*=\s*\?$/, `$1 IN (${placeholders})`)

  // If that didn't match, try with whitespace after ?
  if (batched === normalized) {
    batched = normalized.replace(/(\b\w+)\s*=\s*\?(\s)/, `$1 IN (${placeholders})$2`)
  }

  // If still no match, return comment suggestion
  if (batched === normalized) {
    return `${normalized}\n-- 建議改為批量查詢: WHERE <column> IN (${placeholders})`
  }

  return batched
}

export function detectN1Queries(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
): readonly N1Finding[] {
  // Build hash → CapturedQuery map
  const hashToQuery = new Map<string, CapturedQuery>()
  for (const q of queries) {
    const h = computeQueryHash(q.sql)
    if (!hashToQuery.has(h)) hashToQuery.set(h, q)
  }

  // Group flows by path
  const flowsByPath = new Map<string, ApiCallFlow[]>()
  for (const flow of flows) {
    const existing = flowsByPath.get(flow.path) ?? []
    flowsByPath.set(flow.path, [...existing, flow])
  }

  const findings: N1Finding[] = []

  for (const [apiPath, pathFlows] of flowsByPath) {
    // queryHash → max occurrences across all flows
    const maxOccurrences = new Map<string, number>()

    for (const flow of pathFlows) {
      const countInFlow = new Map<string, number>()
      for (const dbQuery of flow.dbQueries) {
        if (!dbQuery.isN1Candidate) continue
        countInFlow.set(dbQuery.queryHash, (countInFlow.get(dbQuery.queryHash) ?? 0) + 1)
      }
      for (const [hash, count] of countInFlow) {
        const current = maxOccurrences.get(hash) ?? 0
        if (count > current) maxOccurrences.set(hash, count)
      }
    }

    for (const [hash, occurrences] of maxOccurrences) {
      if (occurrences < 2) continue
      const q = hashToQuery.get(hash)
      if (!q) continue

      const affectedTable = q.tables[0] ?? 'unknown'
      findings.push({
        apiPath,
        repeatedQueryHash: hash,
        occurrences,
        exampleSql: q.sql,
        affectedTable,
        suggestion: `${apiPath} 內 ${affectedTable} 資料表重複查詢 ${occurrences} 次/請求，建議改為批量查詢`,
        batchSql: buildBatchSql(q.sql, occurrences),
      })
    }
  }

  return findings.sort((a, b) => b.occurrences - a.occurrences)
}
