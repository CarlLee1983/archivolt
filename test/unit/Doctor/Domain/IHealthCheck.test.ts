import { createCheckResult, type IHealthCheck } from '@/Modules/Doctor/Domain/IHealthCheck'

describe('createCheckResult', () => {
  it('creates result with fixable=true when check has fix method', () => {
    const check: IHealthCheck = {
      name: 'test-check',
      category: 'environment',
      check: async () => ({ name: 'test-check', category: 'environment', severity: 'ok', message: 'OK', fixable: true }),
      fix: async () => ({ name: 'test-check', category: 'environment', severity: 'ok', message: 'Fixed', fixable: true }),
    }

    const result = createCheckResult(check, 'error', 'Something broke')

    expect(result.name).toBe('test-check')
    expect(result.category).toBe('environment')
    expect(result.severity).toBe('error')
    expect(result.message).toBe('Something broke')
    expect(result.fixable).toBe(true)
  })

  it('creates result with fixable=false when check has no fix method', () => {
    const check: IHealthCheck = {
      name: 'readonly-check',
      category: 'data',
      check: async () => ({ name: 'readonly-check', category: 'data', severity: 'ok', message: 'OK', fixable: false }),
    }

    const result = createCheckResult(check, 'warn', 'Warning')

    expect(result.fixable).toBe(false)
  })
})
