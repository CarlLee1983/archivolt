import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

export type ChunkPattern = 'read' | 'write' | 'mixed'

export interface QueryChunk {
  readonly id: string
  readonly sessionId: string
  readonly startTime: number
  readonly endTime: number
  readonly queries: readonly CapturedQuery[]
  readonly tables: readonly string[]
  readonly operations: readonly string[]
  readonly pattern: ChunkPattern
  readonly marker?: OperationMarker
}

export interface ChunkConfig {
  readonly silenceThresholdMs: number
}

type TimelineEntry =
  | { readonly type: 'query'; readonly timestamp: number; readonly query: CapturedQuery }
  | { readonly type: 'marker'; readonly timestamp: number; readonly marker: OperationMarker }

function determinePattern(queries: readonly CapturedQuery[]): ChunkPattern {
  const ops = new Set(queries.map((q) => q.operation))
  const hasRead = ops.has('SELECT')
  const hasWrite = ops.has('INSERT') || ops.has('UPDATE') || ops.has('DELETE')
  if (hasRead && hasWrite) return 'mixed'
  if (hasWrite) return 'write'
  return 'read'
}

function finalizeChunk(
  sessionId: string,
  queries: CapturedQuery[],
  marker: OperationMarker | undefined,
  index: number,
): QueryChunk | null {
  if (queries.length === 0) return null
  const tables = [...new Set(queries.flatMap((q) => q.tables))].sort()
  const operations = [...new Set(queries.map((q) => q.operation))].sort()
  return {
    id: `chunk_${queries[0].timestamp}_${index}`,
    sessionId,
    startTime: queries[0].timestamp,
    endTime: queries[queries.length - 1].timestamp,
    queries,
    tables,
    operations,
    pattern: determinePattern(queries),
    marker,
  }
}

export function buildChunks(
  queries: readonly CapturedQuery[],
  markers: readonly OperationMarker[],
  config: ChunkConfig,
): readonly QueryChunk[] {
  if (queries.length === 0) return []

  const timeline: TimelineEntry[] = [
    ...queries.map((q) => ({ type: 'query' as const, timestamp: q.timestamp, query: q })),
    ...markers.map((m) => ({ type: 'marker' as const, timestamp: m.timestamp, marker: m })),
  ]
  timeline.sort((a, b) => a.timestamp - b.timestamp)

  const chunks: QueryChunk[] = []
  let currentQueries: CapturedQuery[] = []
  let currentMarker: OperationMarker | undefined
  let lastQueryTimestamp: number | null = null

  for (const entry of timeline) {
    if (entry.type === 'marker') {
      const chunk = finalizeChunk(
        entry.marker.sessionId,
        currentQueries,
        currentMarker,
        chunks.length,
      )
      if (chunk) chunks.push(chunk)
      currentQueries = []
      currentMarker = entry.marker
      lastQueryTimestamp = null
      continue
    }

    const { query } = entry

    if (
      lastQueryTimestamp !== null &&
      query.timestamp - lastQueryTimestamp > config.silenceThresholdMs
    ) {
      const chunk = finalizeChunk(query.sessionId, currentQueries, currentMarker, chunks.length)
      if (chunk) chunks.push(chunk)
      currentQueries = []
      currentMarker = undefined
    }

    currentQueries.push(query)
    lastQueryTimestamp = query.timestamp
  }

  if (currentQueries.length > 0) {
    const sessionId = currentQueries[0].sessionId
    const chunk = finalizeChunk(sessionId, currentQueries, currentMarker, chunks.length)
    if (chunk) chunks.push(chunk)
  }

  return chunks
}
