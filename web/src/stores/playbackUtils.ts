import type { QueryChunk } from '../api/recording'

export const MIN_DELAY_MS = 200
export const MAX_DELAY_MS = 3000

export function computeDelays(chunks: readonly QueryChunk[], speed: number): number[] {
  if (chunks.length <= 1) return []
  return chunks.slice(1).map((chunk, i) => {
    const gap = chunk.startTime - chunks[i].startTime
    const scaled = gap / speed
    return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, scaled))
  })
}
