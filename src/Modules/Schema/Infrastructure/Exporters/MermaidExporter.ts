import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

export class MermaidExporter implements IExporter {
  readonly name = 'mermaid'
  readonly label = 'Mermaid ER Diagram'

  export(model: ERModel): string {
    const lines: string[] = ['erDiagram']

    // Table definitions
    for (const table of Object.values(model.tables)) {
      lines.push(`  ${table.name} {`)
      for (const col of table.columns) {
        lines.push(`    ${col.type} ${col.name}`)
      }
      lines.push('  }')
    }

    lines.push('')

    // FK relationships
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`  ${table.name} }o--|| ${fk.refTable} : "${fk.columns.join(', ')}"`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`  ${table.name} }o--|| ${vfk.refTable} : "${vfk.columns.join(', ')}"`)
      }
    }

    return lines.join('\n')
  }
}
