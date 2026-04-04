import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'
import type { StatusController } from '../Controllers/StatusController'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'

export function registerRecordingRoutes(
  router: IModuleRouter,
  controller: RecordingController,
  statusController: StatusController,
  _service: RecordingService,
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
  })
}
