import { describe, it, expect } from 'vitest'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

const model: ERModel = {
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
        { name: 'total', type: 'decimal', nullable: 1, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [
        {
          id: 'vfk_1',
          columns: ['product_id'],
          refTable: 'products',
          refColumns: ['id'],
          confidence: 'auto-suggested',
          createdAt: new Date(),
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
    products: {
      name: 'products',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
      ],
      rowCount: 200,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [],
    },
  },
  groups: {},
}

describe('DbmlExporter', () => {
  const exporter = new DbmlExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('dbml')
    expect(exporter.label).toBe('DBML')
  })

  it('outputs Table definitions', () => {
    const output = exporter.export(model)
    expect(output).toContain('Table orders {')
    expect(output).toContain('Table users {')
  })

  it('outputs columns inside table blocks', () => {
    const output = exporter.export(model)
    expect(output).toContain('id bigint')
    expect(output).toContain('user_id bigint')
  })

  it('outputs Ref for FK relationships', () => {
    const output = exporter.export(model)
    expect(output).toContain('Ref: orders.user_id > users.id')
  })

  it('outputs Ref for virtualFK relationships', () => {
    const output = exporter.export(model)
    expect(output).toContain('Ref: orders.product_id > products.id')
  })
})
