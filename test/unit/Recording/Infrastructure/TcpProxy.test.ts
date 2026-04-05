import { describe, it, expect, afterEach } from 'vitest'
import { TcpProxy } from '@/Modules/Recording/Infrastructure/Proxy/TcpProxy'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { TCPSocketListener } from 'bun'

// Helper: build a MySQL COM_QUERY packet
function buildComQuery(sql: string): Buffer {
  const sqlBuf = Buffer.from(sql, 'utf-8')
  const payloadLen = 1 + sqlBuf.length
  const header = Buffer.alloc(4)
  header.writeUIntLE(payloadLen, 0, 3)
  header[3] = 0 // sequence id
  return Buffer.concat([header, Buffer.from([0x03]), sqlBuf])
}

// Helper: build a MySQL OK packet
function buildOkPacket(affectedRows: number): Buffer {
  const payload = Buffer.from([0x00, affectedRows, 0x00, 0x00, 0x00])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 1
  return Buffer.concat([header, payload])
}

// Helper: build a handshake packet
function buildHandshakePacket(): Buffer {
  const protocolVersion = Buffer.from([0x0a])
  const serverVersion = Buffer.from('8.0.36\0', 'utf-8')
  const connectionId = Buffer.alloc(4)
  connectionId.writeUInt32LE(1)
  const filler = Buffer.alloc(30, 0)
  const payload = Buffer.concat([protocolVersion, serverVersion, connectionId, filler])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 0
  return Buffer.concat([header, payload])
}

describe('TcpProxy', () => {
  let proxy: TcpProxy | null = null
  let mockDb: TCPSocketListener<unknown> | null = null

  afterEach(async () => {
    if (proxy) {
      await proxy.stop()
      proxy = null
    }
    if (mockDb) {
      mockDb.stop()
      mockDb = null
    }
  })

  it('forwards data between client and server', async () => {
    const handshake = buildHandshakePacket()
    const okResponse = buildOkPacket(1)

    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) {
          socket.write(handshake)
        },
        data(socket, _data) {
          socket.write(okResponse)
        },
        close() {},
        error() {},
      },
    })

    const mockDbPort = mockDb.port
    const captured: CapturedQuery[] = []

    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDbPort,
      sessionId: 'test-session',
      parser: new MysqlProtocolParser(),
      onQuery: (query) => {
        captured.push(query)
      },
    })

    const proxyPort = await proxy.start()

    const client = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    })

    await new Promise((r) => setTimeout(r, 100))

    const queryPacket = buildComQuery('SELECT * FROM users')
    client.write(queryPacket)

    await new Promise((r) => setTimeout(r, 200))

    client.end()

    expect(captured.length).toBeGreaterThanOrEqual(1)
    expect(captured[0].sql).toBe('SELECT * FROM users')
    expect(captured[0].operation).toBe('SELECT')
    expect(captured[0].tables).toContain('users')
  })

  it('captures COM_STMT_EXECUTE as query with correct SQL (not COM_STMT_PREPARE)', async () => {
    const handshake = buildHandshakePacket()

    // Build PREPARE_OK: 0x00 + uint32LE(statementId=1) + num_columns(2) + num_params(1) + reserved + warnings
    function buildPrepareOk(statementId: number): Buffer {
      const payload = Buffer.alloc(12)
      payload[0] = 0x00
      payload.writeUInt32LE(statementId, 1)
      payload.writeUInt16LE(1, 5)  // num_columns
      payload.writeUInt16LE(1, 7)  // num_params
      const header = Buffer.alloc(4)
      header.writeUIntLE(payload.length, 0, 3)
      header[3] = 1
      return Buffer.concat([header, payload])
    }

    // Build COM_STMT_EXECUTE: 0x17 + uint32LE(statementId) + flags + iteration-count
    function buildStmtExecute(statementId: number): Buffer {
      const payload = Buffer.alloc(10)
      payload[0] = 0x17
      payload.writeUInt32LE(statementId, 1)
      payload[5] = 0x00
      payload.writeUInt32LE(1, 6)
      const header = Buffer.alloc(4)
      header.writeUIntLE(payload.length, 0, 3)
      header[3] = 0
      return Buffer.concat([header, payload])
    }

    let prepareReceived = false
    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) { socket.write(handshake) },
        data(socket, data) {
          const buf = Buffer.from(data)
          if (buf.length >= 5 && buf[4] === 0x16) {
            // PREPARE → respond with PREPARE_OK(statementId=1)
            prepareReceived = true
            socket.write(buildPrepareOk(1))
          } else if (buf.length >= 5 && buf[4] === 0x17) {
            // EXECUTE → respond with OK
            socket.write(buildOkPacket(1))
          }
        },
        close() {},
        error() {},
      },
    })

    const captured: CapturedQuery[] = []
    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDb.port,
      sessionId: 'test-session',
      parser: new MysqlProtocolParser(),
      onQuery: (q) => captured.push(q),
    })

    const proxyPort = await proxy.start()
    const client = await Bun.connect({
      hostname: '127.0.0.1', port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })
    await new Promise((r) => setTimeout(r, 100))

    // Step 1: PREPARE
    const sql = 'SELECT * FROM users WHERE id = ?'
    const preparePacket = (() => {
      const payload = Buffer.concat([Buffer.from([0x16]), Buffer.from(sql, 'utf-8')])
      const header = Buffer.alloc(4)
      header.writeUIntLE(payload.length, 0, 3)
      header[3] = 0
      return Buffer.concat([header, payload])
    })()
    client.write(preparePacket)
    await new Promise((r) => setTimeout(r, 200))

    // PREPARE alone must NOT produce a captured query
    expect(prepareReceived).toBe(true)
    expect(captured).toHaveLength(0)

    // Step 2: EXECUTE → should now produce exactly one capture
    client.write(buildStmtExecute(1))
    await new Promise((r) => setTimeout(r, 200))
    client.end()

    expect(captured).toHaveLength(1)
    expect(captured[0].sql).toBe(sql)
    expect(captured[0].operation).toBe('SELECT')
  })

  it('uses the sessionId from config in captured queries', async () => {
    const handshake = buildHandshakePacket()
    const okResponse = buildOkPacket(1)

    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) { socket.write(handshake) },
        data(socket) { socket.write(okResponse) },
        close() {},
        error() {},
      },
    })

    const captured: CapturedQuery[] = []
    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDb.port,
      sessionId: 'my-session-123',
      parser: new MysqlProtocolParser(),
      onQuery: (q) => captured.push(q),
    })

    const proxyPort = await proxy.start()
    const client = await Bun.connect({
      hostname: '127.0.0.1', port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })
    await new Promise((r) => setTimeout(r, 100))
    client.write(buildComQuery('SELECT 1'))
    await new Promise((r) => setTimeout(r, 200))
    client.end()

    expect(captured[0].sessionId).toBe('my-session-123')
  })

  it('reports connection count', async () => {
    const handshake = buildHandshakePacket()

    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) {
          socket.write(handshake)
        },
        data() {},
        close() {},
        error() {},
      },
    })

    proxy = new TcpProxy({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: mockDb.port,
      sessionId: 'test-session',
      parser: new MysqlProtocolParser(),
      onQuery: () => {},
    })

    const proxyPort = await proxy.start()

    const c1 = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(proxy.connectionCount).toBe(1)

    c1.end()
    await new Promise((r) => setTimeout(r, 50))
  })
})
