import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'

export interface AddVirtualFKParams {
  readonly tableName: string
  readonly columns: string[]
  readonly refTable: string
  readonly refColumns: string[]
}

export function addVirtualFK(model: ERModel, params: AddVirtualFKParams): ERModel {
  const table = model.tables[params.tableName]
  const newVFK = createVirtualFK(params.columns, params.refTable, params.refColumns, 'manual')
  return {
    ...model,
    tables: {
      ...model.tables,
      [params.tableName]: {
        ...table,
        virtualForeignKeys: [...table.virtualForeignKeys, newVFK],
      },
    },
  }
}

export function removeVirtualFK(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.filter((v) => v.id !== vfkId),
      },
    },
  }
}

export function confirmSuggestion(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((v) =>
          v.id === vfkId ? { ...v, confidence: 'manual' as const } : v,
        ),
      },
    },
  }
}

export function ignoreSuggestion(model: ERModel, tableName: string, vfkId: string): ERModel {
  return removeVirtualFK(model, tableName, vfkId)
}
