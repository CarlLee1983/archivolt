import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

export class DependenciesCheck implements IHealthCheck {
  readonly name = '依賴安裝'
  readonly category = 'environment' as const

  constructor(private readonly projectRoot: string) {}

  async check(): Promise<CheckResult> {
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules')
    if (!existsSync(nodeModulesPath)) {
      return createCheckResult(this, 'error', 'node_modules 不存在')
    }
    return createCheckResult(this, 'ok', 'node_modules OK')
  }

  async fix(): Promise<CheckResult> {
    try {
      execSync('bun install', { cwd: this.projectRoot, stdio: 'pipe' })
      return createCheckResult(this, 'ok', 'bun install 完成')
    } catch (error) {
      return createCheckResult(this, 'error', `bun install 失敗: ${error}`)
    }
  }
}
