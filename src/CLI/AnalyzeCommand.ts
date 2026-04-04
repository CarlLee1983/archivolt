import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import { pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import { correlate } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'

export interface AnalyzeArgs {
  readonly sessionId: string
  readonly output?: string
  readonly format: 'md' | 'json'
  readonly stdout: boolean
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const analyzeIdx = argv.indexOf('analyze')
  const rest = argv.slice(analyzeIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt analyze <session-id> [--output path] [--format md|json] [--stdout]')
  }

  const formatIdx = rest.indexOf('--format')
  const format = formatIdx !== -1 ? (rest[formatIdx + 1] as 'md' | 'json') : 'md'

  const stdout = rest.includes('--stdout')

  const outputIdx = rest.indexOf('--output')
  const altOutputIdx = rest.indexOf('-o')
  const output = outputIdx !== -1
    ? rest[outputIdx + 1]
    : altOutputIdx !== -1
      ? rest[altOutputIdx + 1]
      : undefined

  return { sessionId, output, format, stdout }
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

  const md = renderManifest(manifest, apiFlows)
  const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${args.sessionId}/manifest.md`)
  const dir = path.dirname(outPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  await writeFile(outPath, md, 'utf-8')
  console.log(`Manifest written to: ${outPath}`)
}
