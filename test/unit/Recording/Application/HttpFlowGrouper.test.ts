import { describe, it, expect } from 'vitest'
import { normalizePath, pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

function makeRequest(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_request',
    timestamp: 1000,
    sessionId: 'rec_1',
    requestId: 'req-1',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    requestHeaders: {},
    ...overrides,
  }
}

function makeResponse(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_response',
    timestamp: 1050,
    sessionId: 'rec_1',
    requestId: 'req-1',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    statusCode: 200,
    durationMs: 50,
    requestHeaders: {},
    responseHeaders: {},
    ...overrides,
  }
}

describe('normalizePath', () => {
  it('replaces numeric segments with :id', () => {
    expect(normalizePath('/users/123')).toBe('/users/:id')
    expect(normalizePath('/orders/456/items')).toBe('/orders/:id/items')
  })

  it('replaces UUID segments with :uuid', () => {
    expect(normalizePath('/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/users/:uuid')
  })

  it('leaves non-dynamic segments unchanged', () => {
    expect(normalizePath('/users')).toBe('/users')
    expect(normalizePath('/api/v1/users')).toBe('/api/v1/users')
  })

  it('handles mixed segments', () => {
    expect(normalizePath('/users/123/orders/456')).toBe('/users/:id/orders/:id')
  })

  it('handles root path', () => {
    expect(normalizePath('/')).toBe('/')
  })

  it('handles UUID with uppercase', () => {
    expect(normalizePath('/items/550E8400-E29B-41D4-A716-446655440000')).toBe('/items/:uuid')
  })

  it('leaves empty segments from trailing slashes', () => {
    expect(normalizePath('/users/123/')).toBe('/users/:id/')
  })
})

describe('pairHttpChunks', () => {
  it('pairs request and response by requestId', () => {
    const req = makeRequest({ requestId: 'req-1', timestamp: 1000, method: 'GET', path: '/users/123' })
    const res = makeResponse({ requestId: 'req-1', timestamp: 1050, statusCode: 200, durationMs: 50 })
    const flows = pairHttpChunks([req, res])
    expect(flows).toHaveLength(1)
    expect(flows[0].requestId).toBe('req-1')
    expect(flows[0].method).toBe('GET')
    expect(flows[0].path).toBe('/users/:id')
    expect(flows[0].statusCode).toBe(200)
    expect(flows[0].durationMs).toBe(50)
    expect(flows[0].startTimestamp).toBe(1000)
    expect(flows[0].dbQueries).toEqual([])
  })

  it('skips requests with no matching response', () => {
    const req = makeRequest({ requestId: 'req-orphan' })
    const flows = pairHttpChunks([req])
    expect(flows).toHaveLength(0)
  })

  it('handles multiple request-response pairs sorted by startTimestamp', () => {
    const req1 = makeRequest({ requestId: 'req-1', timestamp: 2000 })
    const res1 = makeResponse({ requestId: 'req-1', timestamp: 2050, durationMs: 50 })
    const req2 = makeRequest({ requestId: 'req-2', timestamp: 1000, path: '/orders/99' })
    const res2 = makeResponse({ requestId: 'req-2', timestamp: 1030, durationMs: 30, path: '/orders/99' })

    const flows = pairHttpChunks([req1, res1, req2, res2])
    expect(flows).toHaveLength(2)
    expect(flows[0].startTimestamp).toBe(1000) // sorted ascending
    expect(flows[1].startTimestamp).toBe(2000)
  })

  it('normalizes path in the flow', () => {
    const req = makeRequest({ requestId: 'req-1', path: '/orders/789/items' })
    const res = makeResponse({ requestId: 'req-1' })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].path).toBe('/orders/:id/items')
  })

  it('computes requestBodySize and responseBodySize from body lengths', () => {
    const req = makeRequest({ requestId: 'req-1', requestBody: 'hello' })
    const res = makeResponse({ requestId: 'req-1', responseBody: 'world response' })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].requestBodySize).toBe(5)
    expect(flows[0].responseBodySize).toBe(14)
  })

  it('handles missing body as size 0', () => {
    const req = makeRequest({ requestId: 'req-1', requestBody: undefined })
    const res = makeResponse({ requestId: 'req-1', responseBody: undefined })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].requestBodySize).toBe(0)
    expect(flows[0].responseBodySize).toBe(0)
  })

  it('preserves sessionId from request', () => {
    const req = makeRequest({ requestId: 'req-1', sessionId: 'session-abc' })
    const res = makeResponse({ requestId: 'req-1', sessionId: 'session-abc' })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].sessionId).toBe('session-abc')
  })

  it('handles POST request with body', () => {
    const req = makeRequest({
      requestId: 'post-1',
      method: 'POST',
      path: '/users',
      requestBody: JSON.stringify({ name: 'Alice' }),
    })
    const res = makeResponse({
      requestId: 'post-1',
      statusCode: 201,
      responseBody: JSON.stringify({ id: 1, name: 'Alice' }),
    })
    const flows = pairHttpChunks([req, res])
    expect(flows[0].method).toBe('POST')
    expect(flows[0].statusCode).toBe(201)
    expect(flows[0].requestBodySize).toBeGreaterThan(0)
  })

  it('returns empty array for empty chunks', () => {
    const flows = pairHttpChunks([])
    expect(flows).toEqual([])
  })

  it('handles response without statusCode (defaults to 0)', () => {
    const req = makeRequest({ requestId: 'req-1' })
    const res = { ...makeResponse({ requestId: 'req-1' }), statusCode: undefined }
    const flows = pairHttpChunks([req, res])
    expect(flows[0].statusCode).toBe(0)
  })

  it('handles response without durationMs (defaults to 0)', () => {
    const req = makeRequest({ requestId: 'req-1' })
    const res = { ...makeResponse({ requestId: 'req-1' }), durationMs: undefined }
    const flows = pairHttpChunks([req, res])
    expect(flows[0].durationMs).toBe(0)
  })
})
