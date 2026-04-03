import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('ExtensionApi', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkStatus', () => {
    it('should return session id when recording is active', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: true, session: { id: 'sess-123' } },
        }),
      })

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: true, sessionId: 'sess-123' })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/recording/status',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('should return not recording when no active session', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { recording: false },
        }),
      })

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.checkStatus()

      expect(result).toEqual({ recording: false, sessionId: null })
    })
  })

  describe('sendMarker', () => {
    it('should POST marker and return success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { id: 'marker-1', sessionId: 'sess-123', timestamp: 1000, url: '/test', action: 'click' },
        }),
      })

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'click', target: 'button.save' })

      expect(result.success).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/recording/marker',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: '/test', action: 'click', target: 'button.save' }),
        }),
      )
    })

    it('should return error when no active session', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NO_ACTIVE_SESSION', message: 'No active recording session' },
        }),
      })

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No active recording session')
    })

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      const { createApi } = await import('../../../extension/src/api')
      const api = createApi('http://localhost:3100')
      const result = await api.sendMarker({ url: '/test', action: 'navigate' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch')
    })
  })
})
