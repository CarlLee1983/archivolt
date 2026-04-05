import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { PostgresCsvLogParser } from '@/Modules/Recording/Infrastructure/Parsers/PostgresCsvLogParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/postgres.csv')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('PostgresCsvLogParser', () => {
  it('parses LOG rows and skips non-LOG severity', async () => {
    const parser = new PostgresCsvLogParser()
    const events = await collect(parser.parse(FIXTURE))
    // 3 LOG rows (including quoted-newline), 1 WARNING row → 3 events
    expect(events).toHaveLength(3)
  })

  it('extracts timestamp, durationMs, and sql from first entry', async () => {
    const parser = new PostgresCsvLogParser()
    const [first] = await collect(parser.parse(FIXTURE)) as Array<{ timestamp: number; durationMs: number; sql: string }>
    expect(first.durationMs).toBeCloseTo(1234.567, 2)
    expect(first.sql).toBe('SELECT * FROM users WHERE id = 1;')
    expect(first.timestamp).toBeGreaterThan(0)
  })

  it('parses execute <unnamed> format', async () => {
    const parser = new PostgresCsvLogParser()
    const events = await collect(parser.parse(FIXTURE)) as Array<{ durationMs: number; sql: string }>
    expect(events[1].durationMs).toBeCloseTo(523.1, 1)
    expect(events[1].sql).toContain("status = 'pending'")
  })

  it('handles quoted newlines in message field (multi-line SQL)', async () => {
    const parser = new PostgresCsvLogParser()
    const events = await collect(parser.parse(FIXTURE)) as Array<{ sql: string }>
    const multiLine = events[2].sql
    expect(multiLine).toContain('SELECT u.id, u.name')
    expect(multiLine).toContain('WHERE u.active = true')
  })

  it('returns empty generator for file with no matching LOG+duration rows', async () => {
    const parser = new PostgresCsvLogParser()
    // Use a file with no CSV duration lines — the canonical JSONL has no CSV rows
    const emptyPath = path.resolve(__dirname, '../../../fixtures/logs/canonical.jsonl')
    const events = await collect(parser.parse(emptyPath))
    expect(events).toHaveLength(0)
  })
})
