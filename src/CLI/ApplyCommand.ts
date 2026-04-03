import path from 'node:path'
import readline from 'node:readline'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { applyInferredRelations } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

export interface ApplyArgs {
  readonly sessionId: string
  readonly minConfidence: 'high' | 'medium' | 'low'
  readonly dryRun: boolean
  readonly auto: boolean
}

const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const
const CONFIDENCE_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export function parseApplyArgs(argv: string[]): ApplyArgs {
  const applyIdx = argv.indexOf('apply')
  const rest = argv.slice(applyIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt apply <session-id> [--min-confidence high|medium|low] [--dry-run] [--auto]')
  }

  const confidenceIdx = rest.indexOf('--min-confidence')
  const minConfidence: 'high' | 'medium' | 'low' =
    confidenceIdx !== -1
      ? (rest[confidenceIdx + 1] as 'high' | 'medium' | 'low')
      : 'high'

  if (!VALID_CONFIDENCE.includes(minConfidence)) {
    throw new Error(`Invalid --min-confidence value: "${minConfidence}". Valid values: ${VALID_CONFIDENCE.join(', ')}`)
  }

  const dryRun = rest.includes('--dry-run')
  const auto = rest.includes('--auto')

  return { sessionId, minConfidence, dryRun, auto }
}

function filterByConfidence(
  relations: readonly InferredRelation[],
  minConfidence: 'high' | 'medium' | 'low',
): readonly InferredRelation[] {
  const minRank = CONFIDENCE_RANK[minConfidence]
  return relations.filter((r) => CONFIDENCE_RANK[r.confidence] >= minRank)
}

function formatRelation(relation: InferredRelation): string {
  return `${relation.sourceTable}.${relation.sourceColumn} → ${relation.targetTable}.${relation.targetColumn}  (${relation.confidence}, ${relation.evidence})`
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

export async function runApplyCommand(argv: string[]): Promise<void> {
  const args = parseApplyArgs(argv)

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

  const filtered = filterByConfidence(manifest.inferredRelations, args.minConfidence)

  if (filtered.length === 0) {
    console.log(`No inferred relations found with ≥ ${args.minConfidence} confidence.`)
    return
  }

  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')
  const schemaRepo = new JsonFileRepository(archivoltPath)
  const model = await schemaRepo.load()

  if (!model) {
    console.error('No schema loaded. Run import first.')
    process.exit(1)
  }

  if (args.dryRun) {
    console.log(`Found ${filtered.length} inferred relations (≥ ${args.minConfidence} confidence):\n`)
    filtered.forEach((r, i) => {
      console.log(`  [${i + 1}/${filtered.length}] ${formatRelation(r)}`)
    })
    console.log('\n(dry-run: no changes written)')
    return
  }

  if (args.auto) {
    const result = applyInferredRelations(model, filtered, args.minConfidence)
    await schemaRepo.save(result.model)
    console.log(`Summary: ${result.added} added, ${result.skipped} skipped`)
    return
  }

  // Interactive mode
  console.log(`Found ${filtered.length} inferred relations (≥ ${args.minConfidence} confidence):\n`)

  let currentModel = model
  let added = 0
  let skipped = 0

  for (let i = 0; i < filtered.length; i++) {
    const relation = filtered[i]
    console.log(`  [${i + 1}/${filtered.length}] ${formatRelation(relation)}`)
    const answer = await promptUser('      Accept? [Y/n/q] ')

    if (answer === 'q') {
      console.log('Aborted.')
      break
    }

    if (answer === 'n') {
      console.log('  ⏭  Skipped')
      skipped++
      continue
    }

    // y or enter (default yes)
    const result = applyInferredRelations(currentModel, [relation], args.minConfidence)
    currentModel = result.model
    added += result.added
    skipped += result.skipped
    console.log('  ✅ Added')
  }

  if (added > 0) {
    await schemaRepo.save(currentModel)
  }

  console.log(`\nSummary: ${added} added, ${skipped} skipped`)
}
