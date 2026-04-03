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
