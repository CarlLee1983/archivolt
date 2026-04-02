import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export interface IExporter {
  readonly name: string
  readonly label: string
  export(model: ERModel): string
}
