import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

export interface StubContext {
  readonly namespace: string
  readonly existingTraits: string[]
  readonly filePath: string
}

export function parseStubContext(content: string, filePath: string): StubContext {
  const nsMatch = content.match(/^namespace\s+([\w\\]+);/m)
  const namespace = nsMatch?.[1] ?? 'App\\Models'

  const traitMatches = [...content.matchAll(/^\s+use\s+(\w+);/gm)]
  const existingTraits = traitMatches.map((m) => m[1])

  return { namespace, existingTraits, filePath }
}

const TRAIT_FQCN: Readonly<Record<string, string>> = {
  HasFactory: 'Illuminate\\Database\\Eloquent\\Factories\\HasFactory',
}

export function applyStubContext(php: string, stub: StubContext): string {
  // 1. Replace namespace
  let result = php.replace(/^namespace [\w\\]+;/m, `namespace ${stub.namespace};`)

  // 2. Inject missing FQCN imports before Model import
  const missingImports = stub.existingTraits
    .filter((t) => TRAIT_FQCN[t] && !result.includes(`use ${TRAIT_FQCN[t]};`))
    .map((t) => `use ${TRAIT_FQCN[t]};`)

  if (missingImports.length > 0) {
    result = result.replace(
      'use Illuminate\\Database\\Eloquent\\Model;',
      `${missingImports.join('\n')}\nuse Illuminate\\Database\\Eloquent\\Model;`,
    )
  }

  // 3. Inject missing trait uses at top of class body
  const missingTraitUses = stub.existingTraits.filter(
    (t) => TRAIT_FQCN[t] && !result.includes(`    use ${t};`),
  )

  if (missingTraitUses.length > 0) {
    const traitBlock = missingTraitUses.map((t) => `    use ${t};`).join('\n')
    result = result.replace(/(\bextends Model\b[^{]*\{)/, `$1\n${traitBlock}`)
  }

  return result
}

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
      const modelName = path.basename(filename, '.php')
      await this.exec(`php artisan make:model ${modelName}`, { cwd: this.laravelPath })

      const modelPath = path.join(this.laravelPath, 'app', 'Models', filename)
      const stubContent = readFileSync(modelPath, 'utf-8')
      const stubContext = parseStubContext(stubContent, modelPath)
      const mergedContent = applyStubContext(content, stubContext)

      writeFileSync(modelPath, mergedContent, 'utf-8')
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
