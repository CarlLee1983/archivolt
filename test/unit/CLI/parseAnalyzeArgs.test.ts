import { describe, it, expect } from 'vitest'
import { parseAnalyzeArgs } from '@/CLI/AnalyzeCommand'

describe('parseAnalyzeArgs — --from flag', () => {
  it('accepts postgres-slow-log format', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'postgres-slow-log', '/tmp/pg.log'])
    expect(args.fromFormat).toBe('postgres-slow-log')
    expect(args.fromPath).toBe('/tmp/pg.log')
  })

  it('accepts postgres-csv-log format', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'postgres-csv-log', '/tmp/pg.csv'])
    expect(args.fromFormat).toBe('postgres-csv-log')
    expect(args.fromPath).toBe('/tmp/pg.csv')
  })

  it('accepts existing formats (regression)', () => {
    const a = parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'slow-log', '/tmp/mysql.log'])
    expect(a.fromFormat).toBe('slow-log')
    const b = parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'general-log', '/tmp/mysql-general.log'])
    expect(b.fromFormat).toBe('general-log')
    const c = parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'canonical', '/tmp/canonical.jsonl'])
    expect(c.fromFormat).toBe('canonical')
  })

  it('throws for unknown format', () => {
    expect(() =>
      parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'oracle-log', '/tmp/x.log'])
    ).toThrow('Unknown format "oracle-log"')
  })

  it('throws when file path is missing', () => {
    expect(() =>
      parseAnalyzeArgs(['archivolt', 'analyze', '--from', 'postgres-slow-log'])
    ).toThrow('Usage:')
  })
})

describe('parseAnalyzeArgs — --explain-db flag', () => {
  it('parses postgresql:// URL', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', 'sess_1', '--explain-db', 'postgresql://user:pw@localhost:5432/mydb'])
    expect(args.explainDbUrl).toBe('postgresql://user:pw@localhost:5432/mydb')
  })

  it('parses postgres:// short form', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', 'sess_1', '--explain-db', 'postgres://user:pw@localhost:5432/mydb'])
    expect(args.explainDbUrl).toBe('postgres://user:pw@localhost:5432/mydb')
  })

  it('parses mysql:// URL', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', 'sess_1', '--explain-db', 'mysql://user:pw@localhost:3306/mydb'])
    expect(args.explainDbUrl).toBe('mysql://user:pw@localhost:3306/mydb')
  })

  it('defaults explainConcurrency to 5', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', 'sess_1'])
    expect(args.explainConcurrency).toBe(5)
  })

  it('parses --explain-concurrency override', () => {
    const args = parseAnalyzeArgs(['archivolt', 'analyze', 'sess_1', '--explain-concurrency', '10'])
    expect(args.explainConcurrency).toBe(10)
  })
})
