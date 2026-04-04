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
    return {
      running: false,
      port: null,
      target: null,
    }
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
