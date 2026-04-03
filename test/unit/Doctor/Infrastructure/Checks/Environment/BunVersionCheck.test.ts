import { BunVersionCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/BunVersionCheck'

describe('BunVersionCheck', () => {
  it('returns ok when bun version is available', async () => {
    const check = new BunVersionCheck()
    const result = await check.check()
    expect(result.severity).toBe('ok')
    expect(result.category).toBe('environment')
    expect(result.name).toBe('Bun 版本')
  })
})
