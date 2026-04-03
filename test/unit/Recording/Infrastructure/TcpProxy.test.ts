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
