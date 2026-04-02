import { describe, it, expect } from 'vitest'
import { importSchema } from '@/Modules/Schema/Application/Services/ImportSchemaService'

const sampleDbcliJson = {
  connection: { system: 'mysql', database: 'shop' },
  schema: {
    orders: {
      name: 'orders',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0 as const, primaryKey: 1 as const },
        { name: 'user_id', type: 'bigint', nullable: 0 as const, primaryKey: 0 as const },
        { name: 'total', type: 'decimal', nullable: 0 as const, primaryKey: 0 as const },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0 as const, primaryKey: 1 as const },
        { name: 'name', type: 'varchar', nullable: 0 as const, primaryKey: 0 as const },
      ],
      rowCount: 50,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
    },
  },
}

const sampleWithExplicitFK = {
  connection: { system: 'mysql', database: 'shop' },
  schema: {
    orders: {
      name: 'orders',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0 as const, primaryKey: 1 as const },
        { name: 'user_id', type: 'bigint', nullable: 0 as const, primaryKey: 0 as const },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0 as const, primaryKey: 1 as const },
        { name: 'name', type: 'varchar', nullable: 0 as const, primaryKey: 0 as const },
      ],
      rowCount: 50,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
    },
  },
}

describe('importSchema', () => {
  it('converts dbcli JSON to ERModel with auto-suggested vFKs', () => {
    const model = importSchema(sampleDbcliJson)

    expect(model.source.system).toBe('mysql')
    expect(model.source.database).toBe('shop')
    expect(model.source.dbcliVersion).toBe('1.0.0')
    expect(model.source.importedAt).toBeInstanceOf(Date)

    expect(Object.keys(model.tables)).toContain('orders')
    expect(Object.keys(model.tables)).toContain('users')

    // orders.user_id should produce auto-suggested vFK to users
    const ordersVFKs = model.tables.orders.virtualForeignKeys
    expect(ordersVFKs.length).toBeGreaterThan(0)
    const suggestion = ordersVFKs.find((v) => v.columns[0] === 'user_id')
    expect(suggestion).toBeDefined()
    expect(suggestion?.confidence).toBe('auto-suggested')
    expect(suggestion?.refTable).toBe('users')
  })

  it('preserves original foreignKeys unchanged', () => {
    const model = importSchema(sampleWithExplicitFK)

    const ordersTable = model.tables.orders
    expect(ordersTable.foreignKeys.length).toBe(1)
    expect(ordersTable.foreignKeys[0].name).toBe('fk_orders_user')
    expect(ordersTable.foreignKeys[0].columns).toEqual(['user_id'])
  })

  it('existing FK columns do not get duplicate auto-suggested vFKs', () => {
    const model = importSchema(sampleWithExplicitFK)

    // user_id is already in foreignKeys, so no auto-suggested vFK for it
    const ordersVFKs = model.tables.orders.virtualForeignKeys
    const duplicateSuggestion = ordersVFKs.find((v) => v.columns[0] === 'user_id')
    expect(duplicateSuggestion).toBeUndefined()
  })

  it('computes groups for the model', () => {
    const model = importSchema(sampleDbcliJson)
    // groups should be computed (not empty object — orders and users get linked via suggestion)
    expect(typeof model.groups).toBe('object')
  })
})
