import { describe, it, expect, vi } from 'vitest'
import { DoctorService } from '@/Modules/Doctor/Application/DoctorService'
import type { IHealthCheck } from '@/Modules/Doctor/Domain/IHealthCheck'
import type { IPrompter } from '@/Modules/Doctor/Domain/IPrompter'

function makeCheck(overrides: Partial<IHealthCheck> & { name: string; category: 'environment' | 'data' }): IHealthCheck {
  return {
    check: async () => ({
      name: overrides.name,
      category: overrides.category,
      severity: 'ok',
      message: 'OK',
      fixable: false,
    }),
    ...overrides,
  }
}

function makePrompter(answers: boolean[]): IPrompter {
  let idx = 0
  return {
    confirm: async () => answers[idx++] ?? false,
  }
}

describe('DoctorService', () => {
  it('runs all checks and returns results', async () => {
    const checks: IHealthCheck[] = [
      makeCheck({ name: 'env-check', category: 'environment' }),
      makeCheck({ name: 'data-check', category: 'data' }),
    ]
    const service = new DoctorService(checks, makePrompter([]))

    const results = await service.runAll()

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('env-check')
    expect(results[1].name).toBe('data-check')
  })

  it('skips data checks when environment has errors', async () => {
    const checks: IHealthCheck[] = [
      makeCheck({
        name: 'env-fail',
        category: 'environment',
        check: async () => ({
          name: 'env-fail',
          category: 'environment',
          severity: 'error',
          message: 'Failed',
          fixable: false,
        }),
      }),
      makeCheck({ name: 'data-check', category: 'data' }),
    ]
    const service = new DoctorService(checks, makePrompter([]))

    const results = await service.runAll()

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('env-fail')
  })

  it('does not skip data checks when environment has only warnings', async () => {
    const checks: IHealthCheck[] = [
      makeCheck({
        name: 'env-warn',
        category: 'environment',
        check: async () => ({
          name: 'env-warn',
          category: 'environment',
          severity: 'warn',
          message: 'Warning',
          fixable: false,
        }),
      }),
      makeCheck({ name: 'data-check', category: 'data' }),
    ]
    const service = new DoctorService(checks, makePrompter([]))

    const results = await service.runAll()

    expect(results).toHaveLength(2)
  })

  it('prompts for fixable issues and applies fixes', async () => {
    const fixFn = vi.fn(async () => ({
      name: 'fixable',
      category: 'environment' as const,
      severity: 'ok' as const,
      message: 'Fixed',
      fixable: true,
    }))

    const checks: IHealthCheck[] = [
      makeCheck({
        name: 'fixable',
        category: 'environment',
        check: async () => ({
          name: 'fixable',
          category: 'environment',
          severity: 'error',
          message: 'Broken',
          fixable: true,
        }),
        fix: fixFn,
      }),
    ]
    const service = new DoctorService(checks, makePrompter([true]))

    const results = await service.runAll()
    await service.interactiveFix(results)

    expect(fixFn).toHaveBeenCalledOnce()
  })

  it('skips fix when user declines', async () => {
    const fixFn = vi.fn(async () => ({
      name: 'fixable',
      category: 'environment' as const,
      severity: 'ok' as const,
      message: 'Fixed',
      fixable: true,
    }))

    const checks: IHealthCheck[] = [
      makeCheck({
        name: 'fixable',
        category: 'environment',
        check: async () => ({
          name: 'fixable',
          category: 'environment',
          severity: 'error',
          message: 'Broken',
          fixable: true,
        }),
        fix: fixFn,
      }),
    ]
    const service = new DoctorService(checks, makePrompter([false]))

    const results = await service.runAll()
    await service.interactiveFix(results)

    expect(fixFn).not.toHaveBeenCalled()
  })
})
