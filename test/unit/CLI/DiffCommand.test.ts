import { describe, it, expect } from 'vitest'
import { parseDiffArgs } from '@/CLI/DiffCommand'

describe('parseDiffArgs', () => {
  it('parses two session ids with defaults (format=md)', () => {
    const args = parseDiffArgs(['diff', 'session-a', 'session-b'])
    expect(args.sessionA).toBe('session-a')
    expect(args.sessionB).toBe('session-b')
    expect(args.format).toBe('md')
    expect(args.stdout).toBe(false)
    expect(args.output).toBeUndefined()
  })

  it('parses --format json', () => {
    const args = parseDiffArgs(['diff', 'session-a', 'session-b', '--format', 'json'])
    expect(args.format).toBe('json')
  })

  it('parses --stdout flag', () => {
    const args = parseDiffArgs(['diff', 'session-a', 'session-b', '--stdout'])
    expect(args.stdout).toBe(true)
  })

  it('throws if less than 2 session ids provided', () => {
    expect(() => parseDiffArgs(['diff', 'session-a'])).toThrow()
    expect(() => parseDiffArgs(['diff'])).toThrow()
  })
})
