import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import { MysqlProtocolParser } from './MysqlProtocolParser'
import { PostgresProtocolParser } from './PostgresProtocolParser'

export type ProtocolType = 'mysql' | 'postgres'

const PORT_MAP: Record<number, ProtocolType> = { 3306: 'mysql', 5432: 'postgres' }
const DRIVER_MAP: Record<string, ProtocolType> = {
  mysql: 'mysql',
  mariadb: 'mysql',
  pgsql: 'postgres',
  postgres: 'postgres',
  postgresql: 'postgres',
}

export function detectProtocol(params: {
  targetPort: number
  explicit?: ProtocolType
  envDriver?: string
}): ProtocolType {
  if (params.explicit) return params.explicit
  if (params.envDriver) {
    const mapped = DRIVER_MAP[params.envDriver.toLowerCase()]
    if (mapped) return mapped
  }
  return PORT_MAP[params.targetPort] ?? 'mysql'
}

export function resolveParser(protocol: ProtocolType): IProtocolParser {
  return protocol === 'postgres' ? new PostgresProtocolParser() : new MysqlProtocolParser()
}
