import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

// ISO format: 2024-04-05T10:00:00.000000Z\t   42 Query\tSELECT ...
const ISO_QUERY_LINE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\t\s*(\d+)\s+Query\t(.+)$/

// Compact format: 240405 10:00:00\t   42 Query\tSELECT ...
const COMPACT_QUERY_LINE = /^(\d{6}\s+[\d:]+)\t\s*(\d+)\s+Query\t(.+)$/

function parseCompactTimestamp(raw: string): number {
  // raw: "240405 10:00:00" → "2024-04-05T10:00:00Z"
  const [datePart, timePart] = raw.trim().split(/\s+/)
  const yy = datePart.slice(0, 2)
  const mm = datePart.slice(2, 4)
  const dd = datePart.slice(4, 6)
  return new Date(`20${yy}-${mm}-${dd}T${timePart}Z`).getTime()
}

export class MysqlGeneralLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      let match = ISO_QUERY_LINE.exec(line)
      if (match) {
        yield {
          timestamp: new Date(match[1]).getTime(),
          connectionId: match[2],
          sql: match[3].trim(),
        }
        continue
      }

      match = COMPACT_QUERY_LINE.exec(line)
      if (match) {
        yield {
          timestamp: parseCompactTimestamp(match[1]),
          connectionId: match[2],
          sql: match[3].trim(),
        }
      }
      // All other lines (headers, Connect, Quit, Init DB) silently skipped
    }
  }
}
