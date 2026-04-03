import type {
  IProtocolParser,
  ParsedQuery,
  ParsedServerResponse,
} from '@/Modules/Recording/Domain/ProtocolParser'

const MSG_QUERY = 0x51 // 'Q'
const MSG_PARSE = 0x50 // 'P'
const MSG_COMMAND_COMPLETE = 0x43 // 'C'
const MSG_ERROR_RESPONSE = 0x45 // 'E'
const MSG_ROW_DESCRIPTION = 0x54 // 'T'
const MSG_AUTH = 0x52 // 'R'

/** Check that buffer contains a complete PG message (type + int32 length + payload) */
function isCompleteMessage(data: Buffer): boolean {
  if (data.length < 5) return false
  const declaredLength = data.readUInt32BE(1)
  return data.length >= 1 + declaredLength
}

export class PostgresProtocolParser implements IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null {
    if (!isCompleteMessage(data)) return null
    const type = data[0]
    const msgEnd = 1 + data.readUInt32BE(1)

    if (type === MSG_QUERY) {
      const payload = data.subarray(5, msgEnd)
      return { sql: payload.toString('utf-8').replace(/\0$/, '') }
    }

    if (type === MSG_PARSE) {
      const payload = data.subarray(5, msgEnd)
      const nameEnd = payload.indexOf(0)
      if (nameEnd === -1) return null
      const queryStart = nameEnd + 1
      const queryEnd = payload.indexOf(0, queryStart)
      if (queryEnd === -1) return null
      return { sql: payload.subarray(queryStart, queryEnd).toString('utf-8') }
    }

    return null
  }

  parseResponse(data: Buffer): ParsedServerResponse {
    if (!isCompleteMessage(data)) return { type: 'unknown' }
    const type = data[0]
    const msgEnd = 1 + data.readUInt32BE(1)

    if (type === MSG_COMMAND_COMPLETE) {
      const tag = data
        .subarray(5, msgEnd)
        .toString('utf-8')
        .replace(/\0$/, '')
      const rowMatch = tag.match(/\d+$/)
      return { type: 'ok', affectedRows: rowMatch ? parseInt(rowMatch[0], 10) : 0 }
    }

    if (type === MSG_ERROR_RESPONSE) {
      const payload = data.subarray(5, msgEnd)
      let message = 'Unknown error'
      let code = 0
      let offset = 0
      while (offset < payload.length) {
        const fieldType = payload[offset]
        if (fieldType === 0) break
        offset++
        const valueEnd = payload.indexOf(0, offset)
        if (valueEnd === -1) break
        const value = payload.subarray(offset, valueEnd).toString('utf-8')
        if (fieldType === 0x4d) message = value // 'M' — Message
        if (fieldType === 0x56) code = parseInt(value, 10) || 0 // 'V' — Severity numeric
        offset = valueEnd + 1
      }
      return { type: 'error', data: { code, message } }
    }

    if (type === MSG_ROW_DESCRIPTION) {
      // Need at least 7 bytes: type(1) + length(4) + field_count(2)
      if (data.length < 7) return { type: 'unknown' }
      const fieldCount = data.readUInt16BE(5)
      return {
        type: 'resultSet',
        data: { columnCount: fieldCount, columns: [], rowCount: 0, rows: [] },
      }
    }

    return { type: 'unknown' }
  }

  isHandshakePhase(data: Buffer, fromServer: boolean): boolean {
    if (!fromServer) return false
    if (data.length < 9) return false
    return data[0] === MSG_AUTH && data.readUInt32BE(5) === 0
  }
}
