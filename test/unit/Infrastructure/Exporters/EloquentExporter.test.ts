import { describe, it, expect } from 'vitest'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
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
        { name: 'total', type: 'decimal', nullable: 0, primaryKey: 0 },
        { name: 'deleted_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
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
        { name: 'created_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
        { name: 'updated_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
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

describe('EloquentExporter', () => {
  const exporter = new EloquentExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('eloquent')
    expect(exporter.label).toBe('Laravel Eloquent Models')
  })

  it('outputs PHP namespace and class', () => {
    const output = exporter.export(model)
    expect(output).toContain('namespace App\\Models;')
    expect(output).toContain('class Order extends Model')
    expect(output).toContain('class User extends Model')
  })

  it('outputs $table property', () => {
    const output = exporter.export(model)
    expect(output).toContain("protected $table = 'orders';")
    expect(output).toContain("protected $table = 'users';")
  })

  it('outputs $fillable with non-PK columns', () => {
    const output = exporter.export(model)
    expect(output).toContain("'user_id'")
    expect(output).toContain("'total'")
  })

  it('uses SoftDeletes when deleted_at column exists', () => {
    const output = exporter.export(model)
    expect(output).toContain('SoftDeletes')
  })

  it('generates belongsTo method from FK', () => {
    const output = exporter.export(model)
    expect(output).toContain('public function user()')
    expect(output).toContain('return $this->belongsTo')
  })

  it('generates hasMany method in referenced model', () => {
    const output = exporter.export(model)
    // users has hasMany orders
    expect(output).toContain('public function orders()')
    expect(output).toContain('return $this->hasMany')
  })

  it('separates models with // --- delimiter', () => {
    const output = exporter.export(model)
    expect(output).toContain('// ---')
  })

  it('detects $timestamps from created_at/updated_at columns', () => {
    const output = exporter.export(model)
    // users has created_at and updated_at → $timestamps not set to false
    // orders does NOT have both → timestamps should be false
    expect(output).toContain('public $timestamps = false;')
  })
})
