import { DoctorReporter } from '@/Modules/Doctor/Infrastructure/DoctorReporter'
import type { CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'

describe('DoctorReporter', () => {
  let output: string[]
  let reporter: DoctorReporter

  beforeEach(() => {
    output = []
    reporter = new DoctorReporter((msg: string) => output.push(msg))
  })

  it('formats ok result with check mark', () => {
    const results: CheckResult[] = [
      { name: 'Bun 版本', category: 'environment', severity: 'ok', message: '1.2.4', fixable: false },
    ]

    reporter.report(results)

    const joined = output.join('\n')
    expect(joined).toContain('✓')
    expect(joined).toContain('Bun 版本')
    expect(joined).toContain('1.2.4')
  })

  it('formats error result with cross mark', () => {
    const results: CheckResult[] = [
      { name: '依賴安裝', category: 'environment', severity: 'error', message: 'node_modules 不存在', fixable: true },
    ]

    reporter.report(results)

    const joined = output.join('\n')
    expect(joined).toContain('✗')
    expect(joined).toContain('依賴安裝')
  })

  it('formats warn result with exclamation mark', () => {
    const results: CheckResult[] = [
      { name: 'Virtual FK', category: 'data', severity: 'warn', message: '2 個 orphan', fixable: true },
    ]

    reporter.report(results)

    const joined = output.join('\n')
    expect(joined).toContain('!')
    expect(joined).toContain('Virtual FK')
  })

  it('groups results by category', () => {
    const results: CheckResult[] = [
      { name: 'Bun', category: 'environment', severity: 'ok', message: 'OK', fixable: false },
      { name: 'Schema', category: 'data', severity: 'ok', message: 'OK', fixable: false },
    ]

    reporter.report(results)

    const joined = output.join('\n')
    const envIdx = joined.indexOf('環境')
    const dataIdx = joined.indexOf('資料完整性')
    expect(envIdx).toBeLessThan(dataIdx)
  })

  it('shows summary line with counts', () => {
    const results: CheckResult[] = [
      { name: 'A', category: 'environment', severity: 'ok', message: 'OK', fixable: false },
      { name: 'B', category: 'environment', severity: 'error', message: 'Fail', fixable: false },
      { name: 'C', category: 'data', severity: 'warn', message: 'Warn', fixable: false },
    ]

    reporter.report(results)

    const joined = output.join('\n')
    expect(joined).toContain('1 error')
    expect(joined).toContain('1 warning')
    expect(joined).toContain('1 passed')
  })

  it('formatSummary returns only summary when no issues', () => {
    const results: CheckResult[] = [
      { name: 'A', category: 'environment', severity: 'ok', message: 'OK', fixable: false },
    ]

    reporter.reportSummaryOnly(results)

    const joined = output.join('\n')
    expect(joined).not.toContain('環境')
    expect(joined).toContain('0 error')
  })
})
