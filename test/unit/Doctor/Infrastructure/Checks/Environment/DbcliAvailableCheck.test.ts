import { DbcliAvailableCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/DbcliAvailableCheck'

describe('DbcliAvailableCheck', () => {
  it('has correct name and category', () => {
    const check = new DbcliAvailableCheck()
    expect(check.name).toBe('dbcli 可用')
    expect(check.category).toBe('environment')
  })

  it('returns error or ok depending on dbcli availability', async () => {
    const check = new DbcliAvailableCheck()
    const result = await check.check()
    expect(['ok', 'error']).toContain(result.severity)
    expect(result.fixable).toBe(true)
  })

  it('has fix method', () => {
    const check = new DbcliAvailableCheck()
    expect(typeof check.fix).toBe('function')
  })
})
