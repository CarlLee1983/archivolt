import { createApp } from './app'
import { importSchema } from '@/Modules/Schema/Application/Services/ImportSchemaService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import path from 'path'

async function start() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf('--input')
  const reimport = args.includes('--reimport')

  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')
  const repo = new JsonFileRepository(archivoltPath)

  // Handle import
  if (inputIndex !== -1 && args[inputIndex + 1]) {
    const inputPath = path.resolve(args[inputIndex + 1])
    const file = Bun.file(inputPath)
    const exists = await file.exists()
    if (!exists) {
      console.error(`❌ Input file not found: ${inputPath}`)
      process.exit(1)
    }

    const dbcliJson = await file.json()
    const existingModel = await repo.load()

    if (existingModel && !reimport) {
      console.log('⚡ archivolt.json already exists. Use --reimport to update schema while preserving annotations.')
    } else if (existingModel && reimport) {
      const freshModel = importSchema(dbcliJson)
      const mergedTables: Record<string, any> = {}
      for (const [name, freshTable] of Object.entries(freshModel.tables)) {
        const existing = existingModel.tables[name]
        mergedTables[name] = {
          ...freshTable,
          virtualForeignKeys: existing ? existing.virtualForeignKeys : freshTable.virtualForeignKeys,
        }
      }
      await repo.save({
        ...freshModel,
        tables: mergedTables,
        groups: existingModel.groups,
      })
      console.log(`✅ Schema reimported from ${inputPath} (annotations preserved)`)
    } else {
      const model = importSchema(dbcliJson)
      await repo.save(model)
      console.log(`✅ Schema imported: ${Object.keys(model.tables).length} tables, ${Object.keys(model.groups).length} groups`)
    }
  }

  // Start server
  const core = await createApp()
  const port = (core.config.get<number>('PORT') ?? 3100) as number
  const server = core.liftoff(port)

  const schemaExists = await repo.exists()

  console.log(`
╔══════════════════════════════════════════╗
║        🏛️  Archivolt — Running            ║
╚══════════════════════════════════════════╝

📍 URL:    http://localhost:${port}
📌 API:    http://localhost:${port}/api
📊 Schema: ${schemaExists ? '✅ Loaded' : '❌ Not loaded (use --input to import)'}
`)

  return server
}

const server = await start().catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})

export default server
