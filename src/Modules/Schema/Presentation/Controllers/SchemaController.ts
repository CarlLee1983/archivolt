import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import type { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { addVirtualFK, removeVirtualFK, confirmSuggestion, ignoreSuggestion } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export class SchemaController {
  constructor(
    private repo: JsonFileRepository,
    private exportService: ExportService,
  ) {}

  async getSchema(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded. Import a dbcli config first.'), 404)
    }
    return ctx.json(ApiResponse.success(model))
  }

  async addVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ tableName: string; columns: string[]; refTable: string; refColumns: string[] }>()
    try {
      const updated = addVirtualFK(model, body)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success(updated.tables[body.tableName].virtualForeignKeys))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async deleteVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ tableName: string }>()
    const vfkId = ctx.getParam('id')!
    try {
      const updated = removeVirtualFK(model, body.tableName, vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ deleted: vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async confirmVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ tableName: string; vfkId: string }>()
    try {
      const updated = confirmSuggestion(model, body.tableName, body.vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ confirmed: body.vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async ignoreVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ tableName: string; vfkId: string }>()
    try {
      const updated = ignoreSuggestion(model, body.tableName, body.vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ ignored: body.vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async updateGroups(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ groups: ERModel['groups'] }>()
    const updated: ERModel = { ...model, groups: body.groups }
    await this.repo.save(updated)
    return ctx.json(ApiResponse.success(updated.groups))
  }

  async getSuggestions(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const suggestions: Array<{ tableName: string; vfk: any }> = []
    for (const table of Object.values(model.tables)) {
      for (const vfk of table.virtualForeignKeys) {
        if (vfk.confidence === 'auto-suggested') {
          suggestions.push({ tableName: table.name, vfk })
        }
      }
    }
    return ctx.json(ApiResponse.success(suggestions))
  }

  async exportSchema(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ format: string }>()
    try {
      const output = this.exportService.export(model, body.format)
      return ctx.json(ApiResponse.success({ format: body.format, content: output }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async listExportFormats(ctx: IHttpContext): Promise<Response> {
    return ctx.json(ApiResponse.success(this.exportService.listFormats()))
  }
}
