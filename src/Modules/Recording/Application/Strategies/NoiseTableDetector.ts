import type { QueryChunk } from '@/Modules/Recording/Domain/QueryChunk'

export const DEFAULT_NOISE_THRESHOLD = 0.6

export function detectNoiseTables(
  chunks: readonly QueryChunk[],
  threshold: number = DEFAULT_NOISE_THRESHOLD,
): readonly string[] {
  if (chunks.length === 0) return []

  const frequency = new Map<string, number>()
  for (const chunk of chunks) {
    for (const table of chunk.tables) {
      frequency.set(table, (frequency.get(table) ?? 0) + 1)
    }
  }

  const noiseFloor = chunks.length * threshold
  return [...frequency.entries()]
    .filter(([, count]) => count > noiseFloor)
    .map(([table]) => table)
    .sort()
}
