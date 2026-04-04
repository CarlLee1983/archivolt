import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

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
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((v) =>
          v.id === vfkId ? { ...v, confidence: 'ignored' as const } : v,
        ),
      },
    },
  }
}

export function restoreIgnored(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((v) =>
          v.id === vfkId ? { ...v, confidence: 'auto-suggested' as const } : v,
        ),
      },
    },
  }
}

const CONFIDENCE_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export interface ApplyInferredRelationsResult {
  readonly model: ERModel
  readonly added: number
  readonly skipped: number
}

export function applyInferredRelations(
  model: ERModel,
  relations: readonly InferredRelation[],
  minConfidence: 'high' | 'medium' | 'low',
): ApplyInferredRelationsResult {
  const minRank = CONFIDENCE_RANK[minConfidence]
  let currentModel = model
  let added = 0
  let skipped = 0

  for (const relation of relations) {
    if (CONFIDENCE_RANK[relation.confidence] < minRank) {
      skipped++
      continue
    }

    const table = currentModel.tables[relation.sourceTable]
    if (!table) {
      skipped++
      continue
    }

    const isDuplicate =
      table.virtualForeignKeys.some(
        (vfk) =>
          vfk.columns.includes(relation.sourceColumn) &&
          vfk.refTable === relation.targetTable &&
          vfk.refColumns.includes(relation.targetColumn),
      ) ||
      table.foreignKeys.some(
        (fk) =>
          fk.columns.includes(relation.sourceColumn) &&
          fk.refTable === relation.targetTable &&
          fk.refColumns.includes(relation.targetColumn),
      )

    if (isDuplicate) {
      skipped++
      continue
    }

    const withVFK = addVirtualFK(currentModel, {
      tableName: relation.sourceTable,
      columns: [relation.sourceColumn],
      refTable: relation.targetTable,
      refColumns: [relation.targetColumn],
    })

    const addedVFKs = withVFK.tables[relation.sourceTable].virtualForeignKeys
    const newVFKId = addedVFKs[addedVFKs.length - 1].id

    currentModel = {
      ...withVFK,
      tables: {
        ...withVFK.tables,
        [relation.sourceTable]: {
          ...withVFK.tables[relation.sourceTable],
          virtualForeignKeys: withVFK.tables[relation.sourceTable].virtualForeignKeys.map((vfk) =>
            vfk.id === newVFKId ? { ...vfk, confidence: 'auto-suggested' as const } : vfk,
          ),
        },
      },
    }

    added++
  }

  return { model: currentModel, added, skipped }
}
