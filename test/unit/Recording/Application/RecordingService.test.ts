import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const TEST_DIR = path.resolve(import.meta.dirname, '../../../__test_rec_service__')

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

function buildOkPacket(): Buffer {
  const payload = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00])
  const header = Buffer.alloc(4)
  header.writeUIntLE(payload.length, 0, 3)
  header[3] = 1
  return Buffer.concat([header, payload])
}

function buildComQuery(sql: string): Buffer {
  const sqlBuf = Buffer.from(sql, 'utf-8')
  const payloadLen = 1 + sqlBuf.length
  const header = Buffer.alloc(4)
  header.writeUIntLE(payloadLen, 0, 3)
  header[3] = 0
  return Buffer.concat([header, Buffer.from([0x03]), sqlBuf])
}

describe('RecordingService', () => {
  let service: RecordingService
  let repo: RecordingRepository
  let mockDb: ReturnType<typeof Bun.listen> | null = null

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
    service = new RecordingService(repo, new MysqlProtocolParser())
  })

  afterEach(async () => {
    if (service.isRecording) {
      await service.stop()
    }
    if (mockDb) {
      mockDb.stop()
      mockDb = null
    }
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  function startMockDb(): number {
    const handshake = buildHandshakePacket()
    const ok = buildOkPacket()
    mockDb = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) { socket.write(handshake) },
        data(socket) { socket.write(ok) },
        close() {},
        error() {},
      },
    })
    return mockDb.port
  }

  it('starts and stops a recording session', async () => {
    const dbPort = startMockDb()
    const session = await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    expect(session.status).toBe('recording')
    expect(service.isRecording).toBe(true)

    const stopped = await service.stop()
    expect(stopped.status).toBe('stopped')
    expect(stopped.endedAt).toBeDefined()
    expect(service.isRecording).toBe(false)
  })

  it('throws if starting while already recording', async () => {
    const dbPort = startMockDb()
    await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    await expect(
      service.start({ listenPort: 0, targetHost: '127.0.0.1', targetPort: dbPort }),
    ).rejects.toThrow('already recording')
  })

  it('captures queries during session', async () => {
    const dbPort = startMockDb()
    await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    const proxyPort = service.proxyPort!

    const client = await Bun.connect({
      hostname: '127.0.0.1',
      port: proxyPort,
      socket: { data() {}, open() {}, close() {}, error() {} },
    })

    await new Promise((r) => setTimeout(r, 100))
    client.write(buildComQuery('INSERT INTO orders (user_id) VALUES (1)'))
    await new Promise((r) => setTimeout(r, 200))
    client.end()

    const stopped = await service.stop()
    const queries = await repo.loadQueries(stopped.id)

    expect(queries.length).toBeGreaterThanOrEqual(1)
    expect(queries[0].sql).toBe('INSERT INTO orders (user_id) VALUES (1)')
  })

  it('returns session status', async () => {
    expect(service.status()).toBeNull()

    const dbPort = startMockDb()
    await service.start({
      listenPort: 0,
      targetHost: '127.0.0.1',
      targetPort: dbPort,
    })

    const status = service.status()
    expect(status).not.toBeNull()
    expect(status!.status).toBe('recording')
  })
})
