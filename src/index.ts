import { createApp } from './app'
import { importSchema } from '@/Modules/Schema/Application/Services/ImportSchemaService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import path from 'path'

async function start() {
  const args = process.argv.slice(2)

  if (args[0] === 'export') {
    const { runExportCommand } = await import('@/CLI/ExportCommand')
    await runExportCommand(['export', ...args.slice(1)])
    process.exit(0)
  }

  if (args[0] === 'record') {
    const { runRecordCommand } = await import('@/CLI/RecordCommand')
    await runRecordCommand(['record', ...args.slice(1)])
    process.exit(0)
  }

  if (args[0] === 'doctor') {
    const { runDoctorCommand } = await import('@/Modules/Doctor/Presentation/DoctorCommand')
    await runDoctorCommand(['doctor', ...args.slice(1)])
    process.exit(0)
  }

  if (args[0] === 'analyze') {
    const { runAnalyzeCommand } = await import('@/CLI/AnalyzeCommand')
    await runAnalyzeCommand(['analyze', ...args.slice(1)])
    process.exit(0)
  }

  if (args[0] === 'apply') {
    const { runApplyCommand } = await import('@/CLI/ApplyCommand')
    await runApplyCommand(['apply', ...args.slice(1)])
    process.exit(0)
  }

  if (args[0] === 'diff') {
    const { runDiffCommand } = await import('@/CLI/DiffCommand')
    await runDiffCommand(['diff', ...args.slice(1)])
    process.exit(0)
  }

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
      const { mergeGroupsForReimport } = await import('@/Modules/Schema/Domain/GroupingStrategy')
      const { inferRelations } = await import('@/Modules/Schema/Domain/RelationInferrer')

      const freshModel = importSchema(dbcliJson)
      const mergedTables: Record<string, any> = {}
      for (const [name, freshTable] of Object.entries(freshModel.tables)) {
        const existing = existingModel.tables[name]
        mergedTables[name] = {
          ...freshTable,
          virtualForeignKeys: existing ? existing.virtualForeignKeys : freshTable.virtualForeignKeys,
        }
      }

      const suggestions = inferRelations(mergedTables)
      const mergedGroups = mergeGroupsForReimport(mergedTables, existingModel.groups, suggestions)

      const lockedCount = Object.values(mergedGroups).filter((g) => !g.auto).length
      const autoCount = Object.values(mergedGroups).filter((g) => g.auto).length

      await repo.save({
        ...freshModel,
        tables: mergedTables,
        groups: mergedGroups,
      })
      console.log(`✅ Schema reimported from ${inputPath} (annotations preserved)`)
      if (lockedCount > 0) {
        const lockedNames = Object.values(mergedGroups)
          .filter((g) => !g.auto)
          .map((g) => g.name)
          .join(', ')
        console.log(`🔒 Preserved ${lockedCount} locked groups: ${lockedNames}`)
      }
      console.log(`🔄 Re-computed ${autoCount} auto groups`)
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

  // 自動開啟瀏覽器
  const openBrowser = (url: string): void => {
    const cmd =
      process.platform === 'darwin' ? 'open' :
      process.platform === 'win32'  ? 'cmd' :
      'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', url] : [url]
    Bun.spawn([cmd, ...args], { stdout: 'ignore', stderr: 'ignore' })
  }
  setTimeout(() => openBrowser(`http://localhost:${port}`), 500)

  const schemaExists = await repo.exists()

  console.log(`
╔══════════════════════════════════════════╗
║        🏛️  Archivolt — Running            ║
╚══════════════════════════════════════════╝

📍 URL:    http://localhost:${port}
📌 API:    http://localhost:${port}/api
📊 Schema: ${schemaExists ? '✅ Loaded' : '❌ Not loaded (use --input to import)'}
`)

  // Doctor: 啟動時靜默檢查
  try {
    const { createChecks } = await import('@/Modules/Doctor/Presentation/DoctorCommand')
    const { DoctorService } = await import('@/Modules/Doctor/Application/DoctorService')
    const { DoctorReporter } = await import('@/Modules/Doctor/Infrastructure/DoctorReporter')
    const { NoopPrompter } = await import('@/Modules/Doctor/Infrastructure/InteractivePrompter')

    const checks = createChecks(process.cwd()).filter(
      (c) => c.name !== 'Port 可用',
    )
    const service = new DoctorService(checks, new NoopPrompter())
    const reporter = new DoctorReporter()
    const results = await service.runAll()

    const hasIssues = results.some((r) => r.severity !== 'ok')
    if (hasIssues) {
      reporter.reportSummaryOnly(results)
    }
  } catch {
    // 靜默檢查失敗不影響啟動
  }

  return server
}

const server = await start().catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})

export default server
