import { PortAvailableCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/PortAvailableCheck'
import { createServer } from 'node:net'

describe('PortAvailableCheck', () => {
  it('returns ok when port is free', async () => {
    const check = new PortAvailableCheck(59123)
    const result = await check.check()
    expect(result.severity).toBe('ok')
    expect(result.message).toContain('59123')
  })

  it('returns error when port is occupied', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(59124, resolve))

    try {
      const check = new PortAvailableCheck(59124)
      const result = await check.check()
      expect(result.severity).toBe('error')
      expect(result.message).toContain('59124')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
