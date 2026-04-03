import { describe, it, expect } from 'vitest'
import {
  addVirtualFK,
  removeVirtualFK,
  confirmSuggestion,
  ignoreSuggestion,
  applyInferredRelations,
} from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

const baseModel: ERModel = {
  source: {
    system: 'mysql',
    database: 'shop',
    importedAt: new Date('2024-01-01'),
    dbcliVersion: '1.0.0',
  },
  tables: {
    orders: {
      name: 'orders',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'user_id', type: 'bigint', nullable: 0, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [
        {
          id: 'vfk_auto_1',
          columns: ['user_id'],
          refTable: 'users',
          refColumns: ['id'],
          confidence: 'auto-suggested',
          createdAt: new Date('2024-01-01'),
        },
      ],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'name', type: 'varchar', nullable: 0, primaryKey: 0 },
      ],
      rowCount: 50,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [],
    },
  },
  groups: {},
}

describe('addVirtualFK', () => {
  it('adds a manual confidence vFK to the specified table', () => {
    const newModel = addVirtualFK(baseModel, {
      tableName: 'users',
      columns: ['order_id'],
      refTable: 'orders',
      refColumns: ['id'],
    })

    const usersVFKs = newModel.tables.users.virtualForeignKeys
    expect(usersVFKs.length).toBe(1)
    expect(usersVFKs[0].columns).toEqual(['order_id'])
    expect(usersVFKs[0].refTable).toBe('orders')
    expect(usersVFKs[0].confidence).toBe('manual')
  })

  it('returns a new model (immutable)', () => {
    const newModel = addVirtualFK(baseModel, {
      tableName: 'users',
      columns: ['order_id'],
      refTable: 'orders',
      refColumns: ['id'],
    })

    expect(newModel).not.toBe(baseModel)
    expect(newModel.tables).not.toBe(baseModel.tables)
    // original model unchanged
    expect(baseModel.tables.users.virtualForeignKeys.length).toBe(0)
  })
})

describe('removeVirtualFK', () => {
  it('removes a vFK by id', () => {
    const newModel = removeVirtualFK(baseModel, 'orders', 'vfk_auto_1')

    expect(newModel.tables.orders.virtualForeignKeys.length).toBe(0)
  })

  it('returns a new model (immutable)', () => {
    const newModel = removeVirtualFK(baseModel, 'orders', 'vfk_auto_1')

    expect(newModel).not.toBe(baseModel)
    // original unchanged
    expect(baseModel.tables.orders.virtualForeignKeys.length).toBe(1)
  })
})

describe('confirmSuggestion', () => {
  it('changes auto-suggested confidence to manual', () => {
    const newModel = confirmSuggestion(baseModel, 'orders', 'vfk_auto_1')

    const vfk = newModel.tables.orders.virtualForeignKeys.find((v) => v.id === 'vfk_auto_1')
    expect(vfk).toBeDefined()
    expect(vfk?.confidence).toBe('manual')
  })

  it('returns a new model (immutable)', () => {
    const newModel = confirmSuggestion(baseModel, 'orders', 'vfk_auto_1')

    expect(newModel).not.toBe(baseModel)
    // original unchanged
    const original = baseModel.tables.orders.virtualForeignKeys.find((v) => v.id === 'vfk_auto_1')
    expect(original?.confidence).toBe('auto-suggested')
  })
})

describe('ignoreSuggestion', () => {
  it('removes the vFK (same effect as removeVirtualFK)', () => {
    const newModel = ignoreSuggestion(baseModel, 'orders', 'vfk_auto_1')

    expect(newModel.tables.orders.virtualForeignKeys.length).toBe(0)
  })

  it('returns a new model (immutable)', () => {
    const newModel = ignoreSuggestion(baseModel, 'orders', 'vfk_auto_1')

    expect(newModel).not.toBe(baseModel)
    expect(baseModel.tables.orders.virtualForeignKeys.length).toBe(1)
  })
})

describe('applyInferredRelations', () => {
  const highRelation: InferredRelation = {
    sourceTable: 'users',
    sourceColumn: 'order_id',
    targetTable: 'orders',
    targetColumn: 'id',
    confidence: 'high',
    evidence: 'column name pattern',
  }

  const lowRelation: InferredRelation = {
    sourceTable: 'users',
    sourceColumn: 'status_id',
    targetTable: 'statuses',
    targetColumn: 'id',
    confidence: 'low',
    evidence: 'weak pattern',
  }

  it('adds inferred relations as auto-suggested vFKs', () => {
    const result = applyInferredRelations(baseModel, [highRelation], 'high')

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(0)
    const usersVFKs = result.model.tables.users.virtualForeignKeys
    expect(usersVFKs.length).toBe(1)
    expect(usersVFKs[0].columns).toEqual(['order_id'])
    expect(usersVFKs[0].refTable).toBe('orders')
    expect(usersVFKs[0].refColumns).toEqual(['id'])
    expect(usersVFKs[0].confidence).toBe('auto-suggested')
  })

  it('skips duplicates when vFK already exists', () => {
    // baseModel.orders already has vFK: user_id -> users.id
    const duplicateRelation: InferredRelation = {
      sourceTable: 'orders',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'existing pattern',
    }

    const result = applyInferredRelations(baseModel, [duplicateRelation], 'low')

    expect(result.added).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.model.tables.orders.virtualForeignKeys.length).toBe(1)
  })

  it('filters by minimum confidence', () => {
    const result = applyInferredRelations(baseModel, [highRelation, lowRelation], 'high')

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.model.tables.users.virtualForeignKeys.length).toBe(1)
  })

  it('returns immutable model', () => {
    const originalVFKCount = baseModel.tables.users.virtualForeignKeys.length
    const result = applyInferredRelations(baseModel, [highRelation], 'high')

    expect(result.model).not.toBe(baseModel)
    expect(baseModel.tables.users.virtualForeignKeys.length).toBe(originalVFKCount)
  })
})
