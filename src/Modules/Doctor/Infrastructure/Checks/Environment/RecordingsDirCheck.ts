import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, mkdirSync } from 'node:fs'

export class RecordingsDirCheck implements IHealthCheck {
  readonly name = 'recordings 目錄'
  readonly category = 'environment' as const

  constructor(private readonly recordingsDir: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.recordingsDir)) {
      return createCheckResult(this, 'error', `${this.recordingsDir} 不存在`)
    }
    return createCheckResult(this, 'ok', `${this.recordingsDir} OK`)
  }

  async fix(): Promise<CheckResult> {
    try {
      mkdirSync(this.recordingsDir, { recursive: true })
      return createCheckResult(this, 'ok', `已建立 ${this.recordingsDir}`)
    } catch (error) {
      return createCheckResult(this, 'error', `建立目錄失敗: ${error}`)
    }
  }
}
