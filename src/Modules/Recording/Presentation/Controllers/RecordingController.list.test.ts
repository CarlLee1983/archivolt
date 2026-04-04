import { describe, it, expect, vi } from 'vitest'
import { RecordingController } from './RecordingController'

function makeCtx(body: unknown = {}) {
  return {
    getBody: async () => body,
    getParam: vi.fn(() => undefined),
    getQuery: vi.fn(() => undefined),
    json: vi.fn((data: unknown) => new Response(JSON.stringify(data))),
  } as any
}

function makeService() {
  return {
    isRecording: false,
    proxyPort: null,
    start: vi.fn(async () => ({
      id: 'sess-1',
      status: 'recording',
      startedAt: Date.now(),
      proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
      stats: { totalQueries: 0, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
    })),
    stop: vi.fn(),
    status: vi.fn(() => null),
    addMarker: vi.fn(),
    getHttpProxyStatus: vi.fn(() => ({ running: false, port: null, target: null })),
    getLiveStats: vi.fn(() => null),
    startHttpProxy: vi.fn(async () => {}),
  } as any
}

function makeRepo() {
  return {
    listSessions: vi.fn(async () => [
      {
        id: 'sess-1',
        startedAt: Date.now(),
        status: 'stopped',
        stats: { totalQueries: 42 },
      },
    ]),
    loadSession: vi.fn(),
    loadQueries: vi.fn(async () => []),
    loadMarkers: vi.fn(async () => []),
    loadHttpChunks: vi.fn(async () => []),
  } as any
}

describe('RecordingController.list', () => {
  it('sessions 列表包含 httpChunkCount、hasManifest、hasOptimizationReport', async () => {
    const ctrl = new RecordingController(makeService(), makeRepo(), {} as any)
    const ctx = makeCtx()
    await ctrl.list(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.success).toBe(true)
    expect(call.data[0]).toHaveProperty('httpChunkCount')
    expect(call.data[0]).toHaveProperty('hasManifest')
    expect(call.data[0]).toHaveProperty('hasOptimizationReport')
    expect(call.data[0].httpChunkCount).toBe(0)
  })
})
