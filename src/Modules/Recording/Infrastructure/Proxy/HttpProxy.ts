import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB

export interface HttpProxyConfig {
  readonly listenPort: number
  readonly targetUrl: string // e.g., "http://localhost:3000"
  readonly sessionId: string
  readonly onChunk: (chunks: HttpChunk[]) => Promise<void>
}

function shouldCaptureBody(headers: Headers): boolean {
  const ct = headers.get('content-type') ?? ''
  return ct.includes('application/json') || ct.includes('text/')
}

async function readBodyText(
  buffer: ArrayBuffer,
  headers: Headers,
): Promise<{ text: string; truncated: boolean }> {
  if (!shouldCaptureBody(headers)) return { text: '', truncated: false }
  if (buffer.byteLength > MAX_BODY_SIZE) {
    return {
      text: new TextDecoder().decode(buffer.slice(0, 1000)) + '...[truncated]',
      truncated: true,
    }
  }
  return { text: new TextDecoder().decode(buffer), truncated: false }
}

export class HttpProxyService {
  private server?: ReturnType<typeof Bun.serve>

  constructor(private readonly config: HttpProxyConfig) {}

  get port(): number {
    return this.server?.port ?? this.config.listenPort
  }

  async start(): Promise<void> {
    const { targetUrl, sessionId, onChunk } = this.config

    this.server = Bun.serve({
      port: this.config.listenPort,
      async fetch(req) {
        const requestId = crypto.randomUUID()
        const startMs = Date.now()

        const reqBuffer = await req.arrayBuffer()
        const { text: reqBody, truncated: reqTruncated } = await readBodyText(
          reqBuffer,
          req.headers,
        )

        const url = new URL(req.url)
        const targetFullUrl = targetUrl + url.pathname + url.search

        const requestChunk: HttpChunk = {
          type: 'http_request',
          timestamp: startMs,
          sessionId,
          requestId,
          method: req.method,
          url: req.url,
          path: url.pathname,
          requestHeaders: Object.fromEntries(req.headers.entries()),
          requestBody: reqBody || undefined,
          bodyTruncated: reqTruncated || undefined,
        }

        let targetResponse: Response
        try {
          targetResponse = await fetch(targetFullUrl, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : reqBuffer,
          })
        } catch {
          await onChunk([requestChunk])
          return new Response('Bad Gateway', { status: 502 })
        }

        const endMs = Date.now()
        const durationMs = endMs - startMs

        const resBuffer = await targetResponse.arrayBuffer()
        const { text: resBody, truncated: resTruncated } = await readBodyText(
          resBuffer,
          targetResponse.headers,
        )

        const responseChunk: HttpChunk = {
          type: 'http_response',
          timestamp: endMs,
          sessionId,
          requestId,
          method: req.method,
          url: req.url,
          path: url.pathname,
          statusCode: targetResponse.status,
          durationMs,
          requestHeaders: Object.fromEntries(req.headers.entries()),
          responseHeaders: Object.fromEntries(targetResponse.headers.entries()),
          responseBody: resBody || undefined,
          bodyTruncated: resTruncated || undefined,
        }

        await onChunk([requestChunk, responseChunk])

        return new Response(resBuffer, {
          status: targetResponse.status,
          headers: targetResponse.headers,
        })
      },
    })
  }

  stop(): void {
    this.server?.stop(true)
    this.server = undefined
  }
}
