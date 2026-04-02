import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

export interface IFileWriter {
  write(result: ExportResult): Promise<void>
}
