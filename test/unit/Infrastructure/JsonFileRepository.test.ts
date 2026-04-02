import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'

const tmpPath = join(tmpdir(), `archivolt-test-${Date.now()}.json`)

const sampleModel: ERModel = {
  source: {
    system: 'mysql',
    database: 'test_db',
    importedAt: new Date('2024-01-01T00:00:00Z'),
    dbcliVersion: '1.0.0',
  },
  tables: {
    users: {
      name: 'users',
      columns: [{ name: 'id', type: 'int', nullable: 0, primaryKey: 1 }],
      rowCount: 10,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [],
    },
  },
  groups: {
    '未分類': { name: '未分類', tables: ['users'], auto: true },
  },
}

afterEach(() => {
  if (existsSync(tmpPath)) unlinkSync(tmpPath)
})

describe('JsonFileRepository', () => {
  it('should save and load roundtrip', async () => {
    const repo = new JsonFileRepository(tmpPath)
    await repo.save(sampleModel)
    const loaded = await repo.load()
    expect(loaded).not.toBeNull()
    expect(loaded?.source.database).toBe('test_db')
    expect(loaded?.tables['users'].name).toBe('users')
    expect(loaded?.groups['未分類'].tables).toContain('users')
  })

  it('should return null when file does not exist', async () => {
    const repo = new JsonFileRepository(tmpPath)
    const loaded = await repo.load()
    expect(loaded).toBeNull()
  })

  it('should return false for exists() when file missing', async () => {
    const repo = new JsonFileRepository(tmpPath)
    expect(await repo.exists()).toBe(false)
  })

  it('should return true for exists() after save', async () => {
    const repo = new JsonFileRepository(tmpPath)
    await repo.save(sampleModel)
    expect(await repo.exists()).toBe(true)
  })

  it('should preserve Date fields as ISO strings on roundtrip', async () => {
    const repo = new JsonFileRepository(tmpPath)
    await repo.save(sampleModel)
    const loaded = await repo.load()
    // importedAt is stored as ISO string and returned as string (JSON does not hydrate Dates)
    expect(typeof loaded?.source.importedAt).toBe('string')
  })
})
