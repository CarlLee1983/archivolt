import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export class VirtualFkIntegrityCheck implements IHealthCheck {
  readonly name = 'Virtual FK 參照完整性'
  readonly category = 'data' as const

  constructor(private readonly filePath: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.filePath)) {
      return createCheckResult(this, 'warn', 'archivolt.json 不存在，跳過')
    }

    const data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    const orphans = this.findOrphans(data)

    if (orphans.length > 0) {
      return createCheckResult(
        this,
        'warn',
        `${orphans.length} 個 orphan vFK（${orphans.map((o) => `${o.table}.${o.vfkId} → ${o.refTable}`).join(', ')}）`,
      )
    }

    return createCheckResult(this, 'ok', 'OK')
  }

  async fix(): Promise<CheckResult> {
    try {
      if (!existsSync(this.filePath)) {
        return createCheckResult(this, 'error', 'archivolt.json 不存在，無法修復')
      }
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      const orphans = this.findOrphans(data)
      const orphanIds = new Set(orphans.map((o) => o.vfkId))

      const cleanedTables = Object.fromEntries(
        Object.entries(data.tables as Record<string, any>).map(([name, table]) => [
          name,
          {
            ...table,
            virtualForeignKeys: (table.virtualForeignKeys ?? []).filter(
              (vfk: any) => !orphanIds.has(vfk.id),
            ),
          },
        ]),
      )

      writeFileSync(this.filePath, JSON.stringify({ ...data, tables: cleanedTables }, null, 2), 'utf-8')
      return createCheckResult(this, 'ok', `已移除 ${orphans.length} 個 orphan vFK`)
    } catch (error) {
      return createCheckResult(this, 'error', `修復失敗: ${error}`)
    }
  }

  private findOrphans(data: any): Array<{ table: string; vfkId: string; refTable: string }> {
    const tableNames = new Set(Object.keys(data.tables ?? {}))
    const orphans: Array<{ table: string; vfkId: string; refTable: string }> = []

    for (const [tableName, table] of Object.entries(data.tables ?? {}) as any[]) {
      const columnNames = new Set((table.columns ?? []).map((c: any) => c.name))

      for (const vfk of table.virtualForeignKeys ?? []) {
        const refTableExists = tableNames.has(vfk.refTable)
        const refTable = data.tables[vfk.refTable]
        const refColumnNames = refTable
          ? new Set((refTable.columns ?? []).map((c: any) => c.name))
          : new Set()

        const sourceColsMissing = vfk.columns.some((c: string) => !columnNames.has(c))
        const refColsMissing = vfk.refColumns.some((c: string) => !refColumnNames.has(c))

        if (!refTableExists || sourceColsMissing || refColsMissing) {
          orphans.push({ table: tableName, vfkId: vfk.id, refTable: vfk.refTable })
        }
      }
    }

    return orphans
  }
}
