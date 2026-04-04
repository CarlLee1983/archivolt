import { createHash } from 'node:crypto'
import type { ApiCallFlow, DbOperationRef } from '@/Modules/Recording/Domain/ApiCallFlow'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

const DEFAULT_WINDOW_MS = 500

/**
 * SQL を正規化して SHA256 前 16 chars を返す:
 * 1. IN(...) → IN(?)
 * 2. 単引用符文字列 → ?
 * 3. 数値リテラル → ?
 * 4. 空白正規化、小文字化
 * 5. SHA256 hex → 前 16 chars
 */
export function computeQueryHash(sql: string): string {
  let normalized = sql
    .replace(/IN\s*\([^)]*\)/gi, 'IN (?)')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * API flows と DB queries を時間窓口で関連付ける:
 * - 窓口: [startTimestamp - windowMs, startTimestamp + durationMs + windowMs]
 * - N+1 検出: 同一 flow 内で同じ queryHash が 2+ 回
 */
export function correlate(
  flows: readonly ApiCallFlow[],
  queries: readonly CapturedQuery[],
  windowMs: number = DEFAULT_WINDOW_MS,
): readonly ApiCallFlow[] {
  return flows.map((flow) => {
    const windowStart = flow.startTimestamp - windowMs
    const windowEnd = flow.startTimestamp + flow.durationMs + windowMs

    const relatedQueries = queries.filter(
      (q) => q.timestamp >= windowStart && q.timestamp <= windowEnd,
    )

    const hashCounts = new Map<string, number>()
    for (const q of relatedQueries) {
      const hash = computeQueryHash(q.sql)
      hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1)
    }

    const dbQueries: DbOperationRef[] = relatedQueries.map((q) => {
      const hash = computeQueryHash(q.sql)
      return {
        queryHash: hash,
        offsetMs: q.timestamp - flow.startTimestamp,
        tableTouched: [...q.tables],
        isN1Candidate: (hashCounts.get(hash) ?? 0) >= 2,
      }
    })

    return { ...flow, dbQueries }
  })
}
