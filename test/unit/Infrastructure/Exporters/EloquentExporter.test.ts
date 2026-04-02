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

  it('returns one file per table', () => {
    const result = exporter.export(model)
    expect(result.files.size).toBe(2)
    expect(result.files.has('Order.php')).toBe(true)
    expect(result.files.has('User.php')).toBe(true)
  })

  it('outputs PHP namespace and class', () => {
    const result = exporter.export(model)
    const orderFile = result.files.get('Order.php')!
    const userFile = result.files.get('User.php')!
    expect(orderFile).toContain('namespace App\\Models;')
    expect(orderFile).toContain('class Order extends Model')
    expect(userFile).toContain('namespace App\\Models;')
    expect(userFile).toContain('class User extends Model')
  })

  it('outputs $table property', () => {
    const result = exporter.export(model)
    expect(result.files.get('Order.php')).toContain("protected $table = 'orders';")
    expect(result.files.get('User.php')).toContain("protected $table = 'users';")
  })

  it('outputs $fillable with non-PK columns', () => {
    const result = exporter.export(model)
    const orderFile = result.files.get('Order.php')!
    expect(orderFile).toContain("'user_id'")
    expect(orderFile).toContain("'total'")
  })

  it('uses SoftDeletes when deleted_at column exists', () => {
    const result = exporter.export(model)
    expect(result.files.get('Order.php')).toContain('SoftDeletes')
  })

  it('generates belongsTo method from FK', () => {
    const result = exporter.export(model)
    const orderFile = result.files.get('Order.php')!
    expect(orderFile).toContain('public function user()')
    expect(orderFile).toContain('return $this->belongsTo')
  })

  it('generates hasMany method in referenced model', () => {
    const result = exporter.export(model)
    const userFile = result.files.get('User.php')!
    expect(userFile).toContain('public function orders()')
    expect(userFile).toContain('return $this->hasMany')
  })

  it('detects $timestamps from created_at/updated_at columns', () => {
    const result = exporter.export(model)
    // orders does NOT have both created_at and updated_at → timestamps should be false
    expect(result.files.get('Order.php')).toContain('public $timestamps = false;')
    // users has created_at and updated_at → $timestamps not set to false
    expect(result.files.get('User.php')).not.toContain('public $timestamps = false;')
  })
})
