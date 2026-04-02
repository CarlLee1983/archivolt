import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export interface ExportResult {
  readonly files: ReadonlyMap<string, string>
}

export interface IExporter {
  readonly name: string
  readonly label: string
  export(model: ERModel): ExportResult
}
