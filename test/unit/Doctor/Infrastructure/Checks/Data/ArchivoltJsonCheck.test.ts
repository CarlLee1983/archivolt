import { ArchivoltJsonCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/ArchivoltJsonCheck'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('ArchivoltJsonCheck', () => {
  const testDir = path.join(tmpdir(), `archivolt-json-test-${Date.now()}`)
  const jsonPath = path.join(testDir, 'archivolt.json')

  beforeEach(() => mkdirSync(testDir, { recursive: true }))
  afterEach(() => rmSync(testDir, { recursive: true }))

  it('returns error when file does not exist', async () => {
    const check = new ArchivoltJsonCheck(path.join(testDir, 'nonexistent.json'))
    const result = await check.check()
    expect(result.severity).toBe('error')
    expect(result.fixable).toBe(false)
  })

  it('returns error when file is invalid JSON', async () => {
    writeFileSync(jsonPath, 'not valid json{{{')
    const check = new ArchivoltJsonCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('error')
  })

  it('returns ok when file is valid JSON', async () => {
    writeFileSync(jsonPath, JSON.stringify({ source: {}, tables: {}, groups: {} }))
    const check = new ArchivoltJsonCheck(jsonPath)
    const result = await check.check()
    expect(result.severity).toBe('ok')
  })
})
