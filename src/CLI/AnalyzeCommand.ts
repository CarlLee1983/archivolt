import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile, readFile } from 'node:fs/promises'
import type { ImportFormat } from '@/Modules/Recording/Application/Services/LogImportService'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import { pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import { correlate } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'
import { analyzeReadWriteRatio } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import { detectN1Queries } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import { detectQueryFragmentation } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import { parseDdlSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'
import { analyzeIndexCoverageGaps } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import { renderOptimizationReport } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import type { OptimizationReportData, EnabledLayer } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import { renderOptimizationReportJson } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer'
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'
import { runExplainAnalysis, MysqlExplainAdapter } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import { PostgresExplainAdapter } from '@/Modules/Recording/Application/Services/PostgresExplainAdapter'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'
import { extractTopN } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import { runLlmOptimization } from '@/Modules/Recording/Application/Services/LlmOptimizationService'
import { renderLlmSection } from '@/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer'

export interface AnalyzeArgs {
  readonly sessionId?: string        // undefined when --from is used
  readonly fromFormat?: ImportFormat // set when --from is used
  readonly fromPath?: string         // set when --from is used
  readonly output?: string
  readonly format: 'md' | 'json' | 'optimize-md'
  readonly stdout: boolean
  readonly ddlPath?: string
  readonly explainDbUrl?: string
  readonly llm: boolean
  readonly topN: number
  readonly llmSeparate: boolean
  readonly minRows: number
  readonly explainConcurrency: number
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const fromIdx = rest.indexOf('--from')
  let sessionId: string | undefined
  let fromFormat: ImportFormat | undefined
  let fromPath: string | undefined

  if (fromIdx !== -1) {
    fromFormat = rest[fromIdx + 1] as ImportFormat
    fromPath = rest[fromIdx + 2]
    if (!fromFormat || !fromPath) {
      throw new Error('Usage: archivolt analyze --from <general-log|slow-log|canonical|postgres-slow-log|postgres-csv-log> <file-path>')
    }
    const VALID_FORMATS = ['canonical', 'general-log', 'slow-log', 'postgres-slow-log', 'postgres-csv-log'] as const
    if (!VALID_FORMATS.includes(fromFormat as typeof VALID_FORMATS[number])) {
      throw new Error(
        `Unknown format "${fromFormat}". Valid options: ${VALID_FORMATS.join(', ')}`
      )
    }
  } else {
    sessionId = rest[0]
    if (!sessionId || sessionId.startsWith('--')) {
      throw new Error(
        'Usage: archivolt analyze <session-id> [--format md|json|optimize-md] [--stdout]\n' +
        '   or: archivolt analyze --from <general-log|slow-log|canonical|postgres-slow-log|postgres-csv-log> <file-path>'
      )
    }
  }

  const formatIdx = rest.indexOf('--format')
  const format = formatIdx !== -1 ? (rest[formatIdx + 1] as AnalyzeArgs['format']) : 'md'

  const stdout = rest.includes('--stdout')

  const outputIdx = rest.indexOf('--output')
  const altOutputIdx = rest.indexOf('-o')
  const output = outputIdx !== -1
    ? rest[outputIdx + 1]
    : altOutputIdx !== -1
      ? rest[altOutputIdx + 1]
      : undefined

  const ddlIdx = rest.indexOf('--ddl')
  const ddlPath = ddlIdx !== -1 ? rest[ddlIdx + 1] : undefined

  const explainDbIdx = rest.indexOf('--explain-db')
  const explainDbUrl = explainDbIdx !== -1 ? rest[explainDbIdx + 1] : undefined

  const minRowsIdx = rest.indexOf('--min-rows')
  const minRows = minRowsIdx !== -1 ? Number(rest[minRowsIdx + 1]) : 1000

  const llm = rest.includes('--llm')

  const topNIdx = rest.indexOf('--top-n')
  const topNRaw = topNIdx !== -1 ? Number(rest[topNIdx + 1]) : 5
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 5

  const llmSeparate = rest.includes('--llm-separate')

  const concurrencyIdx = rest.indexOf('--explain-concurrency')
  const explainConcurrency = concurrencyIdx !== -1 ? Number(rest[concurrencyIdx + 1]) : 5

  return { sessionId, fromFormat, fromPath, output, format, stdout, ddlPath, explainDbUrl, llm, topN, llmSeparate, minRows, explainConcurrency }
}

export async function runAnalyzeCommand(argv: string[]): Promise<void> {
  const args = parseAnalyzeArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)

  // --from: import log file into a virtual session first
  let sessionId = args.sessionId
  if (args.fromFormat && args.fromPath) {
    console.log(`Importing ${args.fromFormat} from: ${args.fromPath}`)
    const { LogImportService } = await import('@/Modules/Recording/Application/Services/LogImportService')
    const importSvc = new LogImportService(repo)
    sessionId = await importSvc.import(args.fromPath, args.fromFormat)
    console.log(`Created virtual session: ${sessionId}`)
  }

  if (!sessionId) {
    console.error('No session ID resolved.')
    process.exit(1)
  }

  const session = await repo.loadSession(sessionId)
  if (!session) {
    console.error(`Session not found: ${sessionId}`)
    process.exit(1)
  }

  const queries = await repo.loadQueries(sessionId)
  const markers = await repo.loadMarkers(sessionId)

  const analyzer = new ChunkAnalyzerService()
  const manifest = analyzer.analyze(session, queries, markers)

  // HTTP proxy データ（なければスキップ）
  const httpChunks = await repo.loadHttpChunks(sessionId)
  const apiFlows = httpChunks.length > 0
    ? correlate(pairHttpChunks(httpChunks), queries)
    : undefined

  if (args.format === 'json' || args.stdout) {
    const output = apiFlows ? { ...manifest, apiFlows } : manifest
    const json = JSON.stringify(output, null, 2)
    if (args.stdout) {
      console.log(json)
      return
    }
    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${sessionId}/manifest.json`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, json, 'utf-8')
    console.log(`Manifest (JSON) written to: ${outPath}`)
    return
  }

  if (args.format === 'optimize-md') {
    const readWriteReport = analyzeReadWriteRatio(queries)
    const enabledLayers: EnabledLayer[] = ['pattern']

    const n1Findings = apiFlows ? detectN1Queries(apiFlows, queries) : []
    const fragmentationFindings = apiFlows ? detectQueryFragmentation(apiFlows, queries) : []

    let indexGapFindings: readonly IndexGapFinding[] | undefined

    if (args.ddlPath) {
      enabledLayers.push('ddl')
      const ddlContent = await readFile(args.ddlPath, 'utf-8')
      const schema = parseDdlSchema(ddlContent)
      const gaps = analyzeIndexCoverageGaps(n1Findings, fragmentationFindings, schema)
      indexGapFindings = gaps.length > 0 ? gaps : undefined
    }

    let fullScanFindings: readonly FullScanFinding[] | undefined
    let explainWarning: string | undefined

    if (args.explainDbUrl) {
      enabledLayers.push('explain')
      if (!args.explainDbUrl.startsWith('mysql://') && !args.explainDbUrl.startsWith('postgresql://') && !args.explainDbUrl.startsWith('postgres://')) {
        console.error('--explain-db 需要完整 URL（e.g. mysql://user:pass@localhost:3306/mydb）')
        process.exit(1)
      }
      if (args.explainDbUrl.startsWith('mysql://')) {
        try {
          const adapter = await MysqlExplainAdapter.connect(args.explainDbUrl)
          try {
            const findings = await runExplainAnalysis(queries, adapter, args.minRows, args.explainConcurrency)
            fullScanFindings = findings.length > 0 ? findings : undefined
          } finally {
            await adapter.close()
          }
        } catch (err) {
          explainWarning = `EXPLAIN 連線失敗，Layer 2b 跳過：${err instanceof Error ? err.message : String(err)}`
        }
      } else {
        // PostgreSQL branch (postgresql:// or postgres://)
        const isPg = args.explainDbUrl.startsWith('postgresql://') || args.explainDbUrl.startsWith('postgres://')
        if (isPg) {
          if (args.ddlPath) {
            console.warn('⚠️  DDL 解析對 PostgreSQL 語法支援有限，建議搭配 --explain-db 確認結果')
          }
          try {
            const adapter = await PostgresExplainAdapter.connect(args.explainDbUrl, args.explainConcurrency)
            try {
              const findings = await runExplainAnalysis(queries, adapter, args.minRows, args.explainConcurrency)
              fullScanFindings = findings.length > 0 ? findings : undefined
            } finally {
              await adapter.close()
            }
          } catch (err) {
            explainWarning = `PostgreSQL EXPLAIN 連線失敗，Layer 2b 跳過：${err instanceof Error ? err.message : String(err)}`
          }
        }
      }
    }

    // Layer 3: LLM analysis
    let llmSuggestions: readonly LlmSuggestion[] | undefined
    let llmInterrupted = false
    let llmTotal = 0

    if (args.llm) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('Error: ANTHROPIC_API_KEY is not set. Export it before using --llm.\n  export ANTHROPIC_API_KEY=sk-ant-...')
        process.exit(1)
      }

      enabledLayers.push('llm')
      const topNEntries = extractTopN(
        [...n1Findings],
        [...fragmentationFindings],
        fullScanFindings ? [...fullScanFindings] : [],
        args.topN,
      )
      llmTotal = topNEntries.length

      const controller = new AbortController()
      const sigintHandler = () => {
        console.log('\n⚠ Interrupted — saving partial results...')
        controller.abort()
      }
      process.once('SIGINT', sigintHandler)

      const collected: LlmSuggestion[] = []
      console.log(`Running Layer 3 LLM analysis (${topNEntries.length} findings)...`)

      try {
        await runLlmOptimization({
          topNEntries,
          readWriteReport,
          ddlSchema: args.ddlPath ? parseDdlSchema(await readFile(args.ddlPath, 'utf-8')) : undefined,
          onResult: (s) => {
            collected.push(s)
            console.log(`  [${collected.length}/${topNEntries.length}] ${s.findingType}: done`)
          },
          signal: controller.signal,
        })
        llmInterrupted = controller.signal.aborted
      } finally {
        process.removeListener('SIGINT', sigintHandler)
      }

      llmSuggestions = collected.length > 0 ? collected : undefined
    }

    const reportData: OptimizationReportData = {
      sessionId: sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers,
      readWriteReport,
      n1Findings: [...n1Findings],
      fragmentationFindings: [...fragmentationFindings],
      indexGapFindings,
      fullScanFindings,
      explainWarning,
      llmSuggestions,
      llmInterrupted: llmInterrupted || undefined,
      llmTotal: llmTotal > 0 ? llmTotal : undefined,
    }

    if (args.stdout) {
      console.log(renderOptimizationReport(reportData))
      return
    }

    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${sessionId}/optimization-report.md`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    if (args.llm && args.llmSeparate && llmSuggestions && llmSuggestions.length > 0) {
      // Write LLM section to separate file — strip it from the main report
      const reportDataWithoutLlm: OptimizationReportData = {
        ...reportData,
        llmSuggestions: undefined,
        llmInterrupted: undefined,
        llmTotal: undefined,
      }
      const llmOutPath = outPath.replace('.md', '.llm.md')
      await writeFile(llmOutPath, renderLlmSection(llmSuggestions, llmInterrupted, llmTotal), 'utf-8')
      console.log(`LLM recommendations written to: ${llmOutPath}`)
      await writeFile(outPath, renderOptimizationReport(reportDataWithoutLlm), 'utf-8')
    } else {
      await writeFile(outPath, renderOptimizationReport(reportData), 'utf-8')
    }

    const jsonOutPath = outPath.replace('.md', '.json')
    await writeFile(jsonOutPath, renderOptimizationReportJson(reportData), 'utf-8')
    console.log(`Optimization report written to: ${outPath}`)
    return
  }

  const md = renderManifest(manifest, apiFlows)
  const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${sessionId}/manifest.md`)
  const dir = path.dirname(outPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(outPath, md, 'utf-8')
  console.log(`Manifest written to: ${outPath}`)
}
