import { describe, it, expect, vi } from 'vitest'
import { StatusController } from '@/Modules/Recording/Presentation/Controllers/StatusController'

function makeCtx(overrides: Partial<{ json: any }> = {}) {
  return {
    json: vi.fn((data: unknown) => new Response(JSON.stringify(data))),
    ...overrides,
  } as any
}

function makeService(overrides: Partial<{ isRecording: boolean; proxyPort: number | null }> = {}) {
  return {
    isRecording: false,
    proxyPort: null,
    status: vi.fn(() => null),
    getHttpProxyStatus: vi.fn(() => ({ running: false, port: null, target: null })),
    getProtocol: vi.fn(() => null),
    ...overrides,
  } as any
}

function makeRepo() {
  return {
    exists: vi.fn(async () => true),
    getTableCount: vi.fn(async () => 0),
    hasGroups: vi.fn(async () => false),
  } as any
}

describe('StatusController', () => {
  it('returns complete system snapshot when proxy is not running', async () => {
    const ctrl = new StatusController(makeService(), makeRepo())
    const ctx = makeCtx()
    await ctrl.getStatus(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.success).toBe(true)
    expect(call.data.proxy.db.running).toBe(false)
    expect(call.data.proxy.http.running).toBe(false)
    expect(call.data.schema.loaded).toBe(true)
  })

  it('returns proxy port when DB proxy is running', async () => {
    const ctrl = new StatusController(
      makeService({ isRecording: true, proxyPort: 13306 }),
      makeRepo(),
    )
    const ctx = makeCtx()
    await ctrl.getStatus(ctx)
    const call = ctx.json.mock.calls[0][0]
    expect(call.data.proxy.db.running).toBe(true)
    expect(call.data.proxy.db.port).toBe(13306)
  })
})
