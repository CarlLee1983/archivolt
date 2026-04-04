import { describe, it, expect } from 'vitest'
import { parseAnalyzeArgs } from '@/CLI/AnalyzeCommand'

describe('parseAnalyzeArgs', () => {
  it('parses session-id from first argument', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.sessionId).toBe('rec_123')
  })

  it('throws when session-id is missing', () => {
    expect(() => parseAnalyzeArgs(['analyze'])).toThrow('session-id')
  })

  it('defaults format to md', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.format).toBe('md')
  })

  it('parses --format json', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'json'])
    expect(args.format).toBe('json')
  })

  it('parses --stdout flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--stdout'])
    expect(args.stdout).toBe(true)
  })

  it('parses --output path', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--output', '/tmp/out.md'])
    expect(args.output).toBe('/tmp/out.md')
  })

  it('defaults stdout to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.stdout).toBe(false)
  })
})

describe('parseAnalyzeArgs — optimize-md flags', () => {
  it('parses --format optimize-md', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'optimize-md'])
    expect(args.format).toBe('optimize-md')
  })

  it('defaults ddlPath to undefined', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.ddlPath).toBeUndefined()
  })

  it('parses --ddl path', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--ddl', './schema.sql'])
    expect(args.ddlPath).toBe('./schema.sql')
  })

  it('defaults explainDbUrl to undefined', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.explainDbUrl).toBeUndefined()
  })

  it('parses --explain-db url', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--explain-db', 'mysql://localhost/db'])
    expect(args.explainDbUrl).toBe('mysql://localhost/db')
  })

  it('defaults minRows to 1000', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.minRows).toBe(1000)
  })

  it('parses --min-rows', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--min-rows', '500'])
    expect(args.minRows).toBe(500)
  })

  it('defaults llm to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.llm).toBe(false)
  })

  it('parses --llm flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--llm'])
    expect(args.llm).toBe(true)
  })
})
