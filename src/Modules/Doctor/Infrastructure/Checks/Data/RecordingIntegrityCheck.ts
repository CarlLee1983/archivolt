import type { IHealthCheck, CheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { createCheckResult } from '@/Modules/Doctor/Domain/IHealthCheck'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export class RecordingIntegrityCheck implements IHealthCheck {
  readonly name = '錄製資料完整性'
  readonly category = 'data' as const

  constructor(private readonly recordingsDir: string) {}

  async check(): Promise<CheckResult> {
    if (!existsSync(this.recordingsDir)) {
      return createCheckResult(this, 'ok', '0 sessions（目錄不存在）')
    }

    const entries = readdirSync(this.recordingsDir, { withFileTypes: true })
    const sessionDirs = entries.filter((e) => e.isDirectory())

    if (sessionDirs.length === 0) {
      return createCheckResult(this, 'ok', '0 sessions')
    }

    const corrupted: string[] = []

    for (const dir of sessionDirs) {
      const sessionPath = path.join(this.recordingsDir, dir.name, 'session.json')
      const queriesPath = path.join(this.recordingsDir, dir.name, 'queries.jsonl')
      const markersPath = path.join(this.recordingsDir, dir.name, 'markers.jsonl')

      if (existsSync(sessionPath)) {
        try {
          JSON.parse(readFileSync(sessionPath, 'utf-8'))
        } catch {
          corrupted.push(dir.name)
          continue
        }
      }

      for (const jsonlPath of [queriesPath, markersPath]) {
        if (!existsSync(jsonlPath)) continue
        const text = readFileSync(jsonlPath, 'utf-8').trim()
        if (!text) continue

        for (const line of text.split('\n')) {
          try {
            JSON.parse(line)
          } catch {
            if (!corrupted.includes(dir.name)) corrupted.push(dir.name)
            break
          }
        }
      }
    }

    if (corrupted.length > 0) {
      return createCheckResult(
        this,
        'warn',
        `${sessionDirs.length} sessions, ${corrupted.length} 損壞: ${corrupted.join(', ')}`,
      )
    }

    return createCheckResult(this, 'ok', `${sessionDirs.length} sessions, 0 損壞`)
  }
}
