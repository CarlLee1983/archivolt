import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { LogImportService } from '@/Modules/Recording/Application/Services/LogImportService'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'

const CANONICAL_FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/canonical.jsonl')
const PG_SLOW_FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/postgres-slow.log')
const PG_CSV_FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/postgres.csv')

describe('LogImportService', () => {
  let repo: RecordingRepository
  let repoDir: string

  beforeEach(() => {
    repoDir = `/tmp/archivolt-test-import-${Date.now()}`
    repo = new RecordingRepository(repoDir)
  })

  it('creates a virtual session with correct query count', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')

    const session = await repo.loadSession(sessionId)
    expect(session).not.toBeNull()
    expect(session!.status).toBe('stopped')
    expect(session!.stats.totalQueries).toBe(3)
  })

  it('session id starts with imp_', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    expect(sessionId).toMatch(/^imp_/)
  })

  it('persists queries to JSONL', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    const queries = await repo.loadQueries(sessionId)
    expect(queries).toHaveLength(3)
  })

  it('infers operation and tables from SQL', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(CANONICAL_FIXTURE, 'canonical')
    const queries = await repo.loadQueries(sessionId)
    const selectQuery = queries.find((q) => q.operation === 'SELECT')
    expect(selectQuery).toBeDefined()
    expect(selectQuery!.tables).toContain('users')
  })

  it('routes postgres-slow-log to PostgresSlowQueryLogParser', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(PG_SLOW_FIXTURE, 'postgres-slow-log')
    const queries = await repo.loadQueries(sessionId)
    expect(queries.length).toBeGreaterThan(0)
    // duration is mapped from durationMs
    const slow = queries.find((q) => q.duration > 0)
    expect(slow).toBeDefined()
  })

  it('routes postgres-csv-log to PostgresCsvLogParser', async () => {
    const svc = new LogImportService(repo)
    const sessionId = await svc.import(PG_CSV_FIXTURE, 'postgres-csv-log')
    const queries = await repo.loadQueries(sessionId)
    // CSV fixture has 3 LOG rows (1 WARNING skipped)
    expect(queries).toHaveLength(3)
  })
})
