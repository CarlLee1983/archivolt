import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

// Matches: 2024-01-15 10:23:45.123 UTC [1234] user@dbname LOG:  duration: 1234.567 ms  statement: SELECT ...
// Also:    2024-01-15 10:23:45.123 UTC [1234] user@dbname LOG:  duration: 1234.567 ms  execute <unnamed>: SELECT ...
const DURATION_LINE = /duration:\s+([\d.]+)\s+ms\s+(?:statement|execute\s[^:]*?):\s+(.+)$/

// Full PostgreSQL timestamp: date + time + optional fractional seconds + optional timezone
// e.g. "2024-01-15 10:23:45.123 UTC" or "2024-01-15 10:23:45+08" or "2024-01-15 10:23:45"
// Captured as a single token so new Date() can parse it (ISO-8601-like with space separator).
const TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s+[A-Z]{2,4}|[+-]\d{2}(?::\d{2})?)?)/

function parseTimestamp(raw: string): number {
  // Normalise "2024-01-15 10:23:45.123 UTC" → "2024-01-15T10:23:45.123Z"
  // and "2024-01-15 10:23:45.123+08" → "2024-01-15T10:23:45.123+08:00"
  const normalised = raw
    .replace(' ', 'T')                         // space between date and time → T
    .replace(/\s+UTC$/i, 'Z')                  // trailing UTC → Z
    .replace(/\s+([A-Z]{2,4})$/, '')           // strip other named tz (fallback: treat as local)
    .replace(/([+-]\d{2})$/, '$1:00')          // +08 → +08:00
  const ms = new Date(normalised).getTime()
  return isNaN(ms) ? Date.now() : ms
}

// Known PostgreSQL log metadata prefixes — skip these lines, don't add to SQL and don't terminate
const METADATA_PREFIX = /^(?:CONTEXT|HINT|DETAIL|STATEMENT|QUERY|LOCATION|SCHEMA NAME|TABLE NAME|COLUMN NAME|DATA TYPE|CONSTRAINT NAME|INTERNAL QUERY|WHERE):/

interface Accumulator {
  timestamp: number
  durationMs: number
  sqlLines: string[]
}

export class PostgresSlowQueryLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    })

    let acc: Accumulator | null = null

    for await (const line of rl) {
      // Continuation line (tab-indented) — append to current SQL
      if (line.startsWith('\t') && acc !== null) {
        acc.sqlLines.push(line.trimStart())
        continue
      }

      // Known metadata lines — skip without triggering termination
      if (METADATA_PREFIX.test(line.trimStart())) continue

      // Non-empty, non-tab line: terminate current accumulator if any
      if (acc !== null && line.trim() !== '') {
        const sql = acc.sqlLines.join('\n').trim()
        if (sql) {
          yield { timestamp: acc.timestamp, sql, durationMs: acc.durationMs }
        }
        acc = null
      }

      const durationMatch = DURATION_LINE.exec(line)
      if (!durationMatch) continue

      const durationMs = parseFloat(durationMatch[1])
      const firstSqlLine = durationMatch[2].trim()

      const tsMatch = TIMESTAMP_PREFIX.exec(line)
      const timestamp = tsMatch ? parseTimestamp(tsMatch[1]) : Date.now()

      acc = { timestamp, durationMs, sqlLines: [firstSqlLine] }
    }

    // Emit final accumulated entry
    if (acc !== null) {
      const sql = acc.sqlLines.join('\n').trim()
      if (sql) {
        yield { timestamp: acc.timestamp, sql, durationMs: acc.durationMs }
      }
    }
  }
}
