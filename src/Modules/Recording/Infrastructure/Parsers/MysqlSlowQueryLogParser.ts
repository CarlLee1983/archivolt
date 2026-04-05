import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

const TIME_LINE = /^#\s+Time:\s+(.+)$/
const USER_LINE = /^#\s+User@Host:.*Id:\s+(\d+)/
const QUERY_TIME_LINE = /^#\s+Query_time:\s+([\d.]+)\s+Lock_time:\s+[\d.]+\s+Rows_sent:\s+\d+\s+Rows_examined:\s+(\d+)/
const USE_DB_LINE = /^use\s+(\w+)\s*;$/i
const SET_TIMESTAMP_LINE = /^SET\s+timestamp=\d+\s*;$/i

interface EntryAccumulator {
  timestamp?: number
  connectionId?: string
  durationMs?: number
  rowsExamined?: number
  database?: string
  sqlLines: string[]
}

function emitEvent(acc: EntryAccumulator): QueryEvent | null {
  const sql = acc.sqlLines.join('\n').trim()
  if (!sql || acc.timestamp === undefined) return null
  return {
    timestamp: acc.timestamp,
    sql,
    connectionId: acc.connectionId,
    durationMs: acc.durationMs,
    rowsExamined: acc.rowsExamined,
    database: acc.database,
  }
}

export class MysqlSlowQueryLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })

    let acc: EntryAccumulator | null = null
    let currentDb: string | undefined

    for await (const line of rl) {
      const timeMatch = TIME_LINE.exec(line)
      if (timeMatch) {
        // Emit previous entry
        if (acc) {
          const event = emitEvent(acc)
          if (event) yield event
        }
        const ts = new Date(timeMatch[1].trim()).getTime()
        acc = {
          timestamp: isNaN(ts) ? undefined : ts,
          database: currentDb,
          sqlLines: [],
        }
        continue
      }

      if (!acc) continue

      const userMatch = USER_LINE.exec(line)
      if (userMatch) {
        acc.connectionId = userMatch[1]
        continue
      }

      const qtMatch = QUERY_TIME_LINE.exec(line)
      if (qtMatch) {
        acc.durationMs = parseFloat(qtMatch[1]) * 1000
        acc.rowsExamined = parseInt(qtMatch[2], 10)
        continue
      }

      const useMatch = USE_DB_LINE.exec(line)
      if (useMatch) {
        currentDb = useMatch[1]
        acc.database = currentDb
        continue
      }

      if (SET_TIMESTAMP_LINE.test(line)) continue

      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        acc.sqlLines.push(line)
      }
    }

    // Emit final entry
    if (acc) {
      const event = emitEvent(acc)
      if (event) yield event
    }
  }
}
