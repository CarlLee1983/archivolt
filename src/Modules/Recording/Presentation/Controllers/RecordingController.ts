import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { buildChunks } from '@/Modules/Recording/Domain/QueryChunk'

export class RecordingController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
  ) {}

  async start(ctx: IHttpContext): Promise<Response> {
    const body = await ctx.getBody<{
      targetHost: string
      targetPort: number
      listenPort?: number
    }>()

    try {
      const session = await this.service.start({
        listenPort: body.listenPort ?? 13306,
        targetHost: body.targetHost,
        targetPort: body.targetPort,
      })
      return ctx.json(
        ApiResponse.success({
          ...session,
          proxyPort: this.service.proxyPort,
        }),
        201,
      )
    } catch (error: any) {
      return ctx.json(ApiResponse.error('RECORDING_ERROR', error.message), 400)
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
    return ctx.json(ApiResponse.success(sessions))
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
    }>()

    try {
      const marker = this.service.addMarker({
        url: body.url,
        action: body.action as any,
        target: body.target,
        label: body.label,
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
}
