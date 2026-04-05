// test/unit/Recording/Infrastructure/MysqlProtocolParser.test.ts

import { describe, it, expect } from 'vitest'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'

// MySQL packet helpers: 3-byte length (little-endian) + 1-byte sequence + payload
function buildPacket(sequenceId: number, payload: Buffer): Buffer {
  const length = Buffer.alloc(3)
  length.writeUIntLE(payload.length, 0, 3)
  const seq = Buffer.from([sequenceId])
  return Buffer.concat([length, seq, payload])
}

// COM_QUERY packet: command byte 0x03 + SQL string
function buildComQuery(sql: string, sequenceId = 0): Buffer {
  const payload = Buffer.concat([Buffer.from([0x03]), Buffer.from(sql, 'utf-8')])
  return buildPacket(sequenceId, payload)
}

// OK packet: 0x00 header + affected_rows (lenenc) + last_insert_id (lenenc)
function buildOkPacket(affectedRows: number, sequenceId = 1): Buffer {
  const payload = Buffer.from([0x00, affectedRows, 0x00, 0x00, 0x00])
  return buildPacket(sequenceId, payload)
}

// ERR packet: 0xFF header + error_code (2 bytes LE) + '#' + sqlstate (5) + message
function buildErrPacket(code: number, message: string, sequenceId = 1): Buffer {
  const header = Buffer.from([0xff])
  const errCode = Buffer.alloc(2)
  errCode.writeUInt16LE(code)
  const marker = Buffer.from('#')
  const sqlState = Buffer.from('HY000')
  const msg = Buffer.from(message, 'utf-8')
  const payload = Buffer.concat([header, errCode, marker, sqlState, msg])
  return buildPacket(sequenceId, payload)
}

// Handshake packet: starts with protocol version 10
function buildHandshakePacket(): Buffer {
  const protocolVersion = Buffer.from([0x0a])
  const serverVersion = Buffer.from('8.0.36\0', 'utf-8')
  const connectionId = Buffer.alloc(4)
  connectionId.writeUInt32LE(1)
  const filler = Buffer.alloc(30, 0)
  const payload = Buffer.concat([protocolVersion, serverVersion, connectionId, filler])
  return buildPacket(0, payload)
}

describe('MysqlProtocolParser', () => {
  const parser = new MysqlProtocolParser()

  describe('extractQuery', () => {
    it('extracts SQL from COM_QUERY packet', () => {
      const packet = buildComQuery('SELECT * FROM users')
      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe('SELECT * FROM users')
    })

    it('extracts SQL from COM_STMT_PREPARE packet', () => {
      const sql = 'SELECT * FROM users WHERE id = ?'
      // COM_STMT_PREPARE = 0x16, same wire format as COM_QUERY
      const payload = Buffer.concat([Buffer.from([0x16]), Buffer.from(sql, 'utf-8')])
      const packet = buildPacket(0, payload)
      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe(sql)
    })

    it('returns null for non-COM_QUERY packets', () => {
      // COM_QUIT = 0x01
      const payload = Buffer.from([0x01])
      const packet = buildPacket(0, payload)
      const result = parser.extractQuery(packet)
      expect(result).toBeNull()
    })

    it('handles empty SQL', () => {
      const packet = buildComQuery('')
      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe('')
    })

    it('handles multi-byte characters', () => {
      const packet = buildComQuery('SELECT * FROM users WHERE name = "測試"')
      const result = parser.extractQuery(packet)
      expect(result!.sql).toBe('SELECT * FROM users WHERE name = "測試"')
    })
  })

  describe('parseResponse', () => {
    it('parses OK packet', () => {
      const packet = buildOkPacket(5)
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('ok')
      if (result.type === 'ok') {
        expect(result.affectedRows).toBe(5)
      }
    })

    it('parses ERR packet', () => {
      const packet = buildErrPacket(1146, 'Table not found')
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.data.code).toBe(1146)
        expect(result.data.message).toBe('Table not found')
      }
    })

    it('returns resultSet for column count packets', () => {
      // A packet starting with a lenenc integer (not OK/ERR/EOF) signals result set
      const payload = Buffer.from([0x02, 0x00, 0x00])
      const packet = buildPacket(1, payload)
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('resultSet')
    })
  })

  describe('isHandshakePhase', () => {
    it('detects server handshake packet', () => {
      const packet = buildHandshakePacket()
      expect(parser.isHandshakePhase(packet, true)).toBe(true)
    })

    it('returns false for non-handshake server packet', () => {
      const packet = buildOkPacket(0)
      expect(parser.isHandshakePhase(packet, true)).toBe(false)
    })
  })
})
