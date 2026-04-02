import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

export class DirectoryWriter implements IFileWriter {
  constructor(private readonly outputDir: string) {}

  async write(result: ExportResult): Promise<void> {
    mkdirSync(this.outputDir, { recursive: true })
    for (const [filename, content] of result.files) {
      const filePath = path.join(this.outputDir, filename)
      writeFileSync(filePath, content, 'utf-8')
    }
  }
}
