import { describe, it, expect, afterEach } from 'vitest'
import { HttpProxyService } from '@/Modules/Recording/Infrastructure/Proxy/HttpProxy'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

let proxy: HttpProxyService | undefined
let mockServer: ReturnType<typeof Bun.serve> | undefined

afterEach(() => {
  proxy?.stop()
  mockServer?.stop(true)
  proxy = undefined
  mockServer = undefined
})

function findFreePort(): number {
  const server = Bun.serve({ port: 0, fetch: () => new Response('') })
  const port = server.port ?? 0
  server.stop(true)
  return port
}

describe('HttpProxyService', () => {
  it('captures request and response chunks when proxying', async () => {
    const targetPort = findFreePort()
    const proxyPort = findFreePort()

    mockServer = Bun.serve({
      port: targetPort,
      fetch(_req) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const capturedChunks: HttpChunk[] = []

    proxy = new HttpProxyService({
      listenPort: proxyPort,
      targetUrl: `http://localhost:${targetPort}`,
      sessionId: 'rec_test',
      onChunk: async (chunks) => {
        capturedChunks.push(...chunks)
      },
    })

    await proxy.start()

    const res = await fetch(`http://localhost:${proxyPort}/api/users/123`)
    expect(res.status).toBe(200)

    // onChunk が呼ばれるまで待つ
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedChunks).toHaveLength(2)

    const reqChunk = capturedChunks.find((c) => c.type === 'http_request')
    const resChunk = capturedChunks.find((c) => c.type === 'http_response')

    expect(reqChunk).toBeDefined()
    expect(reqChunk?.method).toBe('GET')
    expect(reqChunk?.path).toBe('/api/users/123')
    expect(reqChunk?.sessionId).toBe('rec_test')
    expect(reqChunk?.requestId).toBeDefined()

    expect(resChunk).toBeDefined()
    expect(resChunk?.statusCode).toBe(200)
    expect(resChunk?.durationMs).toBeGreaterThanOrEqual(0)
    expect(resChunk?.requestId).toBe(reqChunk?.requestId)
  })

  it('returns the target response body to the caller', async () => {
    const targetPort = findFreePort()
    const proxyPort = findFreePort()

    mockServer = Bun.serve({
      port: targetPort,
      fetch() {
        return new Response('hello world', { status: 201 })
      },
    })

    proxy = new HttpProxyService({
      listenPort: proxyPort,
      targetUrl: `http://localhost:${targetPort}`,
      sessionId: 'rec_2',
      onChunk: async () => {},
    })
    await proxy.start()

    const res = await fetch(`http://localhost:${proxyPort}/`)
    const body = await res.text()

    expect(res.status).toBe(201)
    expect(body).toBe('hello world')
  })
})
