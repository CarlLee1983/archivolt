// web/src/api/recording.ts

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = (await res.json()) as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error?.message ?? 'Unknown error')
  }
  return json.data!
}

export interface RecordingSession {
  id: string
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopped'
  proxy: { listenPort: number; targetHost: string; targetPort: number }
  stats: {
    totalQueries: number
    byOperation: Record<string, number>
    tablesAccessed: string[]
    connectionCount: number
  }
}

export interface OperationMarker {
  id: string
  sessionId: string
  timestamp: number
  url: string
  action: 'navigate' | 'submit' | 'click' | 'request'
  target?: string
  label?: string
}

export interface ChunkQuerySummary {
  id: string
  operation: string
  tables: string[]
  timestamp: number
  duration: number
}

export interface QueryChunk {
  id: string
  sessionId: string
  startTime: number
  endTime: number
  queries: ChunkQuerySummary[]
  tables: string[]
  operations: string[]
  pattern: 'read' | 'write' | 'mixed'
  marker?: OperationMarker
}

export interface ChunksResponse {
  chunks: QueryChunk[]
  stats: { totalChunks: number; withMarker: number; withoutMarker: number }
  nextCursor: string | null
}

export const recordingApi = {
  getStatus: () =>
    request<{ recording: boolean; session?: RecordingSession; proxyPort?: number }>(
      '/api/recording/status',
    ),

  listSessions: () => request<RecordingSession[]>('/api/recordings'),

  getSession: (id: string) =>
    request<{ session: RecordingSession }>(`/api/recordings/${id}`),

  getChunks: (id: string, params?: { silenceThresholdMs?: number; cursor?: string; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.silenceThresholdMs) searchParams.set('silenceThresholdMs', String(params.silenceThresholdMs))
    if (params?.cursor) searchParams.set('cursor', params.cursor)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<ChunksResponse>(`/api/recordings/${id}/chunks${qs ? `?${qs}` : ''}`)
  },

  getChunkQueries: (sessionId: string, chunkId: string) =>
    request<{ queries: Array<ChunkQuerySummary & { sql: string }> }>(
      `/api/recordings/${sessionId}/chunks/${chunkId}/queries`,
    ),
}
