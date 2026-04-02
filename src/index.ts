import { createApp } from './app'

async function start() {
  const core = await createApp()

  const port = (core.config.get<number>('PORT') ?? 3100) as number
  const server = core.liftoff(port)

  console.log(`
╔══════════════════════════════════════════╗
║        🏛️  Archivolt — Running            ║
╚══════════════════════════════════════════╝

📍 URL: http://localhost:${port}
📌 API: http://localhost:${port}/api
`)

  return server
}

const server = await start().catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})

export default server
