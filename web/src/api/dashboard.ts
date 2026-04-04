async function request<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()
  return json.data as T
}

export interface DbProxyStatus {
  running: boolean
  port: number | null
  protocol: 'mysql' | 'postgres' | null
  sessionId: string | null
}

export interface HttpProxyStatus {
  running: boolean
  port: number | null
  target: string | null
}

export interface SystemStatus {
  proxy: {
    db: DbProxyStatus
    http: HttpProxyStatus
  }
  server: { version: string; uptimeSeconds: number }
  schema: { loaded: boolean; tableCount: number; hasGroups: boolean }
}

export interface SessionSummary {
  id: string
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopped'
  stats: { totalQueries: number; byOperation: Record<string, number> }
  httpChunkCount: number
  hasManifest: boolean
  hasOptimizationReport: boolean
}

export interface LiveStats {
  sessionId: string
  elapsedSeconds: number
  db: { qps: number; totalQueries: number }
  http: { chunksPerSecond: number; totalChunks: number } | null
}

export interface OptimizationReportJson {
  sessionId: string
  generatedAt: string
  enabledLayers: string[]
  readWriteReport: {
    tables: { table: string; reads: number; writes: number; readRatio: number }[]
    suggestions: { table: string; type: string; reason: string; sql: string }[]
  }
  n1Findings: { apiPath: string; sql: string; count: number; batchSql?: string }[]
  fragmentationFindings: { sql: string; count: number }[]
  indexGapFindings?: { table: string; column: string; createIndexSql: string }[]
  fullScanFindings?: { sql: string; table: string; createIndexSql: string }[]
  explainWarning?: string
}

export const dashboardApi = {
  getStatus: () => request<SystemStatus>('/api/status'),

  getSessions: () => request<SessionSummary[]>('/api/recordings'),

  getReport: (sessionId: string, type: 'manifest' | 'optimize') =>
    request<OptimizationReportJson>(`/api/report/${sessionId}/${type}`),

  startRecording: (body: {
    targetHost: string
    targetPort: number
    listenPort?: number
    httpProxy?: { enabled: boolean; port: number; target: string }
  }): Promise<{ success: boolean; data?: unknown; error?: string }> =>
    fetch('/api/recording/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
}
