import { describe, it, expect } from 'vitest'
import { detectProtocol, resolveParser } from '@/Modules/Recording/Infrastructure/Proxy/ProtocolDetector'

describe('detectProtocol', () => {
  it('detects mysql from port 3306', () =>
    expect(detectProtocol({ targetPort: 3306 })).toBe('mysql'))

  it('detects postgres from port 5432', () =>
    expect(detectProtocol({ targetPort: 5432 })).toBe('postgres'))

  it('defaults to mysql for unknown ports', () =>
    expect(detectProtocol({ targetPort: 9999 })).toBe('mysql'))

  it('respects explicit override', () =>
    expect(detectProtocol({ targetPort: 3306, explicit: 'postgres' })).toBe('postgres'))

  it('detects postgres from env driver pgsql', () =>
    expect(detectProtocol({ targetPort: 9999, envDriver: 'pgsql' })).toBe('postgres'))

  it('detects postgres from env driver postgresql', () =>
    expect(detectProtocol({ targetPort: 9999, envDriver: 'postgresql' })).toBe('postgres'))

  it('detects mysql from env driver mysql', () =>
    expect(detectProtocol({ targetPort: 9999, envDriver: 'mysql' })).toBe('mysql'))

  it('detects mysql from env driver mariadb', () =>
    expect(detectProtocol({ targetPort: 9999, envDriver: 'mariadb' })).toBe('mysql'))

  it('explicit overrides env driver', () =>
    expect(detectProtocol({ targetPort: 9999, envDriver: 'pgsql', explicit: 'mysql' })).toBe('mysql'))
})

describe('resolveParser', () => {
  it('returns MysqlProtocolParser for mysql', () =>
    expect(resolveParser('mysql').constructor.name).toBe('MysqlProtocolParser'))

  it('returns PostgresProtocolParser for postgres', () =>
    expect(resolveParser('postgres').constructor.name).toBe('PostgresProtocolParser'))
})
