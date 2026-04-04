import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile, readFile } from 'node:fs/promises'
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
import type { IndexGapFinding } from '@/Modules/Recording/Application/Strategies/IndexCoverageGapAnalyzer'

export interface AnalyzeArgs {
  readonly sessionId: string
  readonly output?: string
  readonly format: 'md' | 'json' | 'optimize-md'
  readonly stdout: boolean
  readonly ddlPath?: string
  readonly explainDbUrl?: string
  readonly llm: boolean
  readonly minRows: number
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt analyze <session-id> [--output path] [--format md|json|optimize-md] [--stdout] [--ddl path] [--explain-db url] [--min-rows n] [--llm]')
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

  return { sessionId, output, format, stdout, ddlPath, explainDbUrl, llm, minRows }
}

export async function runAnalyzeCommand(argv: string[]): Promise<void> {
  const args = parseAnalyzeArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)

  const session = await repo.loadSession(args.sessionId)
  if (!session) {
    console.error(`Session not found: ${args.sessionId}`)
    process.exit(1)
  }

  const queries = await repo.loadQueries(args.sessionId)
  const markers = await repo.loadMarkers(args.sessionId)

  const analyzer = new ChunkAnalyzerService()
  const manifest = analyzer.analyze(session, queries, markers)

  // HTTP proxy データ（なければスキップ）
  const httpChunks = await repo.loadHttpChunks(args.sessionId)
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
    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/manifest.json`)
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

    const reportData: OptimizationReportData = {
      sessionId: args.sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers,
      readWriteReport,
      n1Findings: [...n1Findings],
      fragmentationFindings: [...fragmentationFindings],
      indexGapFindings,
    }

    const md = renderOptimizationReport(reportData)

    if (args.stdout) {
      console.log(md)
      return
    }

    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/optimization-report.md`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, md, 'utf-8')
    console.log(`Optimization report written to: ${outPath}`)
    return
  }

  const md = renderManifest(manifest, apiFlows)
  const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/manifest.md`)
  const dir = path.dirname(outPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(outPath, md, 'utf-8')
  console.log(`Manifest written to: ${outPath}`)
}
