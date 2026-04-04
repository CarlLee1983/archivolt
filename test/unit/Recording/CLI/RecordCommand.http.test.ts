import { describe, it, expect } from 'vitest'
import { parseRecordArgs } from '@/CLI/RecordCommand'

describe('parseRecordArgs HTTP proxy flags', () => {
  it('parses --http-proxy flag', () => {
    const args = parseRecordArgs([
      'record', 'start',
      '--target', 'localhost:3306',
      '--http-proxy', 'http://localhost:3000',
    ])
    expect(args.httpProxyTarget).toBe('http://localhost:3000')
    expect(args.httpProxyPort).toBe(4000)  // default
  })

  it('parses --http-port flag', () => {
    const args = parseRecordArgs([
      'record', 'start',
      '--target', 'localhost:3306',
      '--http-proxy', 'http://localhost:8080',
      '--http-port', '5000',
    ])
    expect(args.httpProxyTarget).toBe('http://localhost:8080')
    expect(args.httpProxyPort).toBe(5000)
  })

  it('httpProxyTarget is undefined when --http-proxy not provided', () => {
    const args = parseRecordArgs(['record', 'start', '--target', 'localhost:3306'])
    expect(args.httpProxyTarget).toBeUndefined()
    expect(args.httpProxyPort).toBe(4000)  // default still set
  })
})
