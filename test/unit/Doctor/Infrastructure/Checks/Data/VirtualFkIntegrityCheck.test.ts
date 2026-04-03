import { VirtualFkIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/VirtualFkIntegrityCheck'
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('VirtualFkIntegrityCheck', () => {
  const testDir = path.join(tmpdir(), `vfk-test-${Date.now()}`)
  const jsonPath = path.join(testDir, 'archivolt.json')

  beforeEach(() => mkdirSync(testDir, { recursive: true }))
  afterEach(() => rmSync(testDir, { recursive: true }))

  it('returns ok when all vFK references are valid', async () => {
    const model = {
      source: {},
      tables: {
        orders: {
          name: 'orders',
          columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [],
          virtualForeignKeys: [{
            id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'],
            confidence: 'manual', createdAt: new Date(),
          }],
        },
        users: {
          name: 'users',
          columns: [{ name: 'id', type: 'int', nullable: 0, primaryKey: 1 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [],
          virtualForeignKeys: [],
        },
      },
      groups: {},
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new VirtualFkIntegrityCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('ok')
  })

  it('returns warn when vFK references nonexistent table', async () => {
    const model = {
      source: {},
      tables: {
        orders: {
          name: 'orders',
          columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [],
          virtualForeignKeys: [{
            id: 'vfk_1', columns: ['user_id'], refTable: 'deleted_table', refColumns: ['id'],
            confidence: 'manual', createdAt: new Date(),
          }],
        },
      },
      groups: {},
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new VirtualFkIntegrityCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('warn')
    expect(result.fixable).toBe(true)
    expect(result.message).toContain('1')
  })

  it('returns warn when vFK references nonexistent column', async () => {
    const model = {
      source: {},
      tables: {
        orders: {
          name: 'orders',
          columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [],
          virtualForeignKeys: [{
            id: 'vfk_1', columns: ['nonexistent_col'], refTable: 'users', refColumns: ['id'],
            confidence: 'manual', createdAt: new Date(),
          }],
        },
        users: {
          name: 'users',
          columns: [{ name: 'id', type: 'int', nullable: 0, primaryKey: 1 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [],
          virtualForeignKeys: [],
        },
      },
      groups: {},
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new VirtualFkIntegrityCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('warn')
    expect(result.fixable).toBe(true)
  })

  it('fix removes orphan vFKs', async () => {
    const model = {
      source: {},
      tables: {
        orders: {
          name: 'orders',
          columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
          rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [],
          virtualForeignKeys: [
            { id: 'vfk_1', columns: ['user_id'], refTable: 'deleted_table', refColumns: ['id'], confidence: 'manual', createdAt: new Date() },
            { id: 'vfk_2', columns: ['user_id'], refTable: 'orders', refColumns: ['user_id'], confidence: 'manual', createdAt: new Date() },
          ],
        },
      },
      groups: {},
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new VirtualFkIntegrityCheck(jsonPath)
    const fixResult = await check.fix!()

    expect(fixResult.severity).toBe('ok')

    const updated = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(updated.tables.orders.virtualForeignKeys).toHaveLength(1)
    expect(updated.tables.orders.virtualForeignKeys[0].id).toBe('vfk_2')
  })
})
