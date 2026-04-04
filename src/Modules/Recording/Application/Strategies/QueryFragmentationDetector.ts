import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash, normalizeSql } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface FragmentationFinding {
  readonly apiPath: string
  readonly queryPattern: string
  readonly callsPerRequest: number
  readonly suggestion: 'batch' | 'dataloader' | 'cache'
  readonly exampleSql: string
}

const FRAGMENTATION_THRESHOLD = 3

function chooseSuggestion(queryPattern: string): 'batch' | 'dataloader' | 'cache' {
  if (/where\s+\w+\s*(=|in)\s*\?/i.test(queryPattern)) return 'dataloader'
  if (/select\s+\*/i.test(queryPattern)) return 'batch'
  return 'cache'
}

export function detectQueryFragmentation(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
): readonly FragmentationFinding[] {
  const hashToQuery = new Map<string, CapturedQuery>()
  for (const q of queries) {
    const h = computeQueryHash(q.sql)
    if (!hashToQuery.has(h)) hashToQuery.set(h, q)
  }

  const flowsByPath = new Map<string, ApiCallFlow[]>()
  for (const flow of flows) {
    const existing = flowsByPath.get(flow.path) ?? []
    flowsByPath.set(flow.path, [...existing, flow])
  }

  const findings: FragmentationFinding[] = []

  for (const [apiPath, pathFlows] of flowsByPath) {
    // hash → counts across flows (only flows where count >= FRAGMENTATION_THRESHOLD)
    const hashCounts = new Map<string, number[]>()

    for (const flow of pathFlows) {
      const countInFlow = new Map<string, number>()
      for (const dbQuery of flow.dbQueries) {
        countInFlow.set(dbQuery.queryHash, (countInFlow.get(dbQuery.queryHash) ?? 0) + 1)
      }
      for (const [hash, count] of countInFlow) {
        if (count >= FRAGMENTATION_THRESHOLD) {
          const existing = hashCounts.get(hash) ?? []
          hashCounts.set(hash, [...existing, count])
        }
      }
    }

    for (const [hash, counts] of hashCounts) {
      const q = hashToQuery.get(hash)
      if (!q) continue
      const avgCalls = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
      const pattern = normalizeSql(q.sql)

      findings.push({
        apiPath,
        queryPattern: pattern,
        callsPerRequest: avgCalls,
        suggestion: chooseSuggestion(pattern),
        exampleSql: q.sql,
      })
    }
  }

  return findings.sort((a, b) => b.callsPerRequest - a.callsPerRequest)
}
