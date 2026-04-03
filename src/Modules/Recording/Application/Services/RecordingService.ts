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
  updateSessionStats,
  type RecordingSession,
  type CapturedQuery,
  type ProxyConfig,
} from '@/Modules/Recording/Domain/Session'
import type { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'

const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_SIZE = 100

export class RecordingService {
  private currentSession: RecordingSession | null = null
  private proxy: TcpProxy | null = null
  private buffer: CapturedQuery[] = []
  private allQueries: CapturedQuery[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private _proxyPort: number | null = null

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

  async start(config: ProxyConfig): Promise<RecordingSession> {
    if (this.isRecording) {
      throw new Error('already recording: stop current session first.')
    }

    const session = createSession(config)
    this.currentSession = session

    this.proxy = new TcpProxy({
      listenPort: config.listenPort,
      targetHost: config.targetHost,
      targetPort: config.targetPort,
      parser: this.parser,
      onQuery: (query) => this.handleQuery(query),
    })

    this._proxyPort = await this.proxy.start()
    await this.repo.saveSession(session)

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)

    return session
  }

  async stop(): Promise<RecordingSession> {
    if (!this.currentSession) {
      throw new Error('No active recording session.')
    }

    const connectionCount = this.proxy?.connectionCount ?? 0

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    await this.proxy?.stop()
    this.proxy = null
    this._proxyPort = null

    // Final flush
    await this.flush()

    const stopped = stopSession(
      updateSessionStats(this.currentSession, this.allQueries, connectionCount),
    )

    await this.repo.saveSession(stopped)

    this.currentSession = null
    this.allQueries = []

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
    this.buffer.push(query)
    this.allQueries.push(query)

    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      this.flush()
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.currentSession) return
    const toFlush = [...this.buffer]
    this.buffer = []
    await this.repo.appendQueries(this.currentSession.id, toFlush)
  }
}
