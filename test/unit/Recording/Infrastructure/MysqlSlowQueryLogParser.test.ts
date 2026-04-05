import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { MysqlSlowQueryLogParser } from '@/Modules/Recording/Infrastructure/Parsers/MysqlSlowQueryLogParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/logs/mysql-slow.log')

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const result = []
  for await (const item of gen) result.push(item)
  return result
}

describe('MysqlSlowQueryLogParser', () => {
  it('parses all 3 entries from fixture', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    expect(events).toHaveLength(3)
  })

  it('extracts timestamp, connectionId, durationMs, rowsExamined, sql, database', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const [first] = await collect(parser.parse(FIXTURE))
    expect(first).toMatchObject({
      timestamp: new Date('2024-04-05T10:00:00.000000Z').getTime(),
      connectionId: '42',
      durationMs: expect.closeTo(1.234, 1),
      rowsExamined: 1000,
      sql: 'SELECT * FROM users WHERE id = 1;',
      database: 'testdb',
    })
  })

  it('parses second entry without use db line', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const second = events[1] as { sql: string; durationMs: number }
    expect(second.sql).toBe("SELECT * FROM orders WHERE status = 'pending';")
    expect(second.durationMs).toBeCloseTo(523, 0)
  })

  it('parses INSERT entry correctly', async () => {
    const parser = new MysqlSlowQueryLogParser()
    const events = await collect(parser.parse(FIXTURE))
    const third = events[2] as { sql: string }
    expect(third.sql).toBe("INSERT INTO logs (msg) VALUES ('done');")
  })
})
