import type { CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'

const SEVERITY_ICON: Record<string, string> = {
  ok: '✓',
  warn: '!',
  error: '✗',
}

const CATEGORY_LABEL: Record<string, string> = {
  environment: '環境',
  data: '資料完整性',
}

export class DoctorReporter {
  constructor(private readonly log: (msg: string) => void = console.log) {}

  report(results: readonly CheckResult[]): void {
    this.log('\n🔍 Archivolt Doctor\n')

    const grouped = this.groupByCategory(results)

    for (const [category, items] of grouped) {
      const label = CATEGORY_LABEL[category] ?? category
      this.log(`── ${label} ${'─'.repeat(Math.max(0, 36 - label.length))}`)
      for (const r of items) {
        const icon = SEVERITY_ICON[r.severity]
        this.log(`  ${icon} ${r.name.padEnd(18)} ${r.message}`)
      }
      this.log('')
    }

    this.printSummaryLine(results)
  }

  reportSummaryOnly(results: readonly CheckResult[]): void {
    const hasIssues = results.some((r) => r.severity !== 'ok')
    if (!hasIssues) {
      this.printSummaryLine(results)
      return
    }

    this.log('\n⚠️  Archivolt Doctor 發現問題：')
    for (const r of results.filter((r) => r.severity !== 'ok')) {
      const icon = SEVERITY_ICON[r.severity]
      this.log(`  ${icon} ${r.name}: ${r.message}`)
    }
    this.printSummaryLine(results)
    this.log('  執行 `bun run dev doctor` 查看詳情並修復\n')
  }

  private printSummaryLine(results: readonly CheckResult[]): void {
    const errors = results.filter((r) => r.severity === 'error').length
    const warns = results.filter((r) => r.severity === 'warn').length
    const passed = results.filter((r) => r.severity === 'ok').length

    this.log(`── 結果 ${'─'.repeat(32)}`)
    this.log(`  ${errors} error, ${warns} warning, ${passed} passed\n`)
  }

  private groupByCategory(results: readonly CheckResult[]): Map<string, CheckResult[]> {
    const grouped = new Map<string, CheckResult[]>()
    for (const r of results) {
      const list = grouped.get(r.category) ?? []
      list.push(r)
      grouped.set(r.category, list)
    }
    return grouped
  }
}
