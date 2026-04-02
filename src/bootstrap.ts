import { PlanetCore, defineConfig } from '@gravito/core'
import { buildConfig } from '../config/index'
import { createGravitoServiceProvider } from '@/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter'
import { SchemaServiceProvider } from '@/Modules/Schema/Infrastructure/Providers/SchemaServiceProvider'
import { registerRoutes } from './routes'

export async function bootstrap(port = 3100): Promise<PlanetCore> {
  const configObj = buildConfig(port)

  const config = defineConfig({
    config: configObj,
  })

  const core = new PlanetCore(config)

  core.register(createGravitoServiceProvider(new SchemaServiceProvider()))

  await core.bootstrap()

  await registerRoutes(core)

  core.registerGlobalErrorHandlers()

  return core
}

export default bootstrap
