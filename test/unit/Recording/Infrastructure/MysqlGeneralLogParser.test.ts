import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { MysqlGeneralLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlGeneralLogParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/mysql-general.log')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('MysqlGeneralLogParser', () => {
  it('parses only Query lines, skipping header and non-Query events', async () => {
    const parser = new MysqlGeneralLogParser()
    const events = await collect(parser.parse(FIXTURE))
    // 3 ISO Query lines + 1 compact-format Query = 4 total
    expect(events).toHaveLength(4)
  })

  it('extracts connectionId from ISO-timestamp line', async () => {
    const parser = new MysqlGeneralLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      connectionId: '42',
      sql: 'SELECT * FROM users WHERE id = 1',
    })
  })

  it('parses ISO timestamp to Unix ms', async () => {
    const parser = new MysqlGeneralLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    const event = first as { timestamp: number }
    expect(event.timestamp).toBe(new Date('2024-04-05T10:00:00.000000Z').getTime())
  })

  it('parses compact-format timestamp line', async () => {
    const parser = new MysqlGeneralLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const last = events[events.length - 1] as { sql: string; connectionId: string }
    expect(last.sql).toBe('SELECT 1')
    expect(last.connectionId).toBe('44')
  })
})
