import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'
import type { IQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/IQueryLogParser'
import type { QueryEvent } from '@/Modules/Recording/Domain/QueryEvent'

// PostgreSQL 14+ CSV log schema (26 columns, no header row)
// https://www.postgresql.org/docs/14/runtime-config-logging.html#RUNTIME-CONFIG-LOGGING-CSVLOG
const PG_CSV_COLUMNS = [
  'log_time', 'user_name', 'database_name', 'process_id', 'client_addr',
  'session_id', 'session_line_num', 'command_tag', 'session_start',
  'virtual_transaction_id', 'transaction_id', 'error_severity', 'sql_state_code',
  'message', 'detail', 'hint', 'internal_query', 'internal_query_pos',
  'context', 'query', 'query_pos', 'location', 'application_name',
  'backend_type', 'leader_pid', 'query_id',
] as const

// Matches: "duration: 1234.567 ms  statement: SELECT ..." or execute variant
const DURATION_RE = /duration:\s+([\d.]+)\s+ms\s+(?:statement|execute\s[^:]*?):\s+(.+)$/s

export class PostgresCsvLogParser implements IQueryLogParser {
  async *parse(filePath: string): AsyncGenerator<QueryEvent> {
    // csv-parse in object mode is itself an async iterable — consume it directly
    // so we never buffer the entire file (true O(1) streaming).
    const csvParser = createReadStream(filePath).pipe(
      parse({
        columns: PG_CSV_COLUMNS as unknown as string[],
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: true,
        cast: false,
      })
    )

    for await (const record of csvParser as AsyncIterable<Record<string, string>>) {
      if (record.error_severity !== 'LOG') continue

      // Validate PG 14+ schema (leader_pid must be present)
      if (!('leader_pid' in record)) {
        process.stderr.write(
          '[PostgresCsvLogParser] Skipping row: unexpected schema (missing leader_pid — expected PG 14+)\n'
        )
        continue
      }

      const msg = record.message ?? ''
      const match = DURATION_RE.exec(msg)
      if (!match) continue

      const durationMs = parseFloat(match[1])
      const sql = match[2].trim()
      if (!sql) continue

      const timestamp = new Date(record.log_time).getTime() || Date.now()
      yield { timestamp, sql, durationMs }
    }
  }
}
