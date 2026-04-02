import { PlanetCore, defineConfig } from '@gravito/core'
import { buildConfig } from '../config/index'
import { registerRoutes } from './routes'

export async function bootstrap(port = 3100): Promise<PlanetCore> {
  const configObj = buildConfig(port)

  const config = defineConfig({
    config: configObj,
  })

  const core = new PlanetCore(config)

  await core.bootstrap()

  await registerRoutes(core)

  core.registerGlobalErrorHandlers()

  return core
}

export default bootstrap
