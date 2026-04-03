import type { OperationManifest, TableInvolvement, InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

export interface TableDiff {
  readonly table: string
  readonly readDelta: number
  readonly writeDelta: number
  readonly readA: number
  readonly writeA: number
  readonly readB: number
  readonly writeB: number
}

export interface SessionDiff {
  readonly sessionA: string
  readonly sessionB: string
  readonly tables: {
    readonly added: readonly TableInvolvement[]
    readonly removed: readonly TableInvolvement[]
    readonly changed: readonly TableDiff[]
  }
  readonly relations: {
    readonly added: readonly InferredRelation[]
    readonly removed: readonly InferredRelation[]
  }
  readonly stats: {
    readonly chunksA: number
    readonly chunksB: number
    readonly chunksDelta: number
    readonly queriesA: number
    readonly queriesB: number
    readonly queriesDelta: number
    readonly tablesA: number
    readonly tablesB: number
    readonly tablesDelta: number
  }
}

function relationKey(r: InferredRelation): string {
  return `${r.sourceTable}.${r.sourceColumn}->${r.targetTable}.${r.targetColumn}`
}

export function diffManifests(a: OperationManifest, b: OperationManifest): SessionDiff {
  const tableMapA = new Map(a.tableMatrix.map((t) => [t.table, t]))
  const tableMapB = new Map(b.tableMatrix.map((t) => [t.table, t]))

  const added: TableInvolvement[] = []
  const removed: TableInvolvement[] = []
  const changed: TableDiff[] = []

  for (const [table, tB] of tableMapB) {
    if (!tableMapA.has(table)) {
      added.push(tB)
    }
  }

  for (const [table, tA] of tableMapA) {
    if (!tableMapB.has(table)) {
      removed.push(tA)
    } else {
      const tB = tableMapB.get(table)!
      if (tA.readCount !== tB.readCount || tA.writeCount !== tB.writeCount) {
        changed.push({
          table,
          readDelta: tB.readCount - tA.readCount,
          writeDelta: tB.writeCount - tA.writeCount,
          readA: tA.readCount,
          writeA: tA.writeCount,
          readB: tB.readCount,
          writeB: tB.writeCount,
        })
      }
    }
  }

  const relKeysA = new Set(a.inferredRelations.map(relationKey))
  const relKeysB = new Set(b.inferredRelations.map(relationKey))

  const relationsAdded = b.inferredRelations.filter((r) => !relKeysA.has(relationKey(r)))
  const relationsRemoved = a.inferredRelations.filter((r) => !relKeysB.has(relationKey(r)))

  const queriesA = a.stats.readOps + a.stats.writeOps + a.stats.mixedOps
  const queriesB = b.stats.readOps + b.stats.writeOps + b.stats.mixedOps

  return {
    sessionA: a.sessionId,
    sessionB: b.sessionId,
    tables: { added, removed, changed },
    relations: { added: relationsAdded, removed: relationsRemoved },
    stats: {
      chunksA: a.stats.totalChunks,
      chunksB: b.stats.totalChunks,
      chunksDelta: b.stats.totalChunks - a.stats.totalChunks,
      queriesA,
      queriesB,
      queriesDelta: queriesB - queriesA,
      tablesA: a.tableMatrix.length,
      tablesB: b.tableMatrix.length,
      tablesDelta: b.tableMatrix.length - a.tableMatrix.length,
    },
  }
}
