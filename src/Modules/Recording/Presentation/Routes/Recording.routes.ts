import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { RecordingController } from '../Controllers/RecordingController'

export function registerRecordingRoutes(router: IModuleRouter, controller: RecordingController): void {
  router.group('/api', (r) => {
    r.post('/recording/start', (ctx) => controller.start(ctx))
    r.post('/recording/stop', (ctx) => controller.stop(ctx))
    r.get('/recording/status', (ctx) => controller.status(ctx))
    r.get('/recordings', (ctx) => controller.list(ctx))
    r.get('/recordings/:id', (ctx) => controller.getSession(ctx))
  })
}
