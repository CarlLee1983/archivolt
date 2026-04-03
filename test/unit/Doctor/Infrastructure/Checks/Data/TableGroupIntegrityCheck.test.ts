import { TableGroupIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/TableGroupIntegrityCheck'
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('TableGroupIntegrityCheck', () => {
  const testDir = path.join(tmpdir(), `group-test-${Date.now()}`)
  const jsonPath = path.join(testDir, 'archivolt.json')

  beforeEach(() => mkdirSync(testDir, { recursive: true }))
  afterEach(() => rmSync(testDir, { recursive: true }))

  it('returns ok when all group references are valid', async () => {
    const model = {
      source: {},
      tables: { users: { name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [], virtualForeignKeys: [] } },
      groups: { auth: { name: 'auth', tables: ['users'], auto: false } },
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new TableGroupIntegrityCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('ok')
  })

  it('returns warn when group references nonexistent table', async () => {
    const model = {
      source: {},
      tables: {},
      groups: { auth: { name: 'auth', tables: ['deleted_table'], auto: false } },
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new TableGroupIntegrityCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('warn')
    expect(result.fixable).toBe(true)
  })

  it('fix removes orphan table references from groups', async () => {
    const model = {
      source: {},
      tables: { users: { name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [], virtualForeignKeys: [] } },
      groups: { auth: { name: 'auth', tables: ['users', 'deleted_table'], auto: false } },
    }
    writeFileSync(jsonPath, JSON.stringify(model))

    const check = new TableGroupIntegrityCheck(jsonPath)
    const fixResult = await check.fix!()

    expect(fixResult.severity).toBe('ok')

    const updated = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(updated.groups.auth.tables).toEqual(['users'])
  })
})
