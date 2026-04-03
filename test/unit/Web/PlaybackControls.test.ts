import { describe, it, expect } from 'vitest'

function createMockChunks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i}`,
    sessionId: 'sess-1',
    startTime: 1000 + i * 600,
    endTime: 1000 + i * 600 + 200,
    queries: [],
    tables: [`table_${i}`],
    operations: ['SELECT'],
    pattern: 'read' as const,
  }))
}

describe('playback logic', () => {
  describe('computeDelays', () => {
    it('should compute proportional delays between chunks', async () => {
      const { computeDelays } = await import('../../../web/src/stores/playbackUtils')
      const chunks = createMockChunks(3)
      const delays = computeDelays(chunks, 1)
      expect(delays).toHaveLength(2)
      expect(delays[0]).toBeCloseTo(600, -1)
      expect(delays[1]).toBeCloseTo(600, -1)
    })

    it('should scale delays by speed multiplier', async () => {
      const { computeDelays } = await import('../../../web/src/stores/playbackUtils')
      const chunks = createMockChunks(3)
      const delays = computeDelays(chunks, 2)
      expect(delays[0]).toBeCloseTo(300, -1)
      expect(delays[1]).toBeCloseTo(300, -1)
    })

    it('should cap delays at MAX_DELAY_MS', async () => {
      const { computeDelays, MAX_DELAY_MS } = await import('../../../web/src/stores/playbackUtils')
      const chunks = [
        { ...createMockChunks(1)[0], startTime: 1000 },
        { ...createMockChunks(1)[0], id: 'chunk-1', startTime: 100000 },
      ]
      const delays = computeDelays(chunks, 1)
      expect(delays[0]).toBeLessThanOrEqual(MAX_DELAY_MS)
    })

    it('should enforce MIN_DELAY_MS', async () => {
      const { computeDelays, MIN_DELAY_MS } = await import('../../../web/src/stores/playbackUtils')
      const chunks = [
        { ...createMockChunks(1)[0], startTime: 1000 },
        { ...createMockChunks(1)[0], id: 'chunk-1', startTime: 1001 },
      ]
      const delays = computeDelays(chunks, 1)
      expect(delays[0]).toBeGreaterThanOrEqual(MIN_DELAY_MS)
    })

    it('should return empty array for 0 or 1 chunks', async () => {
      const { computeDelays } = await import('../../../web/src/stores/playbackUtils')
      expect(computeDelays([], 1)).toEqual([])
      expect(computeDelays(createMockChunks(1), 1)).toEqual([])
    })
  })
})
