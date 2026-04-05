import { describe, it, expect } from 'vitest'
import { parseAnalyzeArgs } from '@/CLI/AnalyzeCommand'

describe('parseAnalyzeArgs --from flag', () => {
  it('parses --from general-log with a file path', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'general-log', '/tmp/mysql.log'])
    expect(args.fromFormat).toBe('general-log')
    expect(args.fromPath).toBe('/tmp/mysql.log')
    expect(args.sessionId).toBeUndefined()
  })

  it('parses --from slow-log', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'slow-log', '/tmp/slow.log'])
    expect(args.fromFormat).toBe('slow-log')
    expect(args.fromPath).toBe('/tmp/slow.log')
  })

  it('parses --from canonical', () => {
    const args = parseAnalyzeArgs(['analyze', '--from', 'canonical', '/tmp/queries.jsonl'])
    expect(args.fromFormat).toBe('canonical')
    expect(args.fromPath).toBe('/tmp/queries.jsonl')
  })

  it('combines --from with --format optimize-md', () => {
    const args = parseAnalyzeArgs([
      'analyze', '--from', 'slow-log', '/tmp/slow.log',
      '--format', 'optimize-md',
    ])
    expect(args.fromFormat).toBe('slow-log')
    expect(args.format).toBe('optimize-md')
  })

  it('still parses existing session-id usage without --from', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--format', 'md'])
    expect(args.sessionId).toBe('rec_123')
    expect(args.fromFormat).toBeUndefined()
  })

  it('throws when neither session-id nor --from is provided', () => {
    expect(() => parseAnalyzeArgs(['analyze', '--format', 'md'])).toThrow()
  })
})
