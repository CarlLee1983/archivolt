import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

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
    return ctx.json(ApiResponse.success({ session, queries }))
  }
}
