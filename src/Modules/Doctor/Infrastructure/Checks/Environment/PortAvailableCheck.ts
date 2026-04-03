import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createServer } from 'node:net'
import { execSync } from 'node:child_process'

export class PortAvailableCheck implements IHealthCheck {
  readonly name = 'Port 可用'
  readonly category = 'environment' as const

  constructor(private readonly port: number = 3100) {}

  async check(): Promise<CheckResult> {
    const available = await this.isPortFree(this.port)

    if (!available) {
      const processInfo = this.getProcessOnPort(this.port)
      const detail = processInfo ? ` (${processInfo})` : ''
      return createCheckResult(this, 'error', `:${this.port} 已被佔用${detail}，可嘗試自動終止佔用程序`)
    }

    return createCheckResult(this, 'ok', `:${this.port} 未被佔用`)
  }

  async fix(): Promise<CheckResult> {
    const pid = this.getPidOnPort(this.port)
    if (!pid) {
      return createCheckResult(this, 'error', `無法找到佔用 :${this.port} 的程序`)
    }

    try {
      process.kill(pid, 'SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const stillOccupied = !(await this.isPortFree(this.port))
      if (stillOccupied) {
        process.kill(pid, 'SIGKILL')
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      const available = await this.isPortFree(this.port)
      if (available) {
        return createCheckResult(this, 'ok', `已終止程序 (PID: ${pid})，:${this.port} 已釋放`)
      }

      return createCheckResult(this, 'error', `無法釋放 :${this.port}，請手動終止程序 (PID: ${pid})`)
    } catch {
      return createCheckResult(this, 'error', `終止程序失敗 (PID: ${pid})，請手動執行 kill ${pid}`)
    }
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

  private getPidOnPort(port: number): number | null {
    try {
      const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim()
      const pid = Number.parseInt(output.split('\n')[0], 10)
      return Number.isNaN(pid) ? null : pid
    } catch {
      return null
    }
  }

  private getProcessOnPort(port: number): string | null {
    try {
      const output = execSync(`lsof -i :${port} -P -n | head -3`, { encoding: 'utf-8' }).trim()
      const lines = output.split('\n')
      if (lines.length < 2) return null
      const parts = lines[1].split(/\s+/)
      return `${parts[0]} PID:${parts[1]}`
    } catch {
      return null
    }
  }
}
