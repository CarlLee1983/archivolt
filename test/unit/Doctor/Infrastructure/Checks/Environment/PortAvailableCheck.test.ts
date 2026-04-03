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
      expect(result.fixable).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('fix() returns ok after freeing the port', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(59125, resolve))

    const check = new PortAvailableCheck(59125)

    // 先手動關閉 server 模擬 fix 成功場景
    await new Promise<void>((resolve) => server.close(() => resolve()))

    const result = await check.fix()
    // port 已釋放，getPidOnPort 找不到程序
    expect(result.severity).toBe('error')
    expect(result.message).toContain('無法找到')
  })
})
