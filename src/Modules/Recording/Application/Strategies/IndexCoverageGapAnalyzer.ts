import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

export interface IndexGapFinding {
  readonly table: string
  readonly column: string
  readonly sourceQueryHash: string
  readonly exampleSql: string
  readonly confidence: 'high' | 'low'
  readonly source: 'ddl' | 'explain' | 'both'
  readonly suggestedIndex: string
}

const SQL_RESERVED = new Set([
  'and', 'or', 'not', 'null', 'is', 'in', 'like', 'between',
  'select', 'from', 'where', 'join', 'on', 'as', 'by', 'order',
  'group', 'having', 'limit', 'offset', 'union', 'all', 'distinct',
  'true', 'false', 'case', 'when', 'then', 'else', 'end',
])

function extractWhereColumns(sql: string): { columns: readonly string[], confidence: 'high' | 'low' } {
  // Low confidence if there's a subquery in WHERE
  const confidence: 'high' | 'low' = /where[\s\S]*select/i.test(sql) ? 'low' : 'high'

  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT\b|$)/i)
  if (!whereMatch) return { columns: [], confidence }

  const whereClause = whereMatch[1]
  const colMatches = [...whereClause.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|IN\b|LIKE\b|>|<|>=|<=)/gi)]
  const columns = [...new Set(
    colMatches
      .map((m) => m[1].toLowerCase())
      .filter((c) => !SQL_RESERVED.has(c))
  )]

  return { columns, confidence }
}

function isColumnIndexed(table: string, column: string, schema: ParsedSchema): boolean {
  const tbl = schema.tables.find((t) => t.name === table)
  if (!tbl) return false

  if (tbl.primaryKey.map((c) => c.toLowerCase()).includes(column)) return true

  return tbl.indexes.some((idx) =>
    idx.columns.some((c) => c.toLowerCase() === column)
  )
}

export function analyzeIndexCoverageGaps(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  schema: ParsedSchema,
): readonly IndexGapFinding[] {
  const seen = new Set<string>()
  const results: IndexGapFinding[] = []

  const addGap = (table: string, column: string, hash: string, sql: string, confidence: 'high' | 'low') => {
    const key = `${table}.${column}`
    if (seen.has(key)) return
    seen.add(key)
    results.push({
      table,
      column,
      sourceQueryHash: hash,
      exampleSql: sql,
      confidence,
      source: 'ddl',
      suggestedIndex: `-- ⚠️ 未經 EXPLAIN 驗證，建議先在測試環境確認\nCREATE INDEX idx_${table}_${column} ON ${table}(${column});`,
    })
  }

  for (const f of n1Findings) {
    const { columns, confidence } = extractWhereColumns(f.exampleSql)
    for (const col of columns) {
      if (!isColumnIndexed(f.affectedTable, col, schema)) {
        addGap(f.affectedTable, col, f.repeatedQueryHash, f.exampleSql, confidence)
      }
    }
  }

  for (const f of fragmentationFindings) {
    const tableMatch = f.queryPattern.match(/from\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/i)
    const table = tableMatch ? tableMatch[1] : null
    if (!table) continue

    const { columns, confidence } = extractWhereColumns(f.exampleSql)
    for (const col of columns) {
      if (!isColumnIndexed(table, col, schema)) {
        addGap(table, col, f.queryPattern, f.exampleSql, confidence)
      }
    }
  }

  return results
}
