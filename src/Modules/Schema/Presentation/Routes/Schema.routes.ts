import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { SchemaController } from '../Controllers/SchemaController'

export function registerSchemaRoutes(router: IModuleRouter, controller: SchemaController): void {
  router.group('/api', (r) => {
    r.get('/schema', (ctx) => controller.getSchema(ctx))
    r.put('/virtual-fk', (ctx) => controller.addVirtualFK(ctx))
    r.delete('/virtual-fk/:id', (ctx) => controller.deleteVirtualFK(ctx))
    r.post('/virtual-fk/confirm', (ctx) => controller.confirmVirtualFK(ctx))
    r.post('/virtual-fk/ignore', (ctx) => controller.ignoreVirtualFK(ctx))
    r.put('/groups', (ctx) => controller.updateGroups(ctx))
    r.post('/groups/regroup', (ctx) => controller.regroup(ctx))
    r.get('/suggestions', (ctx) => controller.getSuggestions(ctx))
    r.post('/export', (ctx) => controller.exportSchema(ctx))
    r.get('/export/formats', (ctx) => controller.listExportFormats(ctx))
  })
}
