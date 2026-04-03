export type CheckSeverity = 'ok' | 'warn' | 'error'

export type CheckCategory = 'environment' | 'data'

export interface CheckResult {
  readonly name: string
  readonly category: CheckCategory
  readonly severity: CheckSeverity
  readonly message: string
  readonly fixable: boolean
}

export interface IHealthCheck {
  readonly name: string
  readonly category: CheckCategory
  check(): Promise<CheckResult>
  fix?(): Promise<CheckResult>
}

export function createCheckResult(
  check: IHealthCheck,
  severity: CheckSeverity,
  message: string,
): CheckResult {
  return {
    name: check.name,
    category: check.category,
    severity,
    message,
    fixable: typeof check.fix === 'function',
  }
}
