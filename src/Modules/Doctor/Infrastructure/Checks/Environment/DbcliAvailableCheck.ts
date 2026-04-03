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
        return createCheckResult(this, 'error', '未安裝 dbcli')
      }

      return createCheckResult(this, 'ok', version)
    } catch {
      return createCheckResult(this, 'error', '未安裝 dbcli')
    }
  }

  async fix(): Promise<CheckResult> {
    try {
      execSync('bun install -g @carllee1983/dbcli', { stdio: 'pipe' })
      const version = execSync('dbcli --version', { encoding: 'utf8' }).trim()
      return createCheckResult(this, 'ok', `已安裝 dbcli ${version}`)
    } catch {
      return createCheckResult(this, 'error', '自動安裝失敗，請手動執行: bun install -g @carllee1983/dbcli')
    }
  }
}
