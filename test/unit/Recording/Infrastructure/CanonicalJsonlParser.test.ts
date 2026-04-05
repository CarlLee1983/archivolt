import { describe, it, expect } from 'vitest'
import path from 'node:path'
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
})
