import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

export class StatusController {
  constructor(
    private readonly service: RecordingService,
    private readonly repo: RecordingRepository,
  ) {}

  async getStatus(ctx: IHttpContext): Promise<Response> {
    const dbRunning = this.service.isRecording
    const httpStatus = this.service.getHttpProxyStatus()
    const schemaLoaded = await this.repo.exists()

    return ctx.json(
      ApiResponse.success({
        proxy: {
          db: {
            running: dbRunning,
            port: dbRunning ? this.service.proxyPort : null,
            sessionId: this.service.status()?.id ?? null,
            protocol: this.service.getProtocol(),
          },
          http: {
            running: httpStatus.running,
            port: httpStatus.port,
            target: httpStatus.target,
          },
        },
        server: {
          version: '0.3.0',
          uptimeSeconds: Math.floor(process.uptime()),
        },
        schema: {
          loaded: schemaLoaded,
          tableCount: await this.repo.getTableCount(),
          hasGroups: await this.repo.hasGroups(),
        },
      }),
    )
  }
}
