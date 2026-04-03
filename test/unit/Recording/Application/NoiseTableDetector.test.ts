import { describe, it, expect } from 'vitest'
import { detectNoiseTables } from '@/Modules/Recording/Application/Strategies/NoiseTableDetector'
import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'

function makeChunk(tables: string[]): QueryChunk {
  return {
    id: `chunk_${Math.random()}`,
    sessionId: 'rec_1',
    startTime: 1000,
    endTime: 1010,
    queries: [],
    tables,
    operations: [],
    pattern: 'read',
  }
}

describe('detectNoiseTables', () => {
  it('returns empty array for no chunks', () => {
    expect(detectNoiseTables([])).toEqual([])
  })

  it('returns tables appearing in more than 60% of chunks (default threshold)', () => {
    const chunks = [
      makeChunk(['users', 'orders']),
      makeChunk(['users', 'products']),
      makeChunk(['users', 'categories']),
      makeChunk(['users', 'cart_items']),
      makeChunk(['sessions']),
    ]
    // users: 4/5 = 0.80 > 0.60 → noise
    // sessions: 1/5 = 0.20 → not noise
    expect(detectNoiseTables(chunks)).toEqual(['users'])
  })

  it('returns multiple noise tables sorted alphabetically', () => {
    const chunks = [
      makeChunk(['users', 'sessions', 'orders']),
      makeChunk(['users', 'sessions', 'products']),
      makeChunk(['users', 'sessions']),
    ]
    // users: 3/3 = 1.0, sessions: 3/3 = 1.0 → both noise
    expect(detectNoiseTables(chunks)).toEqual(['sessions', 'users'])
  })

  it('respects custom threshold', () => {
    const chunks = [
      makeChunk(['users', 'orders']),
      makeChunk(['users', 'products']),
      makeChunk(['categories']),
    ]
    // users: 2/3 = 0.67 > 0.50 → noise at threshold 0.5
    expect(detectNoiseTables(chunks, 0.5)).toEqual(['users'])
  })

  it('returns empty when no table exceeds threshold', () => {
    const chunks = [
      makeChunk(['orders']),
      makeChunk(['products']),
      makeChunk(['categories']),
    ]
    expect(detectNoiseTables(chunks)).toEqual([])
  })

  it('uses strict greater-than comparison (exactly at threshold is not noise)', () => {
    const chunks = [
      makeChunk(['users']),
      makeChunk(['users']),
      makeChunk(['products']),
      makeChunk(['products']),
      makeChunk(['orders']),
    ]
    // users: 2/5 = 0.40, threshold 0.4 → 0.40 is NOT > 0.40 → not noise
    expect(detectNoiseTables(chunks, 0.4)).toEqual([])
  })
})
