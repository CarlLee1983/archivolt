export interface Column {
  name: string
  type: string
  nullable: 0 | 1
  default?: string
  primaryKey: 0 | 1
}

export interface ForeignKey {
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
}

export interface VirtualForeignKey {
  id: string
  columns: string[]
  refTable: string
  refColumns: string[]
  confidence: 'manual' | 'auto-suggested'
  createdAt: string
}

export interface Table {
  name: string
  columns: Column[]
  rowCount: number
  engine: string
  primaryKey: string[]
  foreignKeys: ForeignKey[]
  virtualForeignKeys: VirtualForeignKey[]
}

export interface Group {
  name: string
  tables: string[]
  auto: boolean
}

export interface ERModel {
  source: {
    system: string
    database: string
    importedAt: string
    dbcliVersion: string
  }
  tables: Record<string, Table>
  groups: Record<string, Group>
}
