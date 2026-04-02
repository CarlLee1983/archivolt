import { describe, it, expect } from 'vitest'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
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
        { name: 'created_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
        { name: 'note', type: 'varchar', nullable: 1, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [],
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

describe('PrismaExporter', () => {
  const exporter = new PrismaExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('prisma')
    expect(exporter.label).toBe('Prisma Schema')
  })

  it('returns ExportResult with schema.prisma file', () => {
    const result = exporter.export(model)
    expect(result.files.has('schema.prisma')).toBe(true)
    expect(result.files.size).toBe(1)
  })

  it('outputs model blocks with PascalCase names', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('model Orders {')
    expect(output).toContain('model Users {')
  })

  it('maps SQL types to Prisma types', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('BigInt')
    expect(output).toContain('String')
    expect(output).toContain('DateTime')
  })

  it('marks primary key with @id', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('@id')
  })

  it('generates belongsTo relation field from FK', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('@relation')
  })

  it('generates hasMany reverse relation in referenced model', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    // users should have orders[] (hasMany)
    expect(output).toContain('orders')
  })

  it('nullable fields use ? suffix', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('DateTime?')
    expect(output).toContain('String?')
  })

  it('outputs datasource block with provider from source.system', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('datasource db {')
    expect(output).toContain('provider = "mysql"')
    expect(output).toContain('url      = env("DATABASE_URL")')
  })

  it('outputs generator block', () => {
    const result = exporter.export(model)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('generator client {')
    expect(output).toContain('provider = "prisma-client-js"')
  })

  it('maps mariadb to mysql provider', () => {
    const mariadbModel: ERModel = {
      ...model,
      source: {
        ...model.source,
        system: 'mariadb',
      },
    }
    const result = exporter.export(mariadbModel)
    const output = result.files.get('schema.prisma')
    expect(output).toContain('provider = "mysql"')
  })
})
