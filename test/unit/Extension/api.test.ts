import { describe, it, expect, mock, afterEach } from 'bun:test'

describe('ExtensionApi', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    ;(globalThis as any).fetch = originalFetch
  })

  describe('checkStatus', () => {
    it('should return session id when recording is active', async () => {
      ;(globalThis as any).fetch = mock(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: true, session: { id: 'sess-123' } },
        }),
      } as any))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: true, sessionId: 'sess-123' })
    })

    it('should return not recording when no active session', async () => {
      ;(globalThis as any).fetch = mock(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: false },
        }),
      } as any))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: false, sessionId: null })
    })
  })

  describe('sendMarker', () => {
    it('should POST marker and return success', async () => {
      ;(globalThis as any).fetch = mock(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'marker-1', sessionId: 'sess-123', timestamp: 1000, url: '/test', action: 'click' },
        }),
      } as any))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'click', target: 'button.save' })

      expect(result.success).toBe(true)
    })

    it('should return error when no active session', async () => {
      ;(globalThis as any).fetch = mock(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NO_ACTIVE_SESSION', message: 'No active recording session' },
        }),
      } as any))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No active recording session')
    })

    it('should handle network errors gracefully', async () => {
      ;(globalThis as any).fetch = mock(() => Promise.reject(new Error('Failed to fetch')))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch')
    })
  })
})
