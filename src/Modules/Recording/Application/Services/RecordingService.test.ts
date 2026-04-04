// mock.module 必須在其他 import 之前
import { mock } from 'bun:test'

// Mock TcpProxy，避免 unit test 真的 bind TCP port
mock.module('@/Modules/Recording/Infrastructure/Proxy/TcpProxy', () => ({
  TcpProxy: class MockTcpProxy {
    connectionCount = 0
    async start() { return 13306 }
    async stop() {}
  },
}))

import { describe, it, expect } from 'bun:test'
import { RecordingService } from './RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeRepo(): RecordingRepository {
  return {
    openStreams: mock(() => {}),
    closeStreams: mock(async () => {}),
    appendQueries: mock(() => {}),
    appendMarkers: mock(() => {}),
    appendHttpChunks: mock(() => {}),
    saveSession: mock(async () => {}),
    loadSession: mock(async () => null),
    loadQueries: mock(async () => []),
    loadMarkers: mock(async () => []),
    loadHttpChunks: mock(async () => []),
    listSessions: mock(async () => []),
  } as unknown as RecordingRepository
}

function makeParser(): IProtocolParser {
  return {
    extractQuery: mock(() => null),
    parseResponse: mock(() => ({ type: 'ok' as const, affectedRows: 0 })),
  } as unknown as IProtocolParser
}

describe('RecordingService', () => {
  it('start() 呼叫 openStreams 和 saveSession', async () => {
    const repo = makeRepo()
    const svc = new RecordingService(repo, makeParser())

    await svc.start({ listenPort: 0, targetHost: 'localhost', targetPort: 3306 })

    expect(repo.openStreams).toHaveBeenCalledTimes(1)
    expect(repo.saveSession).toHaveBeenCalledTimes(1)
  })

  it('handleQuery 呼叫 appendQueries 並累積 incremental stats', async () => {
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

  it('stop() 呼叫 closeStreams 並回傳含正確 stats 的 stopped session', async () => {
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
