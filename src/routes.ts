import type { PlanetCore } from '@gravito/core'

export async function registerRoutes(core: PlanetCore) {
  core.router.get('/api', async (ctx) => {
    return ctx.json({
      success: true,
      message: 'Archivolt API',
      version: '0.1.0',
    })
  })
}
