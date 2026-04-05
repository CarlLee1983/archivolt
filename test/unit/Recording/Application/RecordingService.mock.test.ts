import { describe, it, expect, vi } from 'vitest'

vi.mock('@/Modules/Recording/Infrastructure/Proxy/TcpProxy', () => ({
  TcpProxy: class MockTcpProxy {
    connectionCount = 0
    async start() { return 13306 }
    async stop() {}
  },
}))

import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeRepo(): RecordingRepository {
  return {
    openStreams: vi.fn(() => {}),
    closeStreams: vi.fn(async () => {}),
    appendQueries: vi.fn(() => {}),
    appendMarkers: vi.fn(() => {}),
    appendHttpChunks: vi.fn(() => {}),
    saveSession: vi.fn(async () => {}),
    loadSession: vi.fn(async () => null),
    loadQueries: vi.fn(async () => []),
    loadMarkers: vi.fn(async () => []),
    loadHttpChunks: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
  } as unknown as RecordingRepository
}

function makeParser(): IProtocolParser {
  return {
    extractQuery: vi.fn(() => null),
    parseResponse: vi.fn(() => ({ type: 'ok' as const, affectedRows: 0 })),
  } as unknown as IProtocolParser
}

describe('RecordingService (mocked TcpProxy)', () => {
  it('start() calls openStreams and saveSession', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())

    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    expect(repo.openStreams).toHaveBeenCalledTimes(1)
    expect(repo.saveSession).toHaveBeenCalledTimes(1)
  })

  it('handleQuery calls appendQueries and accumulates incremental stats', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())
    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    const q1 = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'SELECT 1',
      operation: 'SELECT', tables: ['users'], duration: 1,
    })
    const q2 = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'INSERT INTO orders VALUES (1)',
      operation: 'INSERT', tables: ['orders'], duration: 2,
    })

    // @ts-expect-error accessing private for test
    svc.handleQuery(q1)
    // @ts-expect-error accessing private for test
    svc.handleQuery(q2)

    expect(repo.appendQueries).toHaveBeenCalledTimes(2)
    // @ts-expect-error accessing private for test
    expect(svc.stats.totalQueries).toBe(2)
    // @ts-expect-error accessing private for test
    expect(svc.stats.byOperation).toEqual({ SELECT: 1, INSERT: 1 })
    // @ts-expect-error accessing private for test
    expect([...svc.stats.tablesAccessed]).toContain('users')
  })

  it('stop() calls closeStreams and returns stopped session with correct stats', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())
    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    const q = createCapturedQuery({
      sessionId: 'x', connectionId: 1, sql: 'SELECT 1',
      operation: 'SELECT', tables: ['users'], duration: 1,
    })
    // @ts-expect-error accessing private for test
    svc.handleQuery(q)

    const stopped = await svc.stop()

    expect(repo.closeStreams).toHaveBeenCalledTimes(1)
    expect(stopped.status).toBe('stopped')
    expect(stopped.stats.totalQueries).toBe(1)
    expect(stopped.stats.tablesAccessed).toContain('users')
  })
})
