import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RecordingRepository } from './RecordingRepository'
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

describe('RecordingRepository (WriteStream)', () => {
  let tmpDir: string

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('openStreams → appendQueries × 3 → closeStreams → JSONL 有 3 行', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_1')
    repo.appendQueries('sess_1', [makeQuery('q1', 'SELECT 1')])
    repo.appendQueries('sess_1', [makeQuery('q2', 'SELECT 2')])
    repo.appendQueries('sess_1', [makeQuery('q3', 'SELECT 3')])
    await repo.closeStreams('sess_1')

    const content = await readFile(
      path.join(tmpDir, 'sess_1', 'queries.jsonl'),
      'utf-8',
    )
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).id).toBe('q1')
    expect(JSON.parse(lines[2]).id).toBe('q3')
  })

  it('closeStreams 後再 appendQueries 靜默忽略（不 throw）', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    repo.openStreams('sess_2')
    await repo.closeStreams('sess_2')

    // 不應 throw
    expect(() => repo.appendQueries('sess_2', [makeQuery('q1', 'SELECT 1')])).not.toThrow()
  })

  it('appendQueries 批次寫入，每筆皆保留', async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'repo-test-'))
    const repo = new RecordingRepository(tmpDir)

    const batch = Array.from({ length: 100 }, (_, i) => makeQuery(`q${i}`, `SELECT ${i}`))
    repo.openStreams('sess_3')
    repo.appendQueries('sess_3', batch)
    await repo.closeStreams('sess_3')

    const content = await readFile(
      path.join(tmpDir, 'sess_3', 'queries.jsonl'),
      'utf-8',
    )
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(100)
  })
})
