import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import {
  createMarker,
  type OperationMarker,
  type MarkerAction,
  type MarkerRequestDetail,
} from '@/Modules/Recording/Domain/OperationMarker'
import {
  createSession,
  stopSession,
  applyIncrementalStats,
  type IncrementalStats,
  type RecordingSession,
  type CapturedQuery,
  type ProxyConfig,
} from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'

export class RecordingService {
  private currentSession: RecordingSession | null = null
  private proxy: TcpProxy | null = null
  private _proxyPort: number | null = null
  private httpProxy: import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy').HttpProxyService | null = null
  private _httpChunkCount = 0
  private stats: IncrementalStats = {
    totalQueries: 0,
    byOperation: {},
    tablesAccessed: new Set(),
  }

  constructor(
    private readonly repo: RecordingRepository,
    private readonly parser: IProtocolParser,
  ) {}

  get isRecording(): boolean {
    return this.currentSession !== null && this.currentSession.status === 'recording'
  }

  get proxyPort(): number | null {
    return this._proxyPort
  }

  getHttpProxyStatus(): { running: boolean; port: number | null; target: string | null } {
    if (!this.httpProxy) return { running: false, port: null, target: null }
    return {
      running: true,
      port: this.httpProxy.port,
      target: this.httpProxy.target,
    }
  }

  async startHttpProxy(config: { port: number; target: string; sessionId: string }): Promise<void> {
    const { HttpProxyService } = await import('@/Modules/Recording/Infrastructure/Proxy/HttpProxy')
    this.httpProxy = new HttpProxyService({
      listenPort: config.port,
      targetUrl: config.target,
      sessionId: config.sessionId,
      onChunk: async (chunks) => {
        this._httpChunkCount += chunks.length
        this.repo.appendHttpChunks(config.sessionId, chunks)
      },
    })
    await this.httpProxy.start()
  }

  getLiveStats(): {
    sessionId: string
    elapsedSeconds: number
    db: { qps: number; totalQueries: number }
    http: { chunksPerSecond: number; totalChunks: number } | null
  } | null {
    if (!this.currentSession || !this.isRecording) return null

    const elapsedSeconds = Math.floor((Date.now() - this.currentSession.startedAt) / 1000)

    return {
      sessionId: this.currentSession.id,
      elapsedSeconds,
      db: {
        qps: elapsedSeconds > 0 ? Math.round(this.stats.totalQueries / elapsedSeconds) : 0,
        totalQueries: this.stats.totalQueries,
      },
      http: this.httpProxy
        ? {
            chunksPerSecond: elapsedSeconds > 0 ? Math.round(this._httpChunkCount / elapsedSeconds) : 0,
            totalChunks: this._httpChunkCount,
          }
        : null,
    }
  }

  getProtocol(): 'mysql' | 'postgres' | null {
    if (!this.currentSession) return null
    const parserName = this.parser.constructor.name.toLowerCase()
    return parserName.includes('mysql') ? 'mysql' : 'postgres'
  }

  async start(config: ProxyConfig): Promise<RecordingSession> {
    if (this.isRecording) {
      throw new Error('already recording: stop current session first.')
    }

    const session = createSession(config)
    this.currentSession = session
    this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }

    this.proxy = new TcpProxy({
      listenPort: config.listenPort,
      targetHost: config.targetHost,
      targetPort: config.targetPort,
      sessionId: session.id,
      parser: this.parser,
      onQuery: (query) => this.handleQuery(query),
    })

    try {
      this._proxyPort = await this.proxy.start()
    } catch (err) {
      this.proxy = null
      this.currentSession = null
      this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }
      throw err
    }

    this.repo.openStreams(session.id)
    await this.repo.saveSession(session)

    return session
  }

  async stop(): Promise<RecordingSession> {
    if (!this.currentSession) {
      throw new Error('No active recording session.')
    }

    const connectionCount = this.proxy?.connectionCount ?? 0

    await this.proxy?.stop()
    this.proxy = null
    this._proxyPort = null

    this.httpProxy?.stop()
    this.httpProxy = null
    this._httpChunkCount = 0

    await this.repo.closeStreams(this.currentSession.id)

    const stopped = stopSession(
      applyIncrementalStats(this.currentSession, this.stats, connectionCount),
    )
    await this.repo.saveSession(stopped)

    this.currentSession = null
    this.stats = { totalQueries: 0, byOperation: {}, tablesAccessed: new Set() }

    return stopped
  }

  status(): RecordingSession | null {
    return this.currentSession
  }

  addMarker(params: {
    url: string
    action: MarkerAction
    target?: string
    label?: string
    request?: MarkerRequestDetail
  }): OperationMarker {
    if (!this.currentSession) {
      throw new Error('No active recording session.')
    }

    const marker = createMarker({
      sessionId: this.currentSession.id,
      ...params,
    })

    this.repo.appendMarkers(this.currentSession.id, [marker])
    return marker
  }

  private handleQuery(query: CapturedQuery): void {
    if (!this.currentSession) return
    this.repo.appendQueries(this.currentSession.id, [query])
    this.stats.totalQueries++
    this.stats.byOperation[query.operation] = (this.stats.byOperation[query.operation] ?? 0) + 1
    for (const t of query.tables) {
      this.stats.tablesAccessed.add(t)
    }
  }
}
