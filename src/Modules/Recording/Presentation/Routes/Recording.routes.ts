import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'
import type { StatusController } from '../Controllers/StatusController'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'

export function registerRecordingRoutes(
  router: IModuleRouter,
  controller: RecordingController,
  statusController: StatusController,
  service: RecordingService,
): void {
  router.group('/api', (r) => {
    r.get('/status', (ctx) => statusController.getStatus(ctx))
    r.post('/recording/start', (ctx) => controller.start(ctx))
    r.post('/recording/stop', (ctx) => controller.stop(ctx))
    r.get('/recording/status', (ctx) => controller.status(ctx))
    r.get('/recordings', (ctx) => controller.list(ctx))
    r.get('/recordings/:id', (ctx) => controller.getSession(ctx))
    r.post('/recording/marker', (ctx) => controller.addMarker(ctx))
    r.get('/recordings/:id/markers', (ctx) => controller.getMarkers(ctx))
    r.get('/recordings/:id/chunks', (ctx) => controller.getChunks(ctx))
    r.get('/recordings/:id/chunks/:chunkId/queries', (ctx) => controller.getChunkQueries(ctx))
    r.get('/recordings/:id/manifest', (ctx) => controller.getManifest(ctx))
    r.get('/report/:id/:type', (ctx) => controller.getReport(ctx))
    r.post('/recordings/:id/analyze', (ctx) => controller.triggerAnalysis(ctx))
    r.get('/recordings/:id/analyze/stream', (ctx) => controller.streamAnalysis(ctx))

    // SSE — 回傳 raw Response（繞過 IHttpContext，直接以 ReadableStream 推送事件）
    r.get('/recording/live', async (_ctx) => {
      let timer: ReturnType<typeof setInterval> | null = null
      const stream = new ReadableStream({
        start(streamController) {
          const send = (event: string, data: unknown) => {
            streamController.enqueue(
              new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            )
          }
          timer = setInterval(() => {
            try {
              const stats = service.getLiveStats()
              if (stats) send('stats', stats)
              else send('idle', { recording: false })
            } catch {
              // getLiveStats 不應拋錯，若發生則靜默跳過本次推送
            }
          }, 1000)
        },
        cancel() {
          if (timer) clearInterval(timer)
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': 'http://localhost:5173',
        },
      })
    })
  })
}
