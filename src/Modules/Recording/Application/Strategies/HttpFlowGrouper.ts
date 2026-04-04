import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'
import type { ApiCallFlow } from '@/Modules/Recording/Domain/ApiCallFlow'

/**
 * URL path の動的セグメントを正規化:
 * 1. UUID（36 chars ハイフン付き）→ :uuid
 * 2. 純数字 → :id
 * その他はそのまま
 */
export function normalizePath(rawPath: string): string {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const NUMERIC_RE = /^\d+$/

  return rawPath
    .split('/')
    .map((seg) => {
      if (UUID_RE.test(seg)) return ':uuid'
      if (NUMERIC_RE.test(seg) && seg.length > 0) return ':id'
      return seg
    })
    .join('/')
}

/**
 * HttpChunk[] を ApiCallFlow[] に変換:
 * - requestId で request/response をペアリング
 * - レスポンスなしのリクエストは除外
 * - startTimestamp 昇順でソート
 */
export function pairHttpChunks(chunks: readonly HttpChunk[]): readonly ApiCallFlow[] {
  const requests = new Map<string, HttpChunk>()
  const responses = new Map<string, HttpChunk>()

  for (const chunk of chunks) {
    if (chunk.type === 'http_request') {
      requests.set(chunk.requestId, chunk)
    } else {
      responses.set(chunk.requestId, chunk)
    }
  }

  const flows: ApiCallFlow[] = []

  for (const [requestId, req] of requests) {
    const res = responses.get(requestId)
    if (!res) continue

    flows.push({
      requestId,
      sessionId: req.sessionId,
      method: req.method,
      path: normalizePath(req.path),
      statusCode: res.statusCode ?? 0,
      startTimestamp: req.timestamp,
      durationMs: res.durationMs ?? 0,
      requestBodySize: req.requestBody?.length ?? 0,
      responseBodySize: res.responseBody?.length ?? 0,
      dbQueries: [],
    })
  }

  return flows.sort((a, b) => a.startTimestamp - b.startTimestamp)
}
