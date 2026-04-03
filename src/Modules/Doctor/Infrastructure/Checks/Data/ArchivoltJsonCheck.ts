import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, readFileSync } from 'node:fs'

export class ArchivoltJsonCheck implements IHealthCheck {
  readonly name = 'archivolt.json 存在'
  readonly category = 'data' as const

  constructor(private readonly filePath: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.filePath)) {
      return createCheckResult(this, 'error', '檔案不存在，請先使用 --input 匯入 schema')
    }

    try {
      const text = readFileSync(this.filePath, 'utf-8')
      JSON.parse(text)
      return createCheckResult(this, 'ok', 'OK')
    } catch {
      return createCheckResult(this, 'error', '檔案內容不是合法的 JSON')
    }
  }
}
