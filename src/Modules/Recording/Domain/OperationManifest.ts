import type { ChunkPattern } from '@/Modules/Recording/Domain/QueryChunk'
import type { MarkerAction } from '@/Modules/Recording/Domain/OperationMarker'

export interface InferredRelation {
  readonly sourceTable: string
  readonly sourceColumn: string
  readonly targetTable: string
  readonly targetColumn: string
  readonly confidence: 'high' | 'medium' | 'low'
  readonly evidence: string
}

export interface OperationEntry {
  readonly chunkId: string
  readonly index: number
  readonly label: string
  readonly pattern: ChunkPattern
  readonly marker?: {
    readonly action: MarkerAction
    readonly url: string
    readonly target?: string
    readonly label?: string
  }
  readonly tables: readonly string[]
  readonly sqlSummaries: readonly string[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly semantic: string
  readonly requestBody?: string
}

export interface TableInvolvement {
  readonly table: string
  readonly readCount: number
  readonly writeCount: number
  readonly operationIndices: readonly number[]
}

export interface OperationManifest {
  readonly sessionId: string
  readonly recordedAt: { readonly start: number; readonly end: number }
  readonly operations: readonly OperationEntry[]
  readonly tableMatrix: readonly TableInvolvement[]
  readonly inferredRelations: readonly InferredRelation[]
  readonly stats: {
    readonly totalChunks: number
    readonly readOps: number
    readonly writeOps: number
    readonly mixedOps: number
    readonly silenceSplit: number
  }
}
