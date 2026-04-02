import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

function toPascalCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function mapSqlTypeToPrisma(sqlType: string, nullable: 0 | 1): string {
  const lower = sqlType.toLowerCase()
  let prismaType: string

  if (lower.includes('bigint') || lower.includes('int8')) {
    prismaType = 'BigInt'
  } else if (lower.includes('int')) {
    prismaType = 'Int'
  } else if (lower.includes('float') || lower.includes('double') || lower.includes('decimal') || lower.includes('numeric')) {
    prismaType = 'Float'
  } else if (lower.includes('bool')) {
    prismaType = 'Boolean'
  } else if (lower.includes('timestamp') || lower.includes('datetime') || lower.includes('date')) {
    prismaType = 'DateTime'
  } else if (lower.includes('json')) {
    prismaType = 'Json'
  } else {
    prismaType = 'String'
  }

  return nullable === 1 ? `${prismaType}?` : prismaType
}

interface RelationRef {
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
  readonly name: string
}

export class PrismaExporter implements IExporter {
  readonly name = 'prisma'
  readonly label = 'Prisma Schema'

  export(model: ERModel): string {
    // Collect all relations (FK + vFK)
    const relations: RelationRef[] = []
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: fk.columns[0],
          toTable: fk.refTable,
          toColumn: fk.refColumns[0],
          name: fk.name,
        })
      }
      for (const vfk of table.virtualForeignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: vfk.columns[0],
          toTable: vfk.refTable,
          toColumn: vfk.refColumns[0],
          name: vfk.id,
        })
      }
    }

    const blocks: string[] = []

    for (const table of Object.values(model.tables)) {
      blocks.push(this.renderModel(table, relations, model.tables))
    }

    return blocks.join('\n\n')
  }

  private renderModel(
    table: Table,
    allRelations: readonly RelationRef[],
    allTables: Record<string, Table>,
  ): string {
    const lines: string[] = [`model ${toPascalCase(table.name)} {`]

    const pkSet = new Set(table.primaryKey)
    // Track FK columns to avoid duplicating them as plain columns
    const belongsToRelations = allRelations.filter((r) => r.fromTable === table.name)
    const fkColumnNames = new Set(belongsToRelations.map((r) => r.fromColumn))

    // Regular columns
    for (const col of table.columns) {
      if (fkColumnNames.has(col.name) && !pkSet.has(col.name)) {
        // Will be emitted as part of @relation block
        lines.push(`  ${col.name} ${mapSqlTypeToPrisma(col.type, col.nullable)}`)
        continue
      }
      const prismaType = mapSqlTypeToPrisma(col.type, col.nullable)
      const idAttr = pkSet.has(col.name) ? ' @id' : ''
      lines.push(`  ${col.name} ${prismaType}${idAttr}`)
    }

    // belongsTo relations
    for (const rel of belongsToRelations) {
      const refPascal = toPascalCase(rel.toTable)
      lines.push(`  ${rel.toTable} ${refPascal} @relation(fields: [${rel.fromColumn}], references: [${rel.toColumn}])`)
    }

    // hasMany reverse relations (tables that reference this table)
    const hasManyRelations = allRelations.filter((r) => r.toTable === table.name)
    for (const rel of hasManyRelations) {
      // Only emit hasMany if from table exists in model
      if (!(rel.fromTable in allTables)) continue
      lines.push(`  ${rel.fromTable} ${toPascalCase(rel.fromTable)}[]`)
    }

    lines.push('}')
    return lines.join('\n')
  }
}
