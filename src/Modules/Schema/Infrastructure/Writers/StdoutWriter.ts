import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

export class StdoutWriter implements IFileWriter {
  async write(result: ExportResult): Promise<void> {
    const entries = [...result.files.entries()]
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) {
        process.stdout.write('\n// ---\n\n')
      }
      process.stdout.write(`${entries[i][1]}\n`)
    }
  }
}
