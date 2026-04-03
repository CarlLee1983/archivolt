import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export class TableGroupIntegrityCheck implements IHealthCheck {
  readonly name = 'Table Group 完整性'
  readonly category = 'data' as const

  constructor(private readonly filePath: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.filePath)) {
      return createCheckResult(this, 'warn', 'archivolt.json 不存在，跳過')
    }

    const data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    const orphans = this.findOrphanRefs(data)

    if (orphans.length > 0) {
      return createCheckResult(
        this,
        'warn',
        `${orphans.length} 個 orphan 引用（${orphans.map((o) => `${o.group} → ${o.table}`).join(', ')}）`,
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
      const tableNames = new Set(Object.keys(data.tables ?? {}))

      const cleanedGroups = Object.fromEntries(
        Object.entries(data.groups as Record<string, any>).map(([name, group]) => {
          const filtered = (group.tables ?? []).filter((t: string) => tableNames.has(t))
          return [name, { ...group, tables: filtered }]
        }),
      )

      const removedCount = Object.values(data.groups as Record<string, any>).reduce(
        (sum: number, g: any) => sum + (g.tables ?? []).length, 0,
      ) - Object.values(cleanedGroups).reduce(
        (sum: number, g: any) => sum + g.tables.length, 0,
      )

      writeFileSync(this.filePath, JSON.stringify({ ...data, groups: cleanedGroups }, null, 2), 'utf-8')
      return createCheckResult(this, 'ok', `已移除 ${removedCount} 個 orphan 引用`)
    } catch (error) {
      return createCheckResult(this, 'error', `修復失敗: ${error}`)
    }
  }

  private findOrphanRefs(data: any): Array<{ group: string; table: string }> {
    const tableNames = new Set(Object.keys(data.tables ?? {}))
    const orphans: Array<{ group: string; table: string }> = []

    for (const [groupName, group] of Object.entries(data.groups ?? {}) as any[]) {
      for (const tableName of group.tables ?? []) {
        if (!tableNames.has(tableName)) {
          orphans.push({ group: groupName, table: tableName })
        }
      }
    }

    return orphans
  }
}
