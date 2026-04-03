// src/Modules/Recording/Application/Strategies/RelationInferrer.ts

import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

const JOIN_ON_PATTERN = /\bJOIN\s+`?(\w+)`?\s+(?:\w+\s+)?ON\s+`?(\w+)`?\.`?(\w+)`?\s*=\s*`?(\w+)`?\.`?(\w+)`?/gi
const WHERE_IN_SUBQUERY = /\bWHERE\s+`?(\w+)`?\s+IN\s*\(\s*SELECT\s+`?(\w+)`?\s+FROM\s+`?(\w+)`?/gi

function relationKey(r: InferredRelation): string {
  return `${r.sourceTable}.${r.sourceColumn}->${r.targetTable}.${r.targetColumn}`
}

export function inferRelations(
  queries: readonly CapturedQuery[],
  chunkId: string,
): readonly InferredRelation[] {
  const seen = new Map<string, InferredRelation>()

  for (const q of queries) {
    // High confidence: explicit JOIN ON
    JOIN_ON_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = JOIN_ON_PATTERN.exec(q.sql)) !== null) {
      const [, , leftTable, leftCol, rightTable, rightCol] = match
      const rel: InferredRelation = {
        sourceTable: leftTable,
        sourceColumn: leftCol,
        targetTable: rightTable,
        targetColumn: rightCol,
        confidence: 'high',
        evidence: `JOIN ON in ${chunkId}`,
      }
      const key = relationKey(rel)
      if (!seen.has(key)) seen.set(key, rel)
    }

    // Medium confidence: WHERE col IN (SELECT col FROM table)
    WHERE_IN_SUBQUERY.lastIndex = 0
    while ((match = WHERE_IN_SUBQUERY.exec(q.sql)) !== null) {
      const [, whereCol, selectCol, subTable] = match
      const outerTable = q.tables[0]
      if (outerTable && outerTable !== subTable) {
        const rel: InferredRelation = {
          sourceTable: outerTable,
          sourceColumn: whereCol,
          targetTable: subTable,
          targetColumn: selectCol,
          confidence: 'medium',
          evidence: `WHERE IN subquery in ${chunkId}`,
        }
        const key = relationKey(rel)
        if (!seen.has(key)) seen.set(key, rel)
      }
    }
  }

  // Low confidence: co-occurring tables in same chunk with _id columns
  const allTables = [...new Set(queries.flatMap((q) => q.tables))]
  if (allTables.length >= 2) {
    for (const q of queries) {
      const colMatches = q.sql.matchAll(/\b(\w+)_id\b/gi)
      for (const colMatch of colMatches) {
        const colName = colMatch[1].toLowerCase()
        const candidates = allTables.filter(
          (t) => t.toLowerCase() === colName || t.toLowerCase() === `${colName}s`,
        )
        for (const targetTable of candidates) {
          for (const sourceTable of q.tables) {
            if (sourceTable === targetTable) continue
            const rel: InferredRelation = {
              sourceTable,
              sourceColumn: `${colName}_id`,
              targetTable,
              targetColumn: 'id',
              confidence: 'low',
              evidence: `co-occurring tables in ${chunkId}`,
            }
            const key = relationKey(rel)
            if (!seen.has(key)) seen.set(key, rel)
          }
        }
      }
    }
  }

  return [...seen.values()]
}

export function mergeRelations(
  allRelations: readonly InferredRelation[],
): readonly InferredRelation[] {
  const best = new Map<string, InferredRelation>()
  const confidenceRank = { high: 3, medium: 2, low: 1 }
  for (const rel of allRelations) {
    const key = relationKey(rel)
    const existing = best.get(key)
    if (!existing || confidenceRank[rel.confidence] > confidenceRank[existing.confidence]) {
      best.set(key, rel)
    }
  }
  return [...best.values()]
}
