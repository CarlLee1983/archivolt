import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { execSync } from 'node:child_process'

export class DbcliAvailableCheck implements IHealthCheck {
  readonly name = 'dbcli 可用'
  readonly category = 'environment' as const

  async check(): Promise<CheckResult> {
    try {
      const version = execSync('dbcli --version', { encoding: 'utf8' }).trim()

      if (!version) {
        return createCheckResult(this, 'error', '未安裝 dbcli，請參考 https://github.com/nicordev/dbcli 安裝')
      }

      return createCheckResult(this, 'ok', version)
    } catch {
      return createCheckResult(this, 'error', '未安裝 dbcli，請參考 https://github.com/nicordev/dbcli 安裝')
    }
  }
}
