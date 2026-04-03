import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { createSession, createCapturedQuery, type ProxyConfig } from '@/Modules/Recording/Domain/Session'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const TEST_DIR = path.resolve(import.meta.dirname, '../../../__test_recordings__')

const proxyConfig: ProxyConfig = {
  listenPort: 13306,
  targetHost: 'localhost',
  targetPort: 3306,
}

describe('RecordingRepository', () => {
  let repo: RecordingRepository

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  describe('saveSession / loadSession', () => {
    it('saves and loads a session', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)
      const loaded = await repo.loadSession(session.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe(session.id)
      expect(loaded!.status).toBe('recording')
      expect(loaded!.proxy).toEqual(proxyConfig)
    })

    it('returns null for non-existent session', async () => {
      const loaded = await repo.loadSession('nonexistent')
      expect(loaded).toBeNull()
    })
  })

  describe('appendQueries / loadQueries', () => {
    it('appends and loads queries in JSONL format', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)

      const q1 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT * FROM users',
        operation: 'SELECT',
        tables: ['users'],
        duration: 5,
      })
      const q2 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'INSERT INTO orders (user_id) VALUES (1)',
        operation: 'INSERT',
        tables: ['orders'],
        duration: 3,
      })

      await repo.appendQueries(session.id, [q1, q2])

      const loaded = await repo.loadQueries(session.id)
      expect(loaded.length).toBe(2)
      expect(loaded[0].sql).toBe('SELECT * FROM users')
      expect(loaded[1].sql).toBe('INSERT INTO orders (user_id) VALUES (1)')
    })

    it('appends across multiple calls', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)

      const q1 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT 1',
        operation: 'SELECT',
        tables: [],
        duration: 1,
      })
      const q2 = createCapturedQuery({
        sessionId: session.id,
        connectionId: 1,
        sql: 'SELECT 2',
        operation: 'SELECT',
        tables: [],
        duration: 1,
      })

      await repo.appendQueries(session.id, [q1])
      await repo.appendQueries(session.id, [q2])

      const loaded = await repo.loadQueries(session.id)
      expect(loaded.length).toBe(2)
    })

    it('returns empty array for session with no queries', async () => {
      const session = createSession(proxyConfig)
      await repo.saveSession(session)
      const loaded = await repo.loadQueries(session.id)
      expect(loaded).toEqual([])
    })
  })

  describe('listSessions', () => {
    it('lists all sessions', async () => {
      const s1 = createSession(proxyConfig)
      const s2 = createSession(proxyConfig)
      await repo.saveSession(s1)
      await repo.saveSession(s2)

      const sessions = await repo.listSessions()
      expect(sessions.length).toBe(2)
      const ids = sessions.map((s) => s.id)
      expect(ids).toContain(s1.id)
      expect(ids).toContain(s2.id)
    })

    it('returns empty array when no sessions', async () => {
      const sessions = await repo.listSessions()
      expect(sessions).toEqual([])
    })
  })
})
