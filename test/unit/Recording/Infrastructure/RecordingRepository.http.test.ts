import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import type { HttpChunk } from '@/Modules/Recording/Domain/HttpChunk'

const TEST_DIR = '/tmp/archivolt-test-repo-http'

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
}

afterEach(cleanup)

function makeHttpChunk(overrides: Partial<HttpChunk> = {}): HttpChunk {
  return {
    type: 'http_request',
    timestamp: 1000,
    sessionId: 'rec_1',
    requestId: 'req-abc',
    method: 'GET',
    url: 'http://localhost:3000/users/123',
    path: '/users/123',
    requestHeaders: { 'content-type': 'application/json' },
    ...overrides,
  }
}

describe('RecordingRepository HTTP chunks', () => {
  it('appendHttpChunks writes to http_chunks.jsonl and loadHttpChunks reads them back', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })

    const chunk1 = makeHttpChunk({ requestId: 'req-1' })
    const chunk2 = makeHttpChunk({ requestId: 'req-2', type: 'http_response', statusCode: 200 })

    repo.openStreams('rec_1')
    repo.appendHttpChunks('rec_1', [chunk1, chunk2])
    await repo.closeStreams('rec_1')
    const loaded = await repo.loadHttpChunks('rec_1')

    expect(loaded).toHaveLength(2)
    expect(loaded[0].requestId).toBe('req-1')
    expect(loaded[1].requestId).toBe('req-2')
    expect(loaded[1].statusCode).toBe(200)
  })

  it('loadHttpChunks returns empty array when file does not exist', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })
    const loaded = await repo.loadHttpChunks('rec_1')
    expect(loaded).toEqual([])
  })

  it('appendHttpChunks is idempotent — multiple calls append, not overwrite', async () => {
    const repo = new RecordingRepository(TEST_DIR)
    mkdirSync(`${TEST_DIR}/rec_1`, { recursive: true })

    repo.openStreams('rec_1')
    repo.appendHttpChunks('rec_1', [makeHttpChunk({ requestId: 'a' })])
    repo.appendHttpChunks('rec_1', [makeHttpChunk({ requestId: 'b' })])
    await repo.closeStreams('rec_1')

    const loaded = await repo.loadHttpChunks('rec_1')
    expect(loaded).toHaveLength(2)
    expect(loaded.map(c => c.requestId)).toEqual(['a', 'b'])
  })
})
