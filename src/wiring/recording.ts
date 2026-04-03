import type { PlanetCore } from '@gravito/core'
import { createGravitoModuleRouter } from '@/Shared/Infrastructure/Framework/GravitoModuleRouter'
import { RecordingController } from '@/Modules/Recording/Presentation/Controllers/RecordingController'
import { registerRecordingRoutes } from '@/Modules/Recording/Presentation/Routes/Recording.routes'
import type { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

export const registerRecording = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const service = core.container.make('recordingService') as RecordingService
  const repo = core.container.make('recordingRepository') as RecordingRepository
  const controller = new RecordingController(service, repo)
  registerRecordingRoutes(router, controller)
}
