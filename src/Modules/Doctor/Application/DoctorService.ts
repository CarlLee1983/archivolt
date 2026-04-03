import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import type { IPrompter } from '@/Modules/Doctor/Infrastructure/InteractivePrompter'

export class DoctorService {
  constructor(
    private readonly checks: readonly IHealthCheck[],
    private readonly prompter: IPrompter,
  ) {}

  async runAll(): Promise<CheckResult[]> {
    const envChecks = this.checks.filter((c) => c.category === 'environment')
    const dataChecks = this.checks.filter((c) => c.category === 'data')

    const envResults: CheckResult[] = []
    for (const check of envChecks) {
      envResults.push(await check.check())
    }

    const hasEnvError = envResults.some((r) => r.severity === 'error')
    if (hasEnvError) {
      return envResults
    }

    const dataResults: CheckResult[] = []
    for (const check of dataChecks) {
      dataResults.push(await check.check())
    }

    return [...envResults, ...dataResults]
  }

  async interactiveFix(
    results: readonly CheckResult[],
    checks: readonly IHealthCheck[],
  ): Promise<void> {
    const fixable = results.filter((r) => r.severity !== 'ok' && r.fixable)
    if (fixable.length === 0) return

    console.log('\n發現可修復的問題：')

    for (let i = 0; i < fixable.length; i++) {
      const result = fixable[i]
      const check = checks.find((c) => c.name === result.name)
      if (!check?.fix) continue

      const confirmed = await this.prompter.confirm(
        `  [${i + 1}/${fixable.length}] ${result.name} — ${result.message}？`,
      )

      if (confirmed) {
        const fixResult = await check.fix()
        const icon = fixResult.severity === 'ok' ? '✓' : '✗'
        console.log(`  ${icon} ${fixResult.message}`)
      }
    }
  }
}
