export interface HttpChunk {
  readonly type: 'http_request' | 'http_response'
  readonly timestamp: number // Date.now() ミリ秒
  readonly sessionId: string
  readonly requestId: string // crypto.randomUUID()
  readonly method: string
  readonly url: string // 完全な URL（query string 含む）
  readonly path: string // pathname のみ、例: "/users/123"
  readonly statusCode?: number // http_response のみ
  readonly durationMs?: number // http_response のみ
  readonly requestHeaders: Record<string, string>
  readonly responseHeaders?: Record<string, string> // http_response のみ
  readonly requestBody?: string
  readonly responseBody?: string
  readonly bodyTruncated?: boolean // body が 10MB 超で切り捨て時 true
}
