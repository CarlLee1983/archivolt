import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeQuery(id: string, sql: string): CapturedQuery {
  return {
    id,
    sessionId: 'sess_1',
    connectionId: 1,
    timestamp: Date.now(),
    duration: 5,
    sql,
    operation: 'SELECT',
    tables: ['users'],
  }
}

describe('RecordingRepository WriteStream', () => {
  let tmpDir: string

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('openStreams → appendQueries × 3 → closeStreams writes 3 JSONL lines', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-streams-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_1')
    repo.appendQueries('sess_1', [makeQuery('q1', 'SELECT 1')])
    repo.appendQueries('sess_1', [makeQuery('q2', 'SELECT 2')])
    repo.appendQueries('sess_1', [makeQuery('q3', 'SELECT 3')])
    await repo.closeStreams('sess_1')

    const content = await readFile(path.join(tmpDir, 'sess_1', 'queries.jsonl'), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).id).toBe('q1')
    expect(JSON.parse(lines[2]).id).toBe('q3')
  })

  it('appendQueries after closeStreams silently ignores (does not throw)', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-streams-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_2')
    await repo.closeStreams('sess_2')

    expect(() => repo.appendQueries('sess_2', [makeQuery('q1', 'SELECT 1')])).not.toThrow()
  })

  it('batch appendQueries preserves all 100 entries', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-streams-test-'))
    const repo = new RecordingRepository(tmpDir)

    const batch = Array.from({ length: 100 }, (_, i) => makeQuery(`q${i}`, `SELECT ${i}`))
    repo.openStreams('sess_3')
    repo.appendQueries('sess_3', batch)
    await repo.closeStreams('sess_3')

    const content = await readFile(path.join(tmpDir, 'sess_3', 'queries.jsonl'), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(100)
  })

  it('openStreams called twice for same session throws', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-streams-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_dup')
    expect(() => repo.openStreams('sess_dup')).toThrow('openStreams called twice')

    await repo.closeStreams('sess_dup')
  })
})
