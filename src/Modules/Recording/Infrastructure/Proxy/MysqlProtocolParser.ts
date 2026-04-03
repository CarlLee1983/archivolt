import type {
  IProtocolParser,
  ParsedQuery,
  ParsedServerResponse,
} from '@/Modules/Recording/Domain/ProtocolParser'

// MySQL Command Bytes
const COM_QUERY = 0x03

// MySQL Response Headers
const OK_HEADER = 0x00
const ERR_HEADER = 0xff
const EOF_HEADER = 0xfe

// Handshake protocol version
const PROTOCOL_VERSION_10 = 0x0a

function readPacketPayload(data: Buffer): { sequenceId: number; payload: Buffer } | null {
  if (data.length < 4) return null
  const payloadLength = data.readUIntLE(0, 3)
  const sequenceId = data[3]
  if (data.length < 4 + payloadLength) return null
  const payload = data.subarray(4, 4 + payloadLength)
  return { sequenceId, payload }
}

function readLenencInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  const first = buf[offset]
  if (first < 0xfb) return { value: first, bytesRead: 1 }
  if (first === 0xfc) return { value: buf.readUInt16LE(offset + 1), bytesRead: 3 }
  if (first === 0xfd) return { value: buf.readUIntLE(offset + 1, 3), bytesRead: 4 }
  // 0xfe — 8-byte int, truncate to number for our purposes
  return { value: Number(buf.readBigUInt64LE(offset + 1)), bytesRead: 9 }
}

export class MysqlProtocolParser implements IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null {
    const packet = readPacketPayload(data)
    if (!packet) return null

    const { payload } = packet
    if (payload.length < 1) return null
    if (payload[0] !== COM_QUERY) return null

    const sql = payload.subarray(1).toString('utf-8')
    return { sql }
  }

  parseResponse(data: Buffer): ParsedServerResponse {
    const packet = readPacketPayload(data)
    if (!packet) return { type: 'unknown' }

    const { payload } = packet
    if (payload.length < 1) return { type: 'unknown' }

    const header = payload[0]

    if (header === OK_HEADER && payload.length >= 2) {
      const { value: affectedRows } = readLenencInt(payload, 1)
      return { type: 'ok', affectedRows }
    }

    if (header === ERR_HEADER && payload.length >= 4) {
      const code = payload.readUInt16LE(1)
      // Skip '#' marker (1 byte) + SQL state (5 bytes) if present
      let msgOffset = 3
      if (payload.length > 3 && payload[3] === 0x23) {
        // '#' marker present
        msgOffset = 9 // 1 (header) + 2 (code) + 1 ('#') + 5 (sqlstate)
      }
      const message = payload.subarray(msgOffset).toString('utf-8')
      return { type: 'error', data: { code, message } }
    }

    // Column count packet signals result set start
    if (header !== EOF_HEADER && header !== OK_HEADER && header !== ERR_HEADER) {
      const { value: columnCount } = readLenencInt(payload, 0)
      return {
        type: 'resultSet',
        data: {
          columnCount,
          columns: [],
          rowCount: 0,
          rows: [],
        },
      }
    }

    return { type: 'unknown' }
  }

  isHandshakePhase(data: Buffer, fromServer: boolean): boolean {
    if (!fromServer) return false
    const packet = readPacketPayload(data)
    if (!packet) return false
    if (packet.sequenceId !== 0) return false
    return packet.payload.length > 0 && packet.payload[0] === PROTOCOL_VERSION_10
  }
}
