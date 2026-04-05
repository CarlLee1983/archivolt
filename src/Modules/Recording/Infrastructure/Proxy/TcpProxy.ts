import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import { createCapturedQuery } from '@/Modules/Recording/Domain/Session'
import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'
import type { Socket, TCPSocketListener } from 'bun'

const MAX_SAMPLE_ROWS = 10

interface TcpProxyConfig {
  readonly listenPort: number
  readonly targetHost: string
  readonly targetPort: number
  readonly sessionId: string
  readonly parser: IProtocolParser
  readonly onQuery: (query: CapturedQuery) => void
}

interface ConnectionState {
  readonly id: number
  readonly sessionId: string
  handshakeComplete: boolean
  pendingQuery: { sql: string; startTime: number } | null
  awaitingPrepareFor: string | null
  statementMap: Map<number, string>
  serverSocket: Socket<ConnectionState> | null
}

export class TcpProxy {
  private readonly config: TcpProxyConfig
  private listener: TCPSocketListener<ConnectionState> | null = null
  private _connectionCount = 0
  private connectionIdCounter = 0
  private readonly sessionId: string

  constructor(config: TcpProxyConfig) {
    this.config = config
    this.sessionId = config.sessionId
  }

  get connectionCount(): number {
    return this._connectionCount
  }

  async start(): Promise<number> {
    const { targetHost, targetPort, parser, onQuery } = this.config
    const self = this

    this.listener = Bun.listen<ConnectionState>({
      hostname: '127.0.0.1',
      port: this.config.listenPort,
      socket: {
        async open(clientSocket) {
          const connId = ++self.connectionIdCounter
          self._connectionCount++

          const state: ConnectionState = {
            id: connId,
            sessionId: self.sessionId,
            handshakeComplete: false,
            pendingQuery: null,
            awaitingPrepareFor: null,
            statementMap: new Map(),
            serverSocket: null,
          }
          clientSocket.data = state

          // Connect to the real DB
          const serverSocket = await Bun.connect<ConnectionState>({
            hostname: targetHost,
            port: targetPort,
            socket: {
              data(serverSock, data) {
                const clientState = serverSock.data
                const buf = Buffer.from(data)

                // Detect handshake phase: forward handshake packet and mark complete
                if (!clientState.handshakeComplete) {
                  clientState.handshakeComplete = true
                  clientSocket.write(data)
                  return
                }

                // Handle PREPARE_OK: map statementId → SQL, do NOT capture as query
                if (clientState.awaitingPrepareFor) {
                  const prepareResult = parser.parsePrepareResponse(buf)
                  if (prepareResult) {
                    clientState.statementMap.set(prepareResult.statementId, clientState.awaitingPrepareFor)
                    clientState.awaitingPrepareFor = null
                    clientSocket.write(data)
                    return
                  }
                }

                // Process response for pending query
                if (clientState.pendingQuery) {
                  const { sql, startTime } = clientState.pendingQuery
                  const duration = Date.now() - startTime
                  const analysis = analyzeQuery(sql)
                  const response = parser.parseResponse(buf)

                  const captured = createCapturedQuery({
                    sessionId: clientState.sessionId,
                    connectionId: clientState.id,
                    sql,
                    operation: analysis.operation,
                    tables: analysis.tables as string[],
                    duration,
                    affectedRows: response.type === 'ok' ? response.affectedRows : undefined,
                    resultSummary:
                      response.type === 'resultSet'
                        ? {
                            columnCount: response.data.columnCount,
                            rowCount: response.data.rowCount,
                            columns: response.data.columns as string[],
                            sampleRows: response.data.rows.slice(0, MAX_SAMPLE_ROWS) as Record<
                              string,
                              unknown
                            >[],
                          }
                        : undefined,
                    error: response.type === 'error' ? response.data.message : undefined,
                  })

                  onQuery(captured)
                  clientState.pendingQuery = null
                }

                // Forward to client
                clientSocket.write(data)
              },
              open(serverSock) {
                serverSock.data = state
              },
              close() {
                clientSocket.end()
              },
              error() {
                clientSocket.end()
              },
            },
          })

          state.serverSocket = serverSocket
        },

        data(clientSocket, data) {
          const state = clientSocket.data
          if (!state?.serverSocket) return

          const buf = Buffer.from(data)

          const query = parser.extractQuery(buf)
          if (query) {
            if (query.queryType === 'text') {
              state.pendingQuery = { sql: query.sql, startTime: Date.now() }
            } else {
              // PREPARE: wait for server PREPARE_OK to learn statement_id
              state.awaitingPrepareFor = query.sql
            }
          } else {
            // COM_STMT_EXECUTE: look up SQL from statement map
            const stmtExec = parser.extractStmtExecute(buf)
            if (stmtExec) {
              const sql = state.statementMap.get(stmtExec.statementId)
              if (sql) {
                state.pendingQuery = { sql, startTime: Date.now() }
              }
            }
          }

          // Forward to real DB
          state.serverSocket.write(data)
        },

        close(clientSocket) {
          const state = clientSocket.data
          if (state?.serverSocket) {
            state.serverSocket.end()
          }
          self._connectionCount--
        },

        error(clientSocket) {
          const state = clientSocket.data
          if (state?.serverSocket) {
            state.serverSocket.end()
          }
          self._connectionCount--
        },
      },
    })

    return this.listener.port
  }

  async stop(): Promise<void> {
    if (this.listener) {
      this.listener.stop()
      this.listener = null
    }
  }
}
