import { describe, it, expect } from 'vitest'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
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
        { name: 'title', type: 'varchar', nullable: 0, primaryKey: 0 },
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

describe('MermaidExporter', () => {
  const exporter = new MermaidExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('mermaid')
    expect(exporter.label).toBe('Mermaid ER Diagram')
  })

  it('outputs erDiagram header', () => {
    const output = exporter.export(model)
    expect(output).toContain('erDiagram')
  })

  it('outputs table column definitions', () => {
    const output = exporter.export(model)
    expect(output).toContain('orders {')
    expect(output).toContain('bigint id')
    expect(output).toContain('users {')
  })

  it('outputs FK relationships', () => {
    const output = exporter.export(model)
    expect(output).toContain('orders }o--|| users')
  })

  it('outputs virtualFK relationships', () => {
    const output = exporter.export(model)
    expect(output).toContain('orders }o--|| products')
  })
})
