import { SchemaStructureCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/SchemaStructureCheck'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('SchemaStructureCheck', () => {
  const testDir = path.join(tmpdir(), `schema-struct-test-${Date.now()}`)
  const jsonPath = path.join(testDir, 'archivolt.json')

  beforeEach(() => mkdirSync(testDir, { recursive: true }))
  afterEach(() => rmSync(testDir, { recursive: true }))

  it('returns error when source field is missing', async () => {
    writeFileSync(jsonPath, JSON.stringify({ tables: {}, groups: {} }))
    const check = new SchemaStructureCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('error')
    expect(result.message).toContain('source')
  })

  it('returns error when tables field is missing', async () => {
    writeFileSync(jsonPath, JSON.stringify({ source: {}, groups: {} }))
    const check = new SchemaStructureCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('error')
    expect(result.message).toContain('tables')
  })

  it('returns ok with valid structure', async () => {
    const model = {
      source: { system: 'mysql', database: 'test', importedAt: new Date(), dbcliVersion: '1.0' },
      tables: { users: { name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: [], foreignKeys: [], virtualForeignKeys: [] } },
      groups: {},
    }
    writeFileSync(jsonPath, JSON.stringify(model))
    const check = new SchemaStructureCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('ok')
    expect(result.message).toContain('1 tables')
  })

  it('returns warn when file does not exist', async () => {
    const check = new SchemaStructureCheck(path.join(testDir, 'missing.json'))
    const result = await check.check()
    expect(result.severity).toBe('warn')
  })
})
