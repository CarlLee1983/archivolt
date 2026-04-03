export interface CapturedQuery {
  readonly id: string
  readonly sessionId: string
  readonly connectionId: number
  readonly timestamp: number
  readonly duration: number
  readonly sql: string
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly affectedRows?: number
  readonly resultSummary?: {
    readonly columnCount: number
    readonly rowCount: number
    readonly columns: readonly string[]
    readonly sampleRows: readonly Record<string, unknown>[]
  }
  readonly error?: string
}

export interface ProxyConfig {
  readonly listenPort: number
  readonly targetHost: string
  readonly targetPort: number
}

export interface SessionStats {
  readonly totalQueries: number
  readonly byOperation: Record<string, number>
  readonly tablesAccessed: readonly string[]
  readonly connectionCount: number
}

export interface RecordingSession {
  readonly id: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly status: 'recording' | 'stopped'
  readonly proxy: ProxyConfig
  readonly stats: SessionStats
}

let _counter = 0

export function createSession(proxy: ProxyConfig): RecordingSession {
  return {
    id: `rec_${Date.now()}_${_counter++}`,
    startedAt: Date.now(),
    status: 'recording',
    proxy,
    stats: {
      totalQueries: 0,
      byOperation: {},
      tablesAccessed: [],
      connectionCount: 0,
    },
  }
}

export function stopSession(session: RecordingSession): RecordingSession {
  return {
    ...session,
    endedAt: Date.now(),
    status: 'stopped',
  }
}

export function updateSessionStats(
  session: RecordingSession,
  queries: readonly CapturedQuery[],
  connectionCount: number,
): RecordingSession {
  const byOperation: Record<string, number> = {}
  const tablesSet = new Set<string>()

  for (const q of queries) {
    byOperation[q.operation] = (byOperation[q.operation] ?? 0) + 1
    for (const t of q.tables) {
      tablesSet.add(t)
    }
  }

  return {
    ...session,
    stats: {
      totalQueries: queries.length,
      byOperation,
      tablesAccessed: [...tablesSet].sort(),
      connectionCount,
    },
  }
}

export function createCapturedQuery(params: {
  sessionId: string
  connectionId: number
  sql: string
  operation: CapturedQuery['operation']
  tables: readonly string[]
  duration: number
  affectedRows?: number
  resultSummary?: CapturedQuery['resultSummary']
  error?: string
}): CapturedQuery {
  return {
    id: `q_${Date.now()}_${_counter++}`,
    timestamp: Date.now(),
    ...params,
  }
}
