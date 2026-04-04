export interface DbOperationRef {
  readonly queryHash: string // 正規化 SQL SHA256 前 16 chars
  readonly offsetMs: number // API call startTimestamp からの遅延
  readonly tableTouched: readonly string[]
  readonly isN1Candidate: boolean // 同一 requestId 内で同じ queryHash が 2+ 回
}

export interface ApiCallFlow {
  readonly requestId: string
  readonly sessionId: string
  readonly method: string
  readonly path: string // 正規化済み（/users/123 → /users/:id）
  readonly statusCode: number
  readonly startTimestamp: number // Date.now() ミリ秒
  readonly durationMs: number
  readonly requestBodySize: number
  readonly responseBodySize: number
  readonly dbQueries: readonly DbOperationRef[]
}
