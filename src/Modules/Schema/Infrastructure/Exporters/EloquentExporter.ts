import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

function toPascalCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function toSingularPascalCase(tableName: string): string {
  // Simple singularization: remove trailing 's' or 'es'
  let singular = tableName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('es') && singular.length > 3) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && singular.length > 1) {
    singular = singular.slice(0, -1)
  }
  return toPascalCase(singular)
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

interface RelationRef {
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
}

export class EloquentExporter implements IExporter {
  readonly name = 'eloquent'
  readonly label = 'Laravel Eloquent Models'

  export(model: ERModel): string {
    // Collect all relations
    const relations: RelationRef[] = []
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: fk.columns[0],
          toTable: fk.refTable,
          toColumn: fk.refColumns[0],
        })
      }
      for (const vfk of table.virtualForeignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: vfk.columns[0],
          toTable: vfk.refTable,
          toColumn: vfk.refColumns[0],
        })
      }
    }

    const models: string[] = []
    for (const table of Object.values(model.tables)) {
      models.push(this.renderModel(table, relations, model.tables))
    }

    return models.join('\n\n// ---\n\n')
  }

  private renderModel(
    table: Table,
    allRelations: readonly RelationRef[],
    allTables: Record<string, Table>,
  ): string {
    const className = toSingularPascalCase(table.name)
    const pkSet = new Set(table.primaryKey)
    const colNames = table.columns.map((c) => c.name)
    const hasSoftDeletes = colNames.includes('deleted_at')
    const hasTimestamps = colNames.includes('created_at') && colNames.includes('updated_at')

    const lines: string[] = []

    lines.push('<?php')
    lines.push('')
    lines.push('namespace App\\Models;')
    lines.push('')
    lines.push('use Illuminate\\Database\\Eloquent\\Model;')
    if (hasSoftDeletes) {
      lines.push('use Illuminate\\Database\\Eloquent\\SoftDeletes;')
    }
    lines.push('')
    lines.push(`class ${className} extends Model`)
    lines.push('{')
    if (hasSoftDeletes) {
      lines.push('    use SoftDeletes;')
      lines.push('')
    }

    lines.push(`    protected $table = '${table.name}';`)
    lines.push('')

    if (!hasTimestamps) {
      lines.push('    public $timestamps = false;')
      lines.push('')
    }

    // $fillable — non-PK columns, excluding timestamps
    const timestampCols = new Set(['created_at', 'updated_at', 'deleted_at'])
    const fillable = table.columns
      .filter((c) => !pkSet.has(c.name) && !timestampCols.has(c.name))
      .map((c) => `'${c.name}'`)
    if (fillable.length > 0) {
      lines.push(`    protected $fillable = [${fillable.join(', ')}];`)
      lines.push('')
    }

    // belongsTo relations
    const belongsToRels = allRelations.filter((r) => r.fromTable === table.name)
    for (const rel of belongsToRels) {
      const methodName = toCamelCase(toSingularPascalCase(rel.toTable))
      const relClass = toSingularPascalCase(rel.toTable)
      lines.push(`    public function ${methodName}()`)
      lines.push('    {')
      lines.push(`        return $this->belongsTo(${relClass}::class, '${rel.fromColumn}', '${rel.toColumn}');`)
      lines.push('    }')
      lines.push('')
    }

    // hasMany reverse relations
    const hasManyRels = allRelations.filter(
      (r) => r.toTable === table.name && r.fromTable in allTables,
    )
    for (const rel of hasManyRels) {
      const methodName = rel.fromTable // plural snake_case
      const relClass = toSingularPascalCase(rel.fromTable)
      lines.push(`    public function ${methodName}()`)
      lines.push('    {')
      lines.push(`        return $this->hasMany(${relClass}::class, '${rel.fromColumn}', '${rel.toColumn}');`)
      lines.push('    }')
      lines.push('')
    }

    lines.push('}')

    return lines.join('\n')
  }
}
