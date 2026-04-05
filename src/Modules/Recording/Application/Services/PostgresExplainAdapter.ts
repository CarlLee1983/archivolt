import type { ExplainAnalyzerAdapter, ExplainRow } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

// Maps PostgreSQL EXPLAIN JSON node types to the canonical ExplainRow.type values
// used by detectFullScans (which checks type === 'ALL' for full table scans).
const NODE_TYPE_MAP: Record<string, string> = {
  'Seq Scan':          'ALL',
  'Index Scan':        'ref',
  'Index Only Scan':   'index',
  'Bitmap Heap Scan':  'range',
}

interface PgPlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Plan Rows': number
  'Filter'?: string
  'Index Cond'?: string
  'Plans'?: PgPlanNode[]
}

function walkPlan(node: PgPlanNode, results: ExplainRow[]): void {
  const table = node['Relation Name']

  // Only emit rows for nodes that reference a real relation (skip Gather, Sort, Aggregate, etc.)
  if (table !== undefined) {
    results.push({
      type: NODE_TYPE_MAP[node['Node Type']] ?? 'other',
      table,
      rows: node['Plan Rows'] ?? 0,
      possibleKeys: null,
      key: node['Index Name'] ?? null,
      extra: node['Filter'] ?? node['Index Cond'] ?? null,
    })
  }

  for (const child of node['Plans'] ?? []) {
    walkPlan(child, results)
  }
}

// Allowlist of statement types that are safe to EXPLAIN.
// Rejects anything that could mutate data or leak via multi-statement payloads.
const SAFE_STATEMENT = /^\s*(?:SELECT|WITH|VALUES)\b/i

// Reject semicolons to block multi-statement payloads (e.g. "SELECT 1; DROP TABLE t").
// PostgreSQL's simple query protocol executes every semicolon-delimited statement.
function assertSafeForExplain(sql: string): void {
  if (!SAFE_STATEMENT.test(sql)) {
    throw new Error(`PostgresExplainAdapter: refusing to EXPLAIN non-read statement: ${sql.slice(0, 80)}`)
  }
  if (sql.includes(';')) {
    throw new Error(`PostgresExplainAdapter: refusing to EXPLAIN statement containing semicolon (multi-statement risk)`)
  }
}

export class PostgresExplainAdapter implements ExplainAnalyzerAdapter {
  readonly dialect = 'postgresql' as const

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any

  private constructor() {}

  static async connect(url: string, concurrency = 5): Promise<PostgresExplainAdapter> {
    const { Pool } = await import('pg')
    const pool = new Pool({
      connectionString: url,
      max: concurrency,
      connectionTimeoutMillis: 5000,
    })
    // Eagerly validate connectivity
    const client = await pool.connect()
    client.release()

    const adapter = new PostgresExplainAdapter()
    adapter.pool = pool
    return adapter
  }

  async explain(sql: string): Promise<readonly ExplainRow[]> {
    assertSafeForExplain(sql)

    // Run inside a read-only transaction as a second layer of defence.
    // Even if assertSafeForExplain is bypassed, the transaction will reject writes.
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN READ ONLY')
      const result = await client.query(`EXPLAIN (FORMAT JSON, ANALYZE false) ${sql}`)
      await client.query('COMMIT')
      // PG returns: [{ "QUERY PLAN": [{ "Plan": {...} }] }]
      const planWrapper = result.rows[0]['QUERY PLAN'] as Array<{ Plan: PgPlanNode }>
      const rows: ExplainRow[] = []
      for (const { Plan } of planWrapper) {
        walkPlan(Plan, rows)
      }
      return rows
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }
}
