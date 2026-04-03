import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { diffManifests } from '@/Modules/Recording/Application/Services/SessionDiffService'
import { renderDiff } from '@/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer'

export interface DiffArgs {
  readonly sessionA: string
  readonly sessionB: string
  readonly format: 'md' | 'json'
  readonly output?: string
  readonly stdout: boolean
}

export function parseDiffArgs(argv: string[]): DiffArgs {
  const diffIdx = argv.indexOf('diff')
  const restAll = argv.slice(diffIdx + 1)

  // Parse positional args (non-flag tokens before any --flag)
  const positional: string[] = []
  for (const token of restAll) {
    if (token.startsWith('--')) break
    positional.push(token)
  }

  if (positional.length < 2) {
    throw new Error('Usage: archivolt diff <session-a> <session-b> [--format md|json] [--output path] [--stdout]')
  }

  const sessionA = positional[0]
  const sessionB = positional[1]

  const formatIdx = restAll.indexOf('--format')
  const format = formatIdx !== -1 ? (restAll[formatIdx + 1] as 'md' | 'json') : 'md'

  const stdout = restAll.includes('--stdout')

  const outputIdx = restAll.indexOf('--output')
  const output = outputIdx !== -1 ? restAll[outputIdx + 1] : undefined

  return { sessionA, sessionB, format, output, stdout }
}

export async function runDiffCommand(argv: string[]): Promise<void> {
  const args = parseDiffArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)
  const analyzer = new ChunkAnalyzerService()

  const [sessionA, sessionB] = await Promise.all([
    repo.loadSession(args.sessionA),
    repo.loadSession(args.sessionB),
  ])

  if (!sessionA) {
    console.error(`Session not found: ${args.sessionA}`)
    process.exit(1)
  }
  if (!sessionB) {
    console.error(`Session not found: ${args.sessionB}`)
    process.exit(1)
  }

  const [queriesA, markersA, queriesB, markersB] = await Promise.all([
    repo.loadQueries(args.sessionA),
    repo.loadMarkers(args.sessionA),
    repo.loadQueries(args.sessionB),
    repo.loadMarkers(args.sessionB),
  ])

  const manifestA = analyzer.analyze(sessionA, queriesA, markersA)
  const manifestB = analyzer.analyze(sessionB, queriesB, markersB)

  const diff = diffManifests(manifestA, manifestB)

  if (args.stdout) {
    console.log(JSON.stringify(diff, null, 2))
    return
  }

  if (args.format === 'json') {
    const json = JSON.stringify(diff, null, 2)
    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/diff-${args.sessionA}-${args.sessionB}.json`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, json, 'utf-8')
    console.log(`Diff (JSON) written to: ${outPath}`)
    return
  }

  const md = renderDiff(diff)

  if (args.output) {
    const dir = path.dirname(args.output)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(args.output, md, 'utf-8')
    console.log(`Diff written to: ${args.output}`)
    return
  }

  console.log(md)
}
