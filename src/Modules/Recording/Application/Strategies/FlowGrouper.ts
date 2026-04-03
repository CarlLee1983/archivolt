import type { QueryChunk, ChunkPattern } from '@/Modules/Recording/Domain/QueryChunk'
import type {
  OperationEntry,
  OperationFlow,
  BootstrapInfo,
  InferredRelation,
} from '@/Modules/Recording/Domain/OperationManifest'
import { mergeRelations } from '@/Modules/Recording/Application/Strategies/RelationInferrer'

export interface FlowGroupResult {
  readonly flows: readonly OperationFlow[]
  readonly bootstrap: BootstrapInfo
}

function computeDominantPattern(patterns: readonly ChunkPattern[]): ChunkPattern {
  if (patterns.length === 0) return 'marker'
  const counts = { read: 0, write: 0, mixed: 0, marker: 0 }
  for (const p of patterns) counts[p]++
  if (counts.mixed > 0 || (counts.read > 0 && counts.write > 0)) return 'mixed'
  if (counts.write > 0) return 'write'
  if (counts.read > 0) return 'read'
  return 'marker'
}

function buildFlow(
  index: number,
  url: string,
  startTime: number,
  chunkIndices: readonly number[],
  allChunks: readonly QueryChunk[],
  allOperations: readonly OperationEntry[],
  noiseSet: ReadonlySet<string>,
): OperationFlow {
  const flowChunks = chunkIndices.map((i) => allChunks[i])
  const flowOps = chunkIndices.map((i) => allOperations[i])

  const endTime =
    flowChunks.length > 0 ? Math.max(...flowChunks.map((c) => c.endTime)) : startTime

  const allTables = [...new Set(flowChunks.flatMap((c) => c.tables))].sort()
  const semanticTables = allTables.filter((t) => !noiseSet.has(t))

  const nonMarkerPatterns = flowChunks
    .map((c) => c.pattern)
    .filter((p): p is Exclude<ChunkPattern, 'marker'> => p !== 'marker')

  const allRelations: InferredRelation[] = flowOps.flatMap((o) => [...o.inferredRelations])
  const filteredRelations = mergeRelations(allRelations).filter(
    (r) => !noiseSet.has(r.sourceTable) && !noiseSet.has(r.targetTable),
  )

  return {
    id: `flow_${startTime}_${index}`,
    label: url,
    url,
    startTime,
    endTime,
    chunkIndices,
    tables: allTables,
    semanticTables,
    dominantPattern: computeDominantPattern(nonMarkerPatterns),
    chunkPatternSequence: nonMarkerPatterns.join(' → ') || '(no queries)',
    inferredRelations: filteredRelations,
  }
}

export function groupIntoFlows(
  chunks: readonly QueryChunk[],
  operations: readonly OperationEntry[],
  noiseTables: readonly string[],
): FlowGroupResult {
  if (chunks.length !== operations.length) {
    throw new Error(
      `groupIntoFlows: chunks.length (${chunks.length}) !== operations.length (${operations.length}). Arrays must be parallel.`,
    )
  }

  const noiseSet = new Set(noiseTables)

  const firstNavIndex = chunks.findIndex((c) => c.marker?.action === 'navigate')

  const preNavChunks = firstNavIndex === -1 ? [...chunks] : chunks.slice(0, firstNavIndex)
  const bootstrap: BootstrapInfo = {
    queryCount: preNavChunks.reduce((s, c) => s + c.queries.length, 0),
    otherOperationCount: preNavChunks.reduce(
      (s, c) => s + c.queries.filter((q) => q.operation === 'OTHER').length,
      0,
    ),
    tablesAccessed: [...new Set(preNavChunks.flatMap((c) => c.tables))].sort(),
  }

  if (firstNavIndex === -1) return { flows: [], bootstrap }

  const flows: OperationFlow[] = []
  let currentIndices: number[] = []
  let currentUrl = ''
  let currentStartTime = 0
  let flowIdx = 0

  for (let i = firstNavIndex; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (chunk.marker?.action === 'navigate') {
      if (currentIndices.length > 0) {
        flows.push(
          buildFlow(flowIdx++, currentUrl, currentStartTime, currentIndices, chunks, operations, noiseSet),
        )
      }
      currentIndices = [i]
      currentUrl = chunk.marker.url
      currentStartTime = chunk.startTime
    } else {
      currentIndices.push(i)
    }
  }

  if (currentIndices.length > 0) {
    flows.push(
      buildFlow(flowIdx, currentUrl, currentStartTime, currentIndices, chunks, operations, noiseSet),
    )
  }

  return { flows, bootstrap }
}
