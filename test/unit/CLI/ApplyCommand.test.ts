import { describe, it, expect } from 'vitest'
import { parseApplyArgs } from '@/CLI/ApplyCommand'

describe('parseApplyArgs', () => {
  it('parses session-id from first positional arg with defaults', () => {
    const args = parseApplyArgs(['apply', 'abc-123'])
    expect(args.sessionId).toBe('abc-123')
    expect(args.minConfidence).toBe('high')
    expect(args.dryRun).toBe(false)
    expect(args.auto).toBe(false)
  })

  it('parses --min-confidence flag', () => {
    const args = parseApplyArgs(['apply', 'abc-123', '--min-confidence', 'medium'])
    expect(args.minConfidence).toBe('medium')
  })

  it('parses --min-confidence low', () => {
    const args = parseApplyArgs(['apply', 'abc-123', '--min-confidence', 'low'])
    expect(args.minConfidence).toBe('low')
  })

  it('parses --dry-run flag', () => {
    const args = parseApplyArgs(['apply', 'abc-123', '--dry-run'])
    expect(args.dryRun).toBe(true)
  })

  it('parses --auto flag', () => {
    const args = parseApplyArgs(['apply', 'abc-123', '--auto'])
    expect(args.auto).toBe(true)
  })

  it('throws if session-id is missing', () => {
    expect(() => parseApplyArgs(['apply'])).toThrow()
  })

  it('throws if session-id starts with --', () => {
    expect(() => parseApplyArgs(['apply', '--dry-run'])).toThrow()
  })
})
