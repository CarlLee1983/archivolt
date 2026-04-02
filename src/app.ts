import bootstrap from './bootstrap'

export async function createApp() {
  const port = (process.env.PORT as unknown as number) || 3100
  const core = await bootstrap(port)
  return core
}
