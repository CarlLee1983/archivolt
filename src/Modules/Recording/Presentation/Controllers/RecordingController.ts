import path from 'node:path'
import { existsSync } from 'node:fs'
import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'

export class RecordingController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
    private readonly analyzer: ChunkAnalyzerService,
  ) {}

  async start(ctx: IHttpContext): Promise<Response> {
    const body = await ctx.getBody<{
      targetHost: string
      targetPort: number
      listenPort?: number
      httpProxy?: {
        enabled: boolean
        port: number
        target: string
      }
    }>()

    try {
      const session = await this.service.start({
        listenPort: body.listenPort ?? 13306,
        targetHost: body.targetHost,
        targetPort: body.targetPort,
      })

      if (body.httpProxy?.enabled) {
        await this.service.startHttpProxy({
          port: body.httpProxy.port ?? 18080,
          target: body.httpProxy.target,
          sessionId: session.id,
        })
      }

      return ctx.json(
        ApiResponse.success({
          ...session,
          proxyPort: this.service.proxyPort,
          httpProxy: this.service.getHttpProxyStatus(),
        }),
        201,
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return ctx.json(ApiResponse.error('RECORDING_ERROR', message), 400)
    }
  }

  async stop(ctx: IHttpContext): Promise<Response> {
    try {
      const session = await this.service.stop()
      return ctx.json(ApiResponse.success(session))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
    }
  }

  async status(ctx: IHttpContext): Promise<Response> {
    const session = this.service.status()
    if (!session) {
      return ctx.json(ApiResponse.success({ recording: false }))
    }
    return ctx.json(
      ApiResponse.success({
        recording: true,
        session,
        proxyPort: this.service.proxyPort,
      }),
    )
  }

  async list(ctx: IHttpContext): Promise<Response> {
    const sessions = await this.repo.listSessions()
    const analysisBaseDir = path.join(process.cwd(), 'data', 'analysis')

    const enriched = await Promise.all(
      sessions.map(async (session) => {
        const sessionAnalysisDir = path.join(analysisBaseDir, session.id)
        const hasManifest = existsSync(path.join(sessionAnalysisDir, 'manifest.md'))
        const hasOptimizationReport = existsSync(path.join(sessionAnalysisDir, 'optimization-report.md'))
        const httpChunks = await this.repo.loadHttpChunks(session.id)
        return {
          ...session,
          httpChunkCount: httpChunks.length,
          hasManifest,
          hasOptimizationReport,
        }
      }),
    )

    return ctx.json(ApiResponse.success(enriched))
  }

  async getSession(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const session = await this.repo.loadSession(id)
    if (!session) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
    }
    const queries = await this.repo.loadQueries(id)
    const markers = await this.repo.loadMarkers(id)
    return ctx.json(
      ApiResponse.success({
        session,
        queryCount: queries.length,
        markerCount: markers.length,
      }),
    )
  }

  async addMarker(ctx: IHttpContext): Promise<Response> {
    const body = await ctx.getBody<{
      url: string
      action: string
      target?: string
      label?: string
      request?: {
        method: string
        url: string
        headers?: Record<string, string>
        body?: string
        queryParams?: Record<string, string>
      }
    }>()

    try {
      const marker = this.service.addMarker({
        url: body.url,
        action: body.action as any,
        target: body.target,
        label: body.label,
        request: body.request,
      })
      return ctx.json(ApiResponse.success(marker), 201)
    } catch (error: any) {
      if (error.message.includes('No active recording session')) {
        return ctx.json(ApiResponse.error('NO_ACTIVE_SESSION', error.message), 400)
      }
      return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
    }
  }

  async getMarkers(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const cursor = ctx.getQuery('cursor')
    const limit = Number.parseInt(ctx.getQuery('limit') ?? '100', 10)

    const allMarkers = await this.repo.loadMarkers(id)

    let startIdx = 0
    if (cursor) {
      const cursorIdx = allMarkers.findIndex((m) => m.id === cursor)
      startIdx = cursorIdx !== -1 ? cursorIdx + 1 : 0
    }

    const page = allMarkers.slice(startIdx, startIdx + limit)
    const nextCursor = startIdx + limit < allMarkers.length ? page[page.length - 1]?.id ?? null : null

    return ctx.json(
      ApiResponse.success({
        markers: page,
        nextCursor,
      }),
    )
  }

  async getChunks(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const silenceThresholdMs = Number.parseInt(ctx.getQuery('silenceThresholdMs') ?? '500', 10)
    const cursor = ctx.getQuery('cursor')
    const limit = Number.parseInt(ctx.getQuery('limit') ?? '50', 10)

    const session = await this.repo.loadSession(id)
    if (!session) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
    }

    const queries = await this.repo.loadQueries(id)
    const markers = await this.repo.loadMarkers(id)
    const allChunks = buildChunks(queries, markers, { silenceThresholdMs })

    const summarized = allChunks.map((chunk) => ({
      ...chunk,
      queries: chunk.queries.map((q) => ({
        id: q.id,
        operation: q.operation,
        tables: q.tables,
        timestamp: q.timestamp,
        duration: q.duration,
      })),
    }))

    let startIdx = 0
    if (cursor) {
      const cursorIdx = summarized.findIndex((c) => c.id === cursor)
      startIdx = cursorIdx !== -1 ? cursorIdx + 1 : 0
    }

    const page = summarized.slice(startIdx, startIdx + limit)
    const nextCursor =
      startIdx + limit < summarized.length ? page[page.length - 1]?.id ?? null : null

    const withMarker = allChunks.filter((c) => c.marker).length
    return ctx.json(
      ApiResponse.success({
        chunks: page,
        stats: {
          totalChunks: allChunks.length,
          withMarker,
          withoutMarker: allChunks.length - withMarker,
        },
        nextCursor,
      }),
    )
  }

  async getChunkQueries(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const chunkId = ctx.getParam('chunkId')!
    const silenceThresholdMs = Number.parseInt(ctx.getQuery('silenceThresholdMs') ?? '500', 10)

    const queries = await this.repo.loadQueries(id)
    const markers = await this.repo.loadMarkers(id)
    const allChunks = buildChunks(queries, markers, { silenceThresholdMs })

    const chunk = allChunks.find((c) => c.id === chunkId)
    if (!chunk) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Chunk ${chunkId} not found`), 404)
    }

    return ctx.json(ApiResponse.success({ queries: chunk.queries }))
  }

  async getManifest(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!

    const session = await this.repo.loadSession(id)
    if (!session) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Session ${id} not found`), 404)
    }

    const queries = await this.repo.loadQueries(id)
    const markers = await this.repo.loadMarkers(id)
    const manifest = this.analyzer.analyze(session, queries, markers)

    return ctx.json(ApiResponse.success(manifest))
  }

  async getReport(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const type = ctx.getParam('type') as 'manifest' | 'optimize'

    const analysisDir = path.join(process.cwd(), 'data', 'analysis', id)
    const filename = type === 'optimize' ? 'optimization-report.json' : 'manifest.json'
    const filePath = path.join(analysisDir, filename)

    if (!existsSync(filePath)) {
      return ctx.json(ApiResponse.error('NOT_FOUND', `Report not found for session ${id}`), 404)
    }

    const { readFile } = await import('node:fs/promises')
    const content = await readFile(filePath, 'utf-8')
    return ctx.json(ApiResponse.success(JSON.parse(content)))
  }
}
