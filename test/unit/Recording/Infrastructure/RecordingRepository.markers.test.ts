import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { createMarker } from '@/Modules/Recording/Domain/OperationMarker'

const TEST_DIR = path.resolve(__dirname, '../../../../tmp-test-markers')

describe('RecordingRepository markers', () => {
  let repo: RecordingRepository

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new RecordingRepository(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it('appendMarkers creates markers.jsonl and loadMarkers reads it', async () => {
    const sessionId = 'test_session_1'
    const sessionDir = path.join(TEST_DIR, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const markers = [
      createMarker({ sessionId, url: '/login', action: 'navigate' }),
      createMarker({ sessionId, url: '/login', action: 'submit', target: 'form#login' }),
    ]

    repo.openStreams(sessionId)
    repo.appendMarkers(sessionId, markers)
    await repo.closeStreams(sessionId)
    const loaded = await repo.loadMarkers(sessionId)

    expect(loaded).toHaveLength(2)
    expect(loaded[0].url).toBe('/login')
    expect(loaded[0].action).toBe('navigate')
    expect(loaded[1].action).toBe('submit')
    expect(loaded[1].target).toBe('form#login')
  })

  it('appendMarkers appends to existing file', async () => {
    const sessionId = 'test_session_2'
    const sessionDir = path.join(TEST_DIR, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const batch1 = [createMarker({ sessionId, url: '/a', action: 'navigate' })]
    const batch2 = [createMarker({ sessionId, url: '/b', action: 'click' })]

    repo.openStreams(sessionId)
    repo.appendMarkers(sessionId, batch1)
    repo.appendMarkers(sessionId, batch2)
    await repo.closeStreams(sessionId)

    const loaded = await repo.loadMarkers(sessionId)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].url).toBe('/a')
    expect(loaded[1].url).toBe('/b')
  })

  it('loadMarkers returns empty array for missing file', async () => {
    const loaded = await repo.loadMarkers('nonexistent')
    expect(loaded).toEqual([])
  })
})
