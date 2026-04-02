import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

export class ExportService {
  private readonly exporters: Map<string, IExporter>

  constructor(exporters: IExporter[]) {
    this.exporters = new Map(exporters.map((e) => [e.name, e]))
  }

  export(model: ERModel, format: string): string {
    const exporter = this.exporters.get(format)
    if (!exporter) {
      throw new Error(`Exporter not found for format: "${format}"`)
    }
    return exporter.export(model)
  }

  listFormats(): Array<{ name: string; label: string }> {
    return [...this.exporters.values()].map((e) => ({ name: e.name, label: e.label }))
  }
}
