// test/unit/Recording/Application/AnalysisService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAnalysis } from '@/Modules/Recording/Application/Services/AnalysisService'
import * as fsPromises from 'node:fs/promises'

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true), mkdirSync: vi.fn() }))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }))

const mockRepo = {
  loadSession: vi.fn().mockResolvedValue({
    id: 'test-session',
    startedAt: Date.now(),
    status: 'stopped',
    proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
    stats: { totalQueries: 2, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
  }),
  loadQueries: vi.fn().mockResolvedValue([
    { id: 'q1', sessionId: 'test-session', sql: 'SELECT * FROM users', normalizedSql: 'SELECT * FROM users', operation: 'SELECT', tables: ['users'], timestamp: Date.now(), connectionId: 1, durationMs: 1 },
    { id: 'q2', sessionId: 'test-session', sql: 'SELECT * FROM users', normalizedSql: 'SELECT * FROM users', operation: 'SELECT', tables: ['users'], timestamp: Date.now() + 100, connectionId: 1, durationMs: 1 },
  ]),
  loadMarkers: vi.fn().mockResolvedValue([]),
  loadHttpChunks: vi.fn().mockResolvedValue([]),
}

vi.mock('@/Modules/Recording/Infrastructure/Persistence/RecordingRepository', () => ({
  RecordingRepository: vi.fn().mockImplementation(() => mockRepo),
}))

describe('AnalysisService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls onProgress with session load message for manifest type', async () => {
    const logs: string[] = []
    await runAnalysis('test-session', 'manifest', (m) => logs.push(m), 'data/recordings')
    expect(logs[0]).toMatch(/Loaded session/)
    expect(logs[0]).toMatch(/2 queries/)
  })

  it('writes manifest.md and manifest.json for manifest type', async () => {
    await runAnalysis('test-session', 'manifest', () => {}, 'data/recordings')
    const writeFileMock = vi.mocked(fsPromises.writeFile)
    const paths = writeFileMock.mock.calls.map(([p]) => p as string)
    expect(paths.some((p) => p.endsWith('manifest.md'))).toBe(true)
    expect(paths.some((p) => p.endsWith('manifest.json'))).toBe(true)
  })

  it('writes optimization-report.md and optimization-report.json for optimize type', async () => {
    await runAnalysis('test-session', 'optimize', () => {}, 'data/recordings')
    const writeFileMock = vi.mocked(fsPromises.writeFile)
    const paths = writeFileMock.mock.calls.map(([p]) => p as string)
    expect(paths.some((p) => p.endsWith('optimization-report.md'))).toBe(true)
    expect(paths.some((p) => p.endsWith('optimization-report.json'))).toBe(true)
  })

  it('calls onProgress with done message', async () => {
    const logs: string[] = []
    await runAnalysis('test-session', 'manifest', (m) => logs.push(m), 'data/recordings')
    expect(logs[logs.length - 1]).toMatch(/written/)
  })

  it('throws if session not found', async () => {
    mockRepo.loadSession.mockResolvedValueOnce(null)
    await expect(runAnalysis('missing', 'manifest', () => {}, 'data/recordings'))
      .rejects.toThrow('Session not found: missing')
  })
})
