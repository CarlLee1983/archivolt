// test/unit/Recording/CLI/RecordCommand.test.ts

import { describe, it, expect } from 'vitest'
import { parseRecordArgs } from '@/CLI/RecordCommand'

describe('parseRecordArgs', () => {
  it('parses start with --target', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.subcommand).toBe('start')
    expect(args.targetHost).toBe('localhost')
    expect(args.targetPort).toBe(3306)
  })

  it('parses start with --port', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306', '--port', '13306'])
    expect(args.listenPort).toBe(13306)
  })

  it('defaults listenPort to 13306', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.listenPort).toBe(13306)
  })

  it('parses start with --from-env', () => {
    const args = parseRecordArgs(['record', 'start', '--from-env', '/path/to/.env'])
    expect(args.subcommand).toBe('start')
    expect(args.fromEnv).toBe('/path/to/.env')
  })

  it('parses stop subcommand', () => {
    const args = parseRecordArgs(['record', 'stop'])
    expect(args.subcommand).toBe('stop')
  })

  it('parses status subcommand', () => {
    const args = parseRecordArgs(['record', 'status'])
    expect(args.subcommand).toBe('status')
  })

  it('parses list subcommand', () => {
    const args = parseRecordArgs(['record', 'list'])
    expect(args.subcommand).toBe('list')
  })

  it('parses summary with session id', () => {
    const args = parseRecordArgs(['record', 'summary', 'rec_123'])
    expect(args.subcommand).toBe('summary')
    expect(args.sessionId).toBe('rec_123')
  })

  it('throws if subcommand is missing', () => {
    expect(() => parseRecordArgs(['record'])).toThrow()
  })

  it('throws if --target format is invalid', () => {
    expect(() => parseRecordArgs(['record', 'start', '--target', 'no-port'])).toThrow()
  })

  it('throws if start has no --target and no --from-env', () => {
    expect(() => parseRecordArgs(['record', 'start'])).toThrow()
  })
})

describe('registerShutdownHandlers', () => {
  it('registers both SIGINT and SIGTERM', () => {
    const { registerShutdownHandlers } = require('@/CLI/RecordCommand')
    const registered: string[] = []
    const fakeProcess = { on: (sig: string, _fn: unknown) => registered.push(sig) }
    const fakeService = { stop: async () => ({ stats: { totalQueries: 0 }, id: 'x' }) }

    registerShutdownHandlers(fakeService as any, undefined, fakeProcess as any)

    expect(registered).toContain('SIGINT')
    expect(registered).toContain('SIGTERM')
  })
})
