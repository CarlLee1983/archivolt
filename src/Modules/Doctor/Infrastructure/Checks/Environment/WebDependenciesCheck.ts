import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

export class WebDependenciesCheck implements IHealthCheck {
  readonly name = 'Web 依賴安裝'
  readonly category = 'environment' as const

  constructor(private readonly projectRoot: string) {}

  async check(): Promise<CheckResult> {
    const webNodeModules = path.join(this.projectRoot, 'web', 'node_modules')
    if (!existsSync(webNodeModules)) {
      return createCheckResult(this, 'error', 'web/node_modules 不存在')
    }
    return createCheckResult(this, 'ok', 'web/node_modules OK')
  }

  async fix(): Promise<CheckResult> {
    try {
      const webDir = path.join(this.projectRoot, 'web')
      execSync('bun install', { cwd: webDir, stdio: 'pipe' })
      return createCheckResult(this, 'ok', 'bun install (web) 完成')
    } catch (error) {
      return createCheckResult(this, 'error', `bun install (web) 失敗: ${error}`)
    }
  }
}
