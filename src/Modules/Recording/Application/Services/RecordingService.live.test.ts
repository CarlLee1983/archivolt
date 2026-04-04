import { describe, it, expect } from 'vitest'
import { RecordingService } from './RecordingService'

function makeRepo() {
  return {
    openStreams: () => {},
    closeStreams: async () => {},
    saveSession: async () => {},
    appendQueries: () => {},
    appendMarkers: () => {},
    appendHttpChunks: () => {},
    listSessions: async () => [],
  } as any
}

function makeParser() {
  return {} as any
}

describe('RecordingService.getLiveStats', () => {
  it('未錄製時回傳 null', () => {
    const service = new RecordingService(makeRepo(), makeParser())
    expect(service.getLiveStats()).toBeNull()
  })

  it('錄製中時回傳統計物件', async () => {
    // 直接操作私有狀態來測試（不實際啟動 proxy）
    const service = new RecordingService(makeRepo(), makeParser()) as any
    service.currentSession = { id: 'test', startedAt: Date.now() - 5000, status: 'recording' }
    service.stats = { totalQueries: 10, byOperation: { SELECT: 10 }, tablesAccessed: new Set(['users']) }

    const stats = service.getLiveStats()
    expect(stats).not.toBeNull()
    expect(stats!.sessionId).toBe('test')
    expect(stats!.db.totalQueries).toBe(10)
    expect(stats!.elapsedSeconds).toBeGreaterThan(0)
    expect(stats!.http).toBeNull()
  })
})
