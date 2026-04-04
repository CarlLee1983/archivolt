// src/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer.ts

import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

export interface TableStats {
  readonly table: string
  readonly reads: number
  readonly writes: number
  readonly readRatio: number
}

export interface CacheSuggestion {
  readonly table: string
  readonly type: 'redis_cache' | 'read_replica'
  readonly reason: string
  readonly sql: string
}

export interface ReadWriteReport {
  readonly tables: readonly TableStats[]
  readonly suggestions: readonly CacheSuggestion[]
}

const REDIS_CACHE_THRESHOLD = 0.9
const REDIS_CACHE_VOLUME_THRESHOLD = 10
const READ_REPLICA_RATIO_THRESHOLD = 0.8
const READ_REPLICA_VOLUME_THRESHOLD = 100

function buildCacheSuggestion(stats: TableStats): CacheSuggestion | null {
  const total = stats.reads + stats.writes
  const pct = Math.round(stats.readRatio * 100)

  if (stats.readRatio >= REDIS_CACHE_THRESHOLD && total >= REDIS_CACHE_VOLUME_THRESHOLD) {
    return {
      table: stats.table,
      type: 'redis_cache',
      reason: `readRatio=${stats.readRatio.toFixed(2)} (${pct}% reads), totalQueries=${total}`,
      sql: `-- ${stats.table} 資料表讀取佔 ${pct}%，建議在應用層加入 Redis cache\n-- TTL 建議：60 秒\n-- Redis key pattern：${stats.table}:{id}`,
    }
  }

  if (stats.readRatio >= READ_REPLICA_RATIO_THRESHOLD && total > READ_REPLICA_VOLUME_THRESHOLD) {
    return {
      table: stats.table,
      type: 'read_replica',
      reason: `readRatio=${stats.readRatio.toFixed(2)} (${pct}% reads), totalQueries=${total}`,
      sql: `-- ${stats.table} 資料表讀取佔 ${pct}%，且 session 內查詢總量 ${total} 次超過門檻\n-- 建議評估 Read Replica 分流讀取流量`,
    }
  }

  return null
}

export function analyzeReadWriteRatio(queries: readonly CapturedQuery[]): ReadWriteReport {
  const readsMap = new Map<string, number>()
  const writesMap = new Map<string, number>()

  for (const q of queries) {
    if (q.error) continue

    const isWrite = q.operation === 'INSERT' || q.operation === 'UPDATE' || q.operation === 'DELETE'
    const isRead = q.operation === 'SELECT'

    if (!isRead && !isWrite) continue

    for (const table of q.tables) {
      if (isRead) {
        readsMap.set(table, (readsMap.get(table) ?? 0) + 1)
      } else {
        writesMap.set(table, (writesMap.get(table) ?? 0) + 1)
      }
    }
  }

  const allTables = new Set([...readsMap.keys(), ...writesMap.keys()])
  const tables: TableStats[] = []

  for (const table of allTables) {
    const reads = readsMap.get(table) ?? 0
    const writes = writesMap.get(table) ?? 0
    const total = reads + writes
    const readRatio = total === 0 ? 0 : reads / total
    tables.push({ table, reads, writes, readRatio })
  }

  tables.sort((a, b) => b.readRatio - a.readRatio || a.table.localeCompare(b.table))

  const suggestions: CacheSuggestion[] = []
  for (const stats of tables) {
    const suggestion = buildCacheSuggestion(stats)
    if (suggestion) suggestions.push(suggestion)
  }

  return { tables, suggestions }
}
