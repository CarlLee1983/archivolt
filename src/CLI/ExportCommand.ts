import { StdoutWriter } from '@/Modules/Schema/Infrastructure/Writers/StdoutWriter'
import { DirectoryWriter } from '@/Modules/Schema/Infrastructure/Writers/DirectoryWriter'
import { LaravelArtisanWriter } from '@/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import type { IFileWriter } from '@/Modules/Schema/Infrastructure/Writers/IFileWriter'
import path from 'node:path'

export interface ExportArgs {
  readonly format: string
  readonly output?: string
  readonly laravel?: string
}

const VALID_FORMATS = ['mermaid', 'dbml', 'prisma', 'eloquent']

export function parseExportArgs(argv: string[]): ExportArgs {
  const exportIdx = argv.indexOf('export')
  const rest = argv.slice(exportIdx + 1)

  const format = rest[0]
  if (!format || format.startsWith('-')) {
    throw new Error(`Missing format. Available: ${VALID_FORMATS.join(', ')}`)
  }
  if (!VALID_FORMATS.includes(format)) {
    throw new Error(`Unknown format: "${format}". Available: ${VALID_FORMATS.join(', ')}`)
  }

  const outputIdx = rest.indexOf('--output')
  const output = outputIdx !== -1 ? rest[outputIdx + 1] : undefined

  const laravelIdx = rest.indexOf('--laravel')
  const laravel = laravelIdx !== -1 ? rest[laravelIdx + 1] : undefined

  if (laravel && format !== 'eloquent') {
    throw new Error('--laravel can only be used with eloquent format')
  }
  if (laravel && output) {
    throw new Error('--laravel and --output are mutually exclusive')
  }

  return { format, output, laravel }
}

export function resolveWriter(options: { output?: string; laravel?: string }): IFileWriter {
  if (options.laravel) {
    return new LaravelArtisanWriter(options.laravel)
  }
  if (options.output) {
    return new DirectoryWriter(options.output)
  }
  return new StdoutWriter()
}

export async function runExportCommand(argv: string[]): Promise<void> {
  const args = parseExportArgs(argv)
  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')
  const repo = new JsonFileRepository(archivoltPath)
  const model = await repo.load()

  if (!model) {
    console.error('No schema loaded. Run import first.')
    process.exit(1)
  }

  const exportService = new ExportService([
    new MermaidExporter(),
    new DbmlExporter(),
    new PrismaExporter(),
    new EloquentExporter(),
  ])

  const result = exportService.export(model, args.format)
  const writer = resolveWriter(args)
  await writer.write(result)
}
