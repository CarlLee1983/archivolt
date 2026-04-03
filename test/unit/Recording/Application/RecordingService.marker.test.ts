import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'

function createMockRepo(): RecordingRepository {
  return {
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(null),
    appendQueries: vi.fn().mockResolvedValue(undefined),
    loadQueries: vi.fn().mockResolvedValue([]),
    appendMarkers: vi.fn().mockResolvedValue(undefined),
    loadMarkers: vi.fn().mockResolvedValue([]),
    listSessions: vi.fn().mockResolvedValue([]),
  } as unknown as RecordingRepository
}

function createMockParser(): IProtocolParser {
  return {
    extractQuery: vi.fn().mockReturnValue(null),
    parseResponse: vi.fn().mockReturnValue({ type: 'unknown' }),
    isHandshakePhase: vi.fn().mockReturnValue(false),
  }
}

describe('RecordingService.addMarker', () => {
  let service: RecordingService
  let repo: RecordingRepository

  beforeEach(() => {
    repo = createMockRepo()
    service = new RecordingService(repo, createMockParser())
  })

  it('throws when no active session', () => {
    expect(() =>
      service.addMarker({ url: '/login', action: 'navigate' }),
    ).toThrow('No active recording session')
  })

  it('creates and persists marker when session is active', async () => {
    // Set internal state to simulate active session
    ;(service as any).currentSession = {
      id: 'rec_test',
      startedAt: Date.now(),
      status: 'recording',
      proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
      stats: { totalQueries: 0, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
    }

    const marker = service.addMarker({
      url: '/product/3',
      action: 'submit',
      target: 'form#product-form',
    })

    expect(marker.id).toMatch(/^mk_/)
    expect(marker.sessionId).toBe('rec_test')
    expect(marker.url).toBe('/product/3')
    expect(marker.action).toBe('submit')
    expect(marker.target).toBe('form#product-form')
    expect(repo.appendMarkers).toHaveBeenCalledWith('rec_test', [marker])
  })
})
