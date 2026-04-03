import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createServer } from 'node:net'

export class PortAvailableCheck implements IHealthCheck {
  readonly name = 'Port 可用'
  readonly category = 'environment' as const

  constructor(private readonly port: number = 3100) {}

  async check(): Promise<CheckResult> {
    const available = await this.isPortFree(this.port)

    if (!available) {
      return createCheckResult(this, 'error', `:${this.port} 已被佔用，請釋放該 port 或設定 PORT 環境變數`)
    }

    return createCheckResult(this, 'ok', `:${this.port} 未被佔用`)
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close(() => resolve(true))
      })
      server.listen(port)
    })
  }
}
