import type { Table } from './ERModel'

export interface SuggestedRelation {
  readonly sourceTable: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
}

function pluralCandidates(prefix: string): string[] {
  const candidates: string[] = [
    `${prefix}s`,
    `${prefix}es`,
    prefix,
  ]
  if (prefix.endsWith('y')) {
    candidates.push(`${prefix.slice(0, -1)}ies`)
  }
  return candidates
}

export function inferRelations(tables: Record<string, Table>): SuggestedRelation[] {
  const suggestions: SuggestedRelation[] = []

  for (const table of Object.values(tables)) {
    const explicitFKColumns = new Set(
      table.foreignKeys.flatMap((fk) => [...fk.columns]),
    )
    const pkSet = new Set(table.primaryKey)

    for (const column of table.columns) {
      if (!column.name.endsWith('_id')) continue
      if (pkSet.has(column.name)) continue
      if (explicitFKColumns.has(column.name)) continue

      const prefix = column.name.slice(0, -3) // strip '_id'
      const candidates = pluralCandidates(prefix)

      for (const candidate of candidates) {
        if (!(candidate in tables)) continue
        if (candidate === table.name) continue // skip self-reference

        suggestions.push({
          sourceTable: table.name,
          columns: [column.name],
          refTable: candidate,
          refColumns: ['id'],
        })
        break // take first matching candidate
      }
    }
  }

  return suggestions
}
