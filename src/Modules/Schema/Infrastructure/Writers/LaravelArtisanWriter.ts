import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

type ExecFn = (command: string, options: { cwd: string }) => Promise<void>

async function defaultExec(command: string, options: { cwd: string }): Promise<void> {
  const proc = Bun.spawn(['sh', '-c', command], {
    cwd: options.cwd,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`Command failed: ${command}\n${stderr}`)
  }
}

export class LaravelArtisanWriter implements IFileWriter {
  private readonly laravelPath: string
  private readonly exec: ExecFn

  constructor(laravelPath: string, exec?: ExecFn) {
    this.laravelPath = laravelPath
    this.exec = exec ?? defaultExec
  }

  async write(result: ExportResult): Promise<void> {
    this.validateLaravelProject()

    for (const [filename, content] of result.files) {
      const modelName = filename.replace('.php', '')
      await this.exec(`php artisan make:model ${modelName}`, { cwd: this.laravelPath })
      const modelPath = path.join(this.laravelPath, 'app', 'Models', filename)
      writeFileSync(modelPath, content, 'utf-8')
    }
  }

  private validateLaravelProject(): void {
    const composerPath = path.join(this.laravelPath, 'composer.json')
    if (!existsSync(composerPath)) {
      throw new Error('Not a Laravel project: composer.json not found')
    }
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'))
    const hasLaravel = composer.require?.['laravel/framework']
    if (!hasLaravel) {
      throw new Error('Not a Laravel project: laravel/framework not in composer.json')
    }
  }
}
