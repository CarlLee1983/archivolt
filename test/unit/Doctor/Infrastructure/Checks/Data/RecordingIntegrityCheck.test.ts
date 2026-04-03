import { RecordingIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/RecordingIntegrityCheck'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

describe('RecordingIntegrityCheck', () => {
  const testDir = path.join(tmpdir(), `recording-integrity-test-${Date.now()}`)

  beforeEach(() => mkdirSync(testDir, { recursive: true }))
  afterEach(() => rmSync(testDir, { recursive: true }))

  it('returns ok when no recordings exist', async () => {
    const check = new RecordingIntegrityCheck(testDir)
    const result = await check.check()
    expect(result.severity).toBe('ok')
    expect(result.message).toContain('0 sessions')
  })

  it('returns ok when sessions are valid', async () => {
    const sessionDir = path.join(testDir, 'session-1')
    mkdirSync(sessionDir)
    writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({ id: 'session-1', status: 'completed' }))
    writeFileSync(path.join(sessionDir, 'queries.jsonl'), '{"sql":"SELECT 1"}\n')

    const check = new RecordingIntegrityCheck(testDir)
    const result = await check.check()
    expect(result.severity).toBe('ok')
    expect(result.message).toContain('1 sessions')
  })

  it('returns warn when session.json is corrupted', async () => {
    const sessionDir = path.join(testDir, 'session-bad')
    mkdirSync(sessionDir)
    writeFileSync(path.join(sessionDir, 'session.json'), 'not json{{{')

    const check = new RecordingIntegrityCheck(testDir)
    const result = await check.check()
    expect(result.severity).toBe('warn')
    expect(result.message).toContain('session-bad')
  })

  it('returns warn when jsonl has corrupted lines', async () => {
    const sessionDir = path.join(testDir, 'session-2')
    mkdirSync(sessionDir)
    writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({ id: 'session-2' }))
    writeFileSync(path.join(sessionDir, 'queries.jsonl'), '{"sql":"SELECT 1"}\nnot json\n')

    const check = new RecordingIntegrityCheck(testDir)
    const result = await check.check()
    expect(result.severity).toBe('warn')
  })
})
