import { describe, it, expect } from 'vitest'
import { PostgresProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser'

describe('PostgresProtocolParser', () => {
  const parser = new PostgresProtocolParser()

  describe('extractQuery', () => {
    it('extracts SQL from Query message', () => {
      const sql = 'SELECT * FROM users'
      const sqlBuf = Buffer.from(sql + '\0', 'utf-8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + sqlBuf.length, 0)
      const packet = Buffer.concat([Buffer.from('Q'), len, sqlBuf])
      expect(parser.extractQuery(packet)?.sql).toBe(sql)
    })

    it('extracts SQL from Parse message', () => {
      const sql = 'SELECT * FROM orders WHERE id = $1'
      const body = Buffer.from('\0' + sql + '\0', 'utf-8')
      const paramCount = Buffer.alloc(2)
      paramCount.writeUInt16BE(0, 0)
      const payload = Buffer.concat([body, paramCount])
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + payload.length, 0)
      const packet = Buffer.concat([Buffer.from('P'), len, payload])
      expect(parser.extractQuery(packet)?.sql).toBe(sql)
    })

    it('returns null for non-query messages', () => {
      expect(parser.extractQuery(Buffer.from([0x42, 0, 0, 0, 4]))).toBeNull()
    })

    it('returns null for buffers shorter than 5 bytes', () => {
      expect(parser.extractQuery(Buffer.from([0x51, 0, 0]))).toBeNull()
    })

    it('returns null for truncated/fragmented Query message', () => {
      // Declare length of 20, but only provide 10 bytes total
      const packet = Buffer.alloc(10)
      packet[0] = 0x51 // 'Q'
      packet.writeUInt32BE(20, 1) // claims 20 bytes payload
      expect(parser.extractQuery(packet)).toBeNull()
    })

    it('returns null for truncated Parse message', () => {
      const packet = Buffer.alloc(8)
      packet[0] = 0x50 // 'P'
      packet.writeUInt32BE(50, 1) // claims 50 bytes but buffer is only 8
      expect(parser.extractQuery(packet)).toBeNull()
    })
  })

  describe('parseResponse', () => {
    it('parses CommandComplete', () => {
      const tag = Buffer.from('SELECT 5\0', 'utf-8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + tag.length, 0)
      const packet = Buffer.concat([Buffer.from('C'), len, tag])
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('ok')
      if (result.type === 'ok') expect(result.affectedRows).toBe(5)
    })

    it('parses CommandComplete with INSERT', () => {
      const tag = Buffer.from('INSERT 0 1\0', 'utf-8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + tag.length, 0)
      const packet = Buffer.concat([Buffer.from('C'), len, tag])
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('ok')
      if (result.type === 'ok') expect(result.affectedRows).toBe(1)
    })

    it('parses ErrorResponse', () => {
      const fields = Buffer.from('SERROR\0MTEST error\0\0', 'utf-8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + fields.length, 0)
      const packet = Buffer.concat([Buffer.from('E'), len, fields])
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('error')
      if (result.type === 'error') expect(result.data.message).toBe('TEST error')
    })

    it('parses RowDescription', () => {
      const fieldCount = Buffer.alloc(2)
      fieldCount.writeUInt16BE(3, 0)
      const len = Buffer.alloc(4)
      len.writeUInt32BE(4 + fieldCount.length, 0)
      const packet = Buffer.concat([Buffer.from('T'), len, fieldCount])
      const result = parser.parseResponse(packet)
      expect(result.type).toBe('resultSet')
      if (result.type === 'resultSet') expect(result.data.columnCount).toBe(3)
    })

    it('returns unknown for unrecognized message types', () => {
      const packet = Buffer.from([0x42, 0, 0, 0, 4])
      expect(parser.parseResponse(packet).type).toBe('unknown')
    })

    it('returns unknown for short buffers', () => {
      expect(parser.parseResponse(Buffer.from([0x43, 0])).type).toBe('unknown')
    })

    it('returns unknown for truncated CommandComplete', () => {
      const packet = Buffer.alloc(8)
      packet[0] = 0x43 // 'C'
      packet.writeUInt32BE(30, 1) // claims 30 bytes but buffer is only 8
      expect(parser.parseResponse(packet).type).toBe('unknown')
    })

    it('returns unknown for truncated RowDescription (no field_count bytes)', () => {
      // type(1) + length(4) = 5 bytes, but field_count needs 2 more
      const packet = Buffer.alloc(5)
      packet[0] = 0x54 // 'T'
      packet.writeUInt32BE(4, 1) // length = 4 (minimum, no room for field_count)
      expect(parser.parseResponse(packet).type).toBe('unknown')
    })

    it('returns unknown for fragmented ErrorResponse', () => {
      const packet = Buffer.alloc(6)
      packet[0] = 0x45 // 'E'
      packet.writeUInt32BE(100, 1) // claims 100 bytes
      expect(parser.parseResponse(packet).type).toBe('unknown')
    })
  })

  describe('isHandshakePhase', () => {
    it('detects AuthenticationOk', () => {
      const packet = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      expect(parser.isHandshakePhase(packet, true)).toBe(true)
    })

    it('returns false for client-side data', () => {
      const packet = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      expect(parser.isHandshakePhase(packet, false)).toBe(false)
    })

    it('returns false for non-auth server messages', () => {
      const packet = Buffer.from([0x54, 0, 0, 0, 6, 0, 0])
      expect(parser.isHandshakePhase(packet, true)).toBe(false)
    })

    it('returns false for short buffers', () => {
      expect(parser.isHandshakePhase(Buffer.from([0x52, 0, 0, 0]), true)).toBe(false)
    })
  })
})
