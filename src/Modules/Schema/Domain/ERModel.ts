export interface Column {
  readonly name: string
  readonly type: string
  readonly nullable: 0 | 1
  readonly default?: string
  readonly primaryKey: 0 | 1
}

export interface ForeignKey {
  readonly name: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
}

export interface VirtualForeignKey {
  readonly id: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
  readonly confidence: 'manual' | 'auto-suggested'
  readonly createdAt: Date
}

export interface Table {
  readonly name: string
  readonly columns: readonly Column[]
  readonly rowCount: number
  readonly engine: string
  readonly primaryKey: readonly string[]
  readonly foreignKeys: readonly ForeignKey[]
  readonly virtualForeignKeys: readonly VirtualForeignKey[]
}

export interface Group {
  readonly name: string
  readonly tables: readonly string[]
  readonly auto: boolean
}

export interface ERModelSource {
  readonly system: string
  readonly database: string
  readonly importedAt: Date
  readonly dbcliVersion: string
}

export interface ERModel {
  readonly source: ERModelSource
  readonly tables: Record<string, Table>
  readonly groups: Record<string, Group>
}

let _counter = 0

export function createVirtualFK(
  columns: string[],
  refTable: string,
  refColumns: string[],
  confidence: 'manual' | 'auto-suggested' = 'manual',
): VirtualForeignKey {
  const id = `vfk_${Date.now()}_${_counter++}`
  return {
    id,
    columns,
    refTable,
    refColumns,
    confidence,
    createdAt: new Date(),
  }
}
