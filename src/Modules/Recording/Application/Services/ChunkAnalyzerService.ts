import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'
import type { CapturedQuery, RecordingSession } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'
import type {
  OperationManifest,
  OperationEntry,
  TableInvolvement,
  InferredRelation,
} from '@/Modules/Recording/Domain/OperationManifest'
import {
  inferSemantic,
  buildLabel,
  extractSqlSummaries,
} from '@/Modules/Recording/Application/Strategies/SqlSemanticInferrer'
import {
  inferRelations,
  mergeRelations,
} from '@/Modules/Recording/Application/Strategies/RelationInferrer'
import {
  detectNoiseTables,
  DEFAULT_NOISE_THRESHOLD,
} from '@/Modules/Recording/Application/Strategies/NoiseTableDetector'
import { groupIntoFlows } from '@/Modules/Recording/Application/Strategies/FlowGrouper'

const DEFAULT_SILENCE_MS = 500

export class ChunkAnalyzerService {
  analyze(
    session: RecordingSession,
    queries: readonly CapturedQuery[],
    markers: readonly OperationMarker[],
    silenceThresholdMs: number = DEFAULT_SILENCE_MS,
  ): OperationManifest {
    const chunks = buildChunks(queries, markers, { silenceThresholdMs })

    let readOps = 0
    let writeOps = 0
    let mixedOps = 0
    let silenceSplit = 0
    const allRelations: InferredRelation[] = []
    const tableMap = new Map<string, { read: number; write: number; ops: Set<number> }>()

    const operations: OperationEntry[] = chunks.map((chunk, index) => {
      if (chunk.pattern === 'read') readOps++
      else if (chunk.pattern === 'write') writeOps++
      else if (chunk.pattern === 'mixed') mixedOps++

      if (!chunk.marker) silenceSplit++

      const chunkRelations = inferRelations(chunk.queries, chunk.id)
      allRelations.push(...chunkRelations)

      for (const table of chunk.tables) {
        const entry = tableMap.get(table) ?? { read: 0, write: 0, ops: new Set<number>() }
        if (chunk.pattern === 'read') entry.read++
        else entry.write++
        entry.ops.add(index)
        tableMap.set(table, entry)
      }

      const requestBody = chunk.marker?.request?.body

      return {
        chunkId: chunk.id,
        index,
        label: buildLabel(chunk.marker),
        pattern: chunk.pattern,
        marker: chunk.marker
          ? {
              action: chunk.marker.action,
              url: chunk.marker.url,
              target: chunk.marker.target,
              label: chunk.marker.label,
            }
          : undefined,
        tables: chunk.tables,
        sqlSummaries: extractSqlSummaries(chunk.queries),
        inferredRelations: chunkRelations,
        semantic: inferSemantic(chunk.queries),
        requestBody,
      }
    })

    const tableMatrix: TableInvolvement[] = [...tableMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, entry]) => ({
        table,
        readCount: entry.read,
        writeCount: entry.write,
        operationIndices: [...entry.ops].sort((a, b) => a - b),
      }))

    const noiseTables = detectNoiseTables(chunks, DEFAULT_NOISE_THRESHOLD)
    const { flows, bootstrap } = groupIntoFlows(chunks, operations, noiseTables)

    return {
      sessionId: session.id,
      recordedAt: {
        start: session.startedAt,
        end: session.endedAt ?? session.startedAt,
      },
      operations,
      tableMatrix,
      inferredRelations: mergeRelations(allRelations),
      flows,
      noiseTables,
      noiseThreshold: DEFAULT_NOISE_THRESHOLD,
      bootstrap,
      stats: { totalChunks: chunks.length, readOps, writeOps, mixedOps, silenceSplit },
    }
  }
}
