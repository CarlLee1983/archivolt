import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import { CanonicalJsonlParser } from '@/Modules/Recording/Infrastructure/Parsers/CanonicalJsonlParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/canonical.jsonl')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('CanonicalJsonlParser', () => {
  it('parses all query events from fixture', async () => {
    const parser = new CanonicalJsonlParser()
    const events = await collect(parser.parse(FIXTURE))
    expect(events).toHaveLength(3)
  })

  it('preserves timestamp and sql', async () => {
    const parser = new CanonicalJsonlParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      timestamp: 1712300000000,
      sql: 'SELECT * FROM users WHERE id = 1',
      connectionId: '42',
    })
  })

  it('preserves optional fields when present', async () => {
    const parser = new CanonicalJsonlParser()
    const events = await collect(parser.parse(FIXTURE))
    const second = events[1]
    expect(second).toMatchObject({ durationMs: 5, rowsExamined: 100 })
  })

  it('skips blank lines without error', async () => {
    const parser = new CanonicalJsonlParser()
    const events = await collect(parser.parse(FIXTURE))
    expect(events.length).toBeGreaterThan(0)
  })

  it('skips malformed JSON lines without crashing', async () => {
    const tmpPath = `${os.tmpdir()}/archivolt-test-${Date.now()}.jsonl`
    await writeFile(tmpPath, [
      '{"timestamp":1000,"sql":"SELECT 1"}',
      'not valid json {{{',
      '{"timestamp":2000,"sql":"SELECT 2"}',
    ].join('\n'))

    try {
      const parser = new CanonicalJsonlParser()
      const events = await collect(parser.parse(tmpPath))
      expect(events).toHaveLength(2)
      expect((events[0] as { sql: string }).sql).toBe('SELECT 1')
      expect((events[1] as { sql: string }).sql).toBe('SELECT 2')
    } finally {
      await unlink(tmpPath)
    }
  })

  it('skips lines with missing required fields', async () => {
    const tmpPath = `${os.tmpdir()}/archivolt-test-fields-${Date.now()}.jsonl`
    await writeFile(tmpPath, [
      '{"timestamp":1000,"sql":"SELECT 1"}',
      '{"sql":"SELECT 2"}',
      '{"timestamp":2000}',
      '{}',
      '{"timestamp":3000,"sql":"SELECT 3"}',
    ].join('\n'))

    try {
      const parser = new CanonicalJsonlParser()
      const events = await collect(parser.parse(tmpPath))
      expect(events).toHaveLength(2)
      expect((events[0] as { sql: string }).sql).toBe('SELECT 1')
      expect((events[1] as { sql: string }).sql).toBe('SELECT 3')
    } finally {
      await unlink(tmpPath)
    }
  })
})
