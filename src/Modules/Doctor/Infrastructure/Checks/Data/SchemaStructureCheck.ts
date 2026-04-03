import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, readFileSync } from 'node:fs'

export class SchemaStructureCheck implements IHealthCheck {
  readonly name = 'Schema 結構驗證'
  readonly category = 'data' as const

  constructor(private readonly filePath: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.filePath)) {
      return createCheckResult(this, 'warn', 'archivolt.json 不存在，跳過結構驗證')
    }

    try {
      const text = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(text)

      const missing: string[] = []
      if (!data.source) missing.push('source')
      if (!data.tables || typeof data.tables !== 'object') missing.push('tables')
      if (!data.groups || typeof data.groups !== 'object') missing.push('groups')

      if (missing.length > 0) {
        return createCheckResult(this, 'error', `缺少必要欄位: ${missing.join(', ')}`)
      }

      const tableCount = Object.keys(data.tables).length
      const columnCount = Object.values(data.tables).reduce(
        (sum: number, t: any) => sum + (t.columns?.length ?? 0),
        0,
      )

      return createCheckResult(this, 'ok', `${tableCount} tables, ${columnCount} columns`)
    } catch {
      return createCheckResult(this, 'error', '無法解析 archivolt.json')
    }
  }
}
