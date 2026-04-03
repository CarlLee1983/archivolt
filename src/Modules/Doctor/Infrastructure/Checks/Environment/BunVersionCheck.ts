import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { execSync } from 'node:child_process'

const MIN_BUN_VERSION = '1.0.0'

export class BunVersionCheck implements IHealthCheck {
  readonly name = 'Bun 版本'
  readonly category = 'environment' as const

  async check(): Promise<CheckResult> {
    try {
      const version = execSync('bun --version', { encoding: 'utf8' }).trim()

      if (!version) {
        return createCheckResult(this, 'error', 'Bun 未安裝或無法取得版本')
      }

      if (this.compareVersions(version, MIN_BUN_VERSION) < 0) {
        return createCheckResult(this, 'error', `版本 ${version} 低於最低需求 ${MIN_BUN_VERSION}，請執行 bun upgrade`)
      }

      return createCheckResult(this, 'ok', version)
    } catch {
      return createCheckResult(this, 'error', '無法執行 bun --version，請確認 Bun 已安裝')
    }
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number)
    const partsB = b.split('.').map(Number)
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  }
}
