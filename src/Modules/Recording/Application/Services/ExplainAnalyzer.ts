import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { computeQueryHash } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface ExplainRow {
  readonly type: string
  readonly table: string
  readonly rows: number
  readonly possibleKeys: string | null
  readonly key: string | null
  readonly extra: string | null
}

export interface FullScanFinding {
  readonly sql: string
  readonly queryHash: string
  readonly table: string
  readonly estimatedRows: number
  readonly suggestedIndex: string
}

export interface ExplainAnalyzerAdapter {
  explain(sql: string): Promise<readonly ExplainRow[]>
  close(): Promise<void>
  readonly dialect: 'mysql' | 'postgresql'
}

const SQL_RESERVED = new Set([
  'and', 'or', 'not', 'null', 'is', 'in', 'like', 'between', 'true', 'false',
  'select', 'from', 'where', 'join', 'on', 'as', 'by', 'order', 'group',
])

function extractWhereColumnsForIndex(sql: string): readonly string[] {
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT\b|$)/i)
  if (!whereMatch) return []
  const colMatches = [...whereMatch[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|IN\b|LIKE\b|>|<|>=|<=)/gi)]
  return [...new Set(
    colMatches
      .map((m) => m[1].toLowerCase())
      .filter((c) => !SQL_RESERVED.has(c))
  )]
}

function buildIndexSuggestion(sql: string, table: string, estimatedRows: number): string {
  const cols = extractWhereColumnsForIndex(sql)
  const colStr = cols.length > 0 ? cols.join(', ') : 'id'
  const colSuffix = cols.length > 0 ? cols.join('_') : 'id'
  return [
    `-- [EXPLAIN 確認] 全表掃描: ${table} (估計 ~${estimatedRows.toLocaleString()} rows)`,
    `-- WHERE 過濾: ${cols.join(', ') || '(未偵測到)'}`,
    `CREATE INDEX idx_${table}_${colSuffix} ON ${table}(${colStr});`,
  ].join('\n')
}

export function detectFullScans(
  sql: string,
  queryHash: string,
  rows: readonly ExplainRow[],
  minRows: number,
): readonly FullScanFinding[] {
  return rows
    .filter((r) => r.type === 'ALL' && r.rows > minRows)
    .map((r) => ({
      sql,
      queryHash,
      table: r.table,
      estimatedRows: r.rows,
      suggestedIndex: buildIndexSuggestion(sql, r.table, r.rows),
    }))
}

export async function runExplainAnalysis(
  queries: readonly CapturedQuery[],
  adapter: ExplainAnalyzerAdapter,
  minRows: number,
  concurrency = 5,
): Promise<readonly FullScanFinding[]> {
  const seen = new Set<string>()
  const uniqueQueries: CapturedQuery[] = []
  for (const q of queries) {
    if (q.operation !== 'SELECT') continue
    const hash = computeQueryHash(q.sql)
    if (seen.has(hash)) continue
    seen.add(hash)
    uniqueQueries.push(q)
  }

  const findings: FullScanFinding[] = []
  for (let i = 0; i < uniqueQueries.length; i += concurrency) {
    const batch = uniqueQueries.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (q) => {
        const hash = computeQueryHash(q.sql)
        const rows = await adapter.explain(q.sql)
        return detectFullScans(q.sql, hash, rows, minRows)
      })
    )
    for (const result of batchResults) findings.push(...result)
  }

  return findings
}

const EXPLAIN_TIMEOUT_MS = 5000

export class MysqlExplainAdapter implements ExplainAnalyzerAdapter {
  readonly dialect = 'mysql' as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null

  static async connect(url: string): Promise<MysqlExplainAdapter> {
    const mysql = await import('mysql2/promise')
    const connection = await Promise.race([
      mysql.createConnection(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB 連線逾時（5 秒）')), EXPLAIN_TIMEOUT_MS)
      ),
    ])
    const adapter = new MysqlExplainAdapter()
    adapter.connection = connection
    return adapter
  }

  async explain(sql: string): Promise<readonly ExplainRow[]> {
    if (!this.connection) throw new Error('Not connected')
    const [rows] = await this.connection.query(`EXPLAIN ${sql}`) as [Record<string, unknown>[], unknown]
    return (rows as Record<string, unknown>[]).map((row) => ({
      type: String(row['type'] ?? row['Type'] ?? ''),
      table: String(row['table'] ?? row['Table'] ?? ''),
      rows: Number(row['rows'] ?? row['Rows'] ?? 0),
      possibleKeys: (row['possible_keys'] ?? row['Possible_keys'] ?? null) as string | null,
      key: (row['key'] ?? row['Key'] ?? null) as string | null,
      extra: (row['Extra'] ?? row['extra'] ?? null) as string | null,
    }))
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end()
      this.connection = null
    }
  }
}
