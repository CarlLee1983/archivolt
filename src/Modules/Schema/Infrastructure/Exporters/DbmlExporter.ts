import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

export class DbmlExporter implements IExporter {
  readonly name = 'dbml'
  readonly label = 'DBML'

  export(model: ERModel): string {
    const lines: string[] = []

    // Table definitions
    for (const table of Object.values(model.tables)) {
      lines.push(`Table ${table.name} {`)
      for (const col of table.columns) {
        lines.push(`  ${col.name} ${col.type}`)
      }
      lines.push('}')
      lines.push('')
    }

    // Refs for FK
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`Ref: ${table.name}.${fk.columns[0]} > ${fk.refTable}.${fk.refColumns[0]}`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`Ref: ${table.name}.${vfk.columns[0]} > ${vfk.refTable}.${vfk.refColumns[0]}`)
      }
    }

    return lines.join('\n').trim()
  }
}
