import type { PlanetCore } from '@gravito/core'
import { createGravitoModuleRouter } from '@/Shared/Infrastructure/Framework/GravitoModuleRouter'
import { SchemaController } from '@/Modules/Schema/Presentation/Controllers/SchemaController'
import { registerSchemaRoutes } from '@/Modules/Schema/Presentation/Routes/Schema.routes'

export const registerSchema = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const repo = core.container.make('jsonFileRepository') as any
  const exportService = core.container.make('exportService') as any
  const controller = new SchemaController(repo, exportService)
  registerSchemaRoutes(router, controller)
}

export { registerRecording } from './recording'
