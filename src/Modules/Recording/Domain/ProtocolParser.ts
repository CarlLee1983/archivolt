export interface ParsedQuery {
  readonly sql: string
  readonly queryType: 'text' | 'prepare'
}

export interface ParsedResultSet {
  readonly columnCount: number
  readonly columns: readonly string[]
  readonly rowCount: number
  readonly rows: readonly Record<string, unknown>[]
  readonly affectedRows?: number
}

export interface ParsedError {
  readonly code: number
  readonly message: string
}

export type ParsedServerResponse =
  | { readonly type: 'resultSet'; readonly data: ParsedResultSet }
  | { readonly type: 'ok'; readonly affectedRows: number }
  | { readonly type: 'error'; readonly data: ParsedError }
  | { readonly type: 'unknown' }

export interface IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null
  extractStmtExecute(data: Buffer): { statementId: number } | null
  parsePrepareResponse(data: Buffer): { statementId: number } | null
  parseResponse(data: Buffer): ParsedServerResponse
  isHandshakePhase(data: Buffer, fromServer: boolean): boolean
}
