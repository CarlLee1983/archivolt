import { RecordingsDirCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/RecordingsDirCheck'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('RecordingsDirCheck', () => {
  const testDir = path.join(tmpdir(), `archivolt-doctor-test-${Date.now()}`)
  const recordingsDir = path.join(testDir, 'data', 'recordings')

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it('returns error when recordings dir is missing', async () => {
    const check = new RecordingsDirCheck(recordingsDir)
    const result = await check.check()
    expect(result.severity).toBe('error')
    expect(result.fixable).toBe(true)
  })

  it('returns ok when recordings dir exists', async () => {
    mkdirSync(recordingsDir, { recursive: true })
    const check = new RecordingsDirCheck(recordingsDir)
    const result = await check.check()
    expect(result.severity).toBe('ok')
  })

  it('fix creates the directory', async () => {
    const check = new RecordingsDirCheck(recordingsDir)
    const result = await check.fix!()
    expect(result.severity).toBe('ok')
    expect(existsSync(recordingsDir)).toBe(true)
  })
})
