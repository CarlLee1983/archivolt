import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'
import { inferRelations } from '@/Modules/Schema/Domain/RelationInferrer'
import { computeGroups } from '@/Modules/Schema/Domain/GroupingStrategy'

export interface DbcliColumn {
  readonly name: string
  readonly type: string
  readonly nullable: 0 | 1
  readonly default?: string
  readonly primaryKey: 0 | 1
}

export interface DbcliForeignKey {
  readonly name: string
  readonly columns: string[]
  readonly refTable: string
  readonly refColumns: string[]
}

export interface DbcliTable {
  readonly name: string
  readonly columns: DbcliColumn[]
  readonly rowCount: number
  readonly engine: string
  readonly primaryKey: string[]
  readonly foreignKeys: DbcliForeignKey[]
}

export interface DbcliSchema {
  readonly connection: { readonly system: string; readonly database: string; readonly [key: string]: unknown }
  readonly schema: Record<string, DbcliTable>
}

export function importSchema(dbcliJson: DbcliSchema): ERModel {
  // 1. Convert tables (with empty virtualForeignKeys initially)
  const tables: Record<string, Table> = {}
  for (const [tableName, dbcliTable] of Object.entries(dbcliJson.schema)) {
    tables[tableName] = {
      name: dbcliTable.name,
      columns: dbcliTable.columns,
      rowCount: dbcliTable.rowCount,
      engine: dbcliTable.engine,
      primaryKey: dbcliTable.primaryKey,
      foreignKeys: dbcliTable.foreignKeys,
      virtualForeignKeys: [],
    }
  }

  // 2. Infer auto-suggested relations
  const suggestions = inferRelations(tables)

  // 3. Add auto-suggested vFKs to tables
  const tablesWithVFKs: Record<string, Table> = {}
  for (const [tableName, table] of Object.entries(tables)) {
    const tableSuggestions = suggestions.filter((s) => s.sourceTable === tableName)
    const autoVFKs = tableSuggestions.map((s) =>
      createVirtualFK([...s.columns], s.refTable, [...s.refColumns], 'auto-suggested'),
    )
    tablesWithVFKs[tableName] = {
      ...table,
      virtualForeignKeys: autoVFKs,
    }
  }

  // 4. Compute groups
  const groups = computeGroups(tablesWithVFKs, suggestions)

  return {
    source: {
      system: dbcliJson.connection.system,
      database: dbcliJson.connection.database,
      importedAt: new Date(),
      dbcliVersion: '1.0.0',
    },
    tables: tablesWithVFKs,
    groups,
  }
}
