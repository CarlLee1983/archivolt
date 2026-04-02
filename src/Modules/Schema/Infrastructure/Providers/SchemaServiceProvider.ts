import { ModuleServiceProvider, type IContainer } from '@/Shared/Infrastructure/IServiceProvider'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import path from 'path'

export class SchemaServiceProvider extends ModuleServiceProvider {
  register(container: IContainer): void {
    container.singleton('jsonFileRepository', () => {
      const filePath = process.env.ARCHIVOLT_FILE ?? path.resolve(process.cwd(), 'archivolt.json')
      return new JsonFileRepository(filePath)
    })

    container.singleton('exportService', () => {
      return new ExportService([
        new MermaidExporter(),
        new DbmlExporter(),
        new PrismaExporter(),
        new EloquentExporter(),
      ])
    })
  }
}
