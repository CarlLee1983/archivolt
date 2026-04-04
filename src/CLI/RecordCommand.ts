import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import {
  detectProtocol,
  resolveParser,
} from '@/Modules/Recording/Infrastructure/Proxy/ProtocolDetector'
import path from 'node:path'
import { readFileSync } from 'node:fs'

export interface RecordArgs {
  readonly subcommand: 'start' | 'stop' | 'status' | 'list' | 'summary'
  readonly targetHost?: string
  readonly targetPort?: number
  readonly listenPort: number
  readonly fromEnv?: string
  readonly sessionId?: string
  readonly protocol?: 'mysql' | 'postgres'
  readonly httpProxyTarget?: string   // e.g., "http://localhost:3000"
  readonly httpProxyPort: number      // default 4000
}

const VALID_SUBCOMMANDS = ['start', 'stop', 'status', 'list', 'summary'] as const

export function parseRecordArgs(argv: string[]): RecordArgs {
  const recordIdx = argv.indexOf('record')
  const rest = argv.slice(recordIdx + 1)

  const subcommand = rest[0] as RecordArgs['subcommand']
  if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`Missing subcommand. Available: ${VALID_SUBCOMMANDS.join(', ')}`)
  }

  const listenPort = (() => {
    const idx = rest.indexOf('--port')
    return idx !== -1 ? Number.parseInt(rest[idx + 1], 10) : 13306
  })()

  const fromEnvIdx = rest.indexOf('--from-env')
  const fromEnv = fromEnvIdx !== -1 ? rest[fromEnvIdx + 1] : undefined

  const targetIdx = rest.indexOf('--target')
  let targetHost: string | undefined
  let targetPort: number | undefined

  if (targetIdx !== -1) {
    const target = rest[targetIdx + 1]
    const parts = target.split(':')
    if (parts.length !== 2 || !parts[1]) {
      throw new Error('--target must be in format host:port (e.g., localhost:3306)')
    }
    targetHost = parts[0]
    targetPort = Number.parseInt(parts[1], 10)
  }

  if (subcommand === 'start' && !targetHost && !fromEnv) {
    throw new Error('start requires --target host:port or --from-env /path/to/.env')
  }

  const sessionId = subcommand === 'summary' ? rest[1] : undefined

  const protocolIdx = rest.indexOf('--protocol')
  const protocol =
    protocolIdx !== -1 ? (rest[protocolIdx + 1] as 'mysql' | 'postgres') : undefined

  const httpProxyIdx = rest.indexOf('--http-proxy')
  const httpProxyTarget = httpProxyIdx !== -1 ? rest[httpProxyIdx + 1] : undefined

  const httpPortIdx = rest.indexOf('--http-port')
  const httpProxyPort =
    httpPortIdx !== -1 ? Number.parseInt(rest[httpPortIdx + 1], 10) : 4000

  return { subcommand, targetHost, targetPort, listenPort, fromEnv, sessionId, protocol, httpProxyTarget, httpProxyPort }
}

function parseEnvFile(envPath: string): { host: string; port: number; driver?: string } {
  const text = readFileSync(envPath, 'utf-8')
  const lines = text.split('\n')
  const env: Record<string, string> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = value
  }

  const host = env.DB_HOST ?? 'localhost'
  const port = Number.parseInt(env.DB_PORT ?? '3306', 10)
  const driver = env.DB_CONNECTION ?? env.DB_DRIVER
  return { host, port, driver }
}

export async function runRecordCommand(argv: string[]): Promise<void> {
  const args = parseRecordArgs(argv)
  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)

  switch (args.subcommand) {
    case 'start': {
      let targetHost = args.targetHost ?? 'localhost'
      let targetPort = args.targetPort ?? 3306
      let envDriver: string | undefined

      if (args.fromEnv) {
        const envConfig = parseEnvFile(args.fromEnv)
        targetHost = envConfig.host
        targetPort = envConfig.port
        envDriver = envConfig.driver
      }

      const protocol = detectProtocol({
        targetPort,
        explicit: args.protocol,
        envDriver,
      })
      const parser = resolveParser(protocol)
      const service = new RecordingService(repo, parser)

      const session = await service.start({
        listenPort: args.listenPort,
        targetHost,
        targetPort,
      })

      // HTTP Proxy（選択的）
      let httpProxy: import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy').HttpProxyService | undefined
      if (args.httpProxyTarget) {
        const { HttpProxyService } = await import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy')
        httpProxy = new HttpProxyService({
          listenPort: args.httpProxyPort,
          targetUrl: args.httpProxyTarget,
          sessionId: session.id,
          onChunk: async (chunks) => {
            await repo.appendHttpChunks(session.id, chunks)
          },
        })
        await httpProxy.start()
      }

      console.log(`
Recording Started

Session:  ${session.id}
Protocol: ${protocol}
DB Proxy: 127.0.0.1:${service.proxyPort} → ${targetHost}:${targetPort}
${httpProxy ? `HTTP Proxy: http://127.0.0.1:${args.httpProxyPort} → ${args.httpProxyTarget}` : ''}
Point your application's DB connection to 127.0.0.1:${service.proxyPort}
${httpProxy ? `Point your HTTP traffic to http://127.0.0.1:${args.httpProxyPort}` : ''}
Press Ctrl+C to stop recording.
`)

      process.on('SIGINT', async () => {
        const stopped = await service.stop()
        httpProxy?.stop()
        console.log(`\nRecording stopped. ${stopped.stats.totalQueries} queries captured.`)
        console.log(`Session: ${stopped.id}`)
        process.exit(0)
      })

      await new Promise(() => {})
      break
    }

    case 'stop': {
      console.log('Use Ctrl+C in the recording terminal to stop.')
      break
    }

    case 'status': {
      const sessions = await repo.listSessions()
      const active = sessions.find((s) => s.status === 'recording')
      if (active) {
        console.log(`Recording in progress: ${active.id}`)
        console.log(
          `Proxy: 127.0.0.1:${active.proxy.listenPort} -> ${active.proxy.targetHost}:${active.proxy.targetPort}`,
        )
      } else {
        console.log('No active recording session.')
      }
      break
    }

    case 'list': {
      const sessions = await repo.listSessions()
      if (sessions.length === 0) {
        console.log('No recording sessions found.')
        return
      }
      for (const s of sessions) {
        const date = new Date(s.startedAt).toISOString()
        console.log(`${s.id}  ${s.status.padEnd(10)}  ${date}  ${s.stats.totalQueries} queries`)
      }
      break
    }

    case 'summary': {
      if (!args.sessionId) {
        console.error('Usage: archivolt record summary <session-id>')
        process.exit(1)
      }
      const session = await repo.loadSession(args.sessionId)
      if (!session) {
        console.error(`Session not found: ${args.sessionId}`)
        process.exit(1)
      }
      console.log(`Session:    ${session.id}`)
      console.log(`Status:     ${session.status}`)
      console.log(`Started:    ${new Date(session.startedAt).toISOString()}`)
      if (session.endedAt) {
        console.log(`Ended:      ${new Date(session.endedAt).toISOString()}`)
        console.log(`Duration:   ${((session.endedAt - session.startedAt) / 1000).toFixed(1)}s`)
      }
      console.log(`Queries:    ${session.stats.totalQueries}`)
      console.log(`Operations: ${JSON.stringify(session.stats.byOperation)}`)
      console.log(`Tables:     ${session.stats.tablesAccessed.join(', ') || '(none)'}`)
      console.log(`Connections: ${session.stats.connectionCount}`)
      break
    }
  }
}
