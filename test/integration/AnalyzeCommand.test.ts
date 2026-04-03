// test/integration/AnalyzeCommand.test.ts

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import type { RecordingSession, CapturedQuery } from '@/Modules/Recording/Domain/Session'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/recordings/mock-ecommerce')

describe('Operation Manifest — fixture 端到端', () => {
  let session: RecordingSession
  let queries: CapturedQuery[]
  let markers: OperationMarker[]

  beforeAll(() => {
    session = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'session.json'), 'utf-8'))
    queries = readFileSync(path.join(FIXTURE_DIR, 'queries.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line))
    markers = readFileSync(path.join(FIXTURE_DIR, 'markers.jsonl'), 'utf-8')
      .trim().split('\n').map((line) => JSON.parse(line))
  })

  it('produces a manifest with all chunks', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    expect(manifest.sessionId).toBe('rec_mock_ecommerce')
    expect(manifest.stats.totalChunks).toBeGreaterThan(0)
    expect(manifest.operations.length).toBe(manifest.stats.totalChunks)
  })

  it('table matrix covers all tables in queries', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    const matrixTables = manifest.tableMatrix.map((t) => t.table).sort()
    const queryTables = [...new Set(queries.flatMap((q) => q.tables))].sort()
    expect(matrixTables).toEqual(queryTables)
  })

  it('infers relations from JOIN queries', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)

    const highRels = manifest.inferredRelations.filter((r) => r.confidence === 'high')
    expect(highRels.length).toBeGreaterThan(0)
    expect(highRels.some((r) => r.sourceTable === 'products' && r.targetTable === 'categories')).toBe(true)
  })

  it('renders valid markdown with parseable JSON block', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)
    const md = renderManifest(manifest)

    expect(md).toContain('# Operation Manifest')
    expect(md).toContain('## Operations')
    expect(md).toContain('## Table Involvement Matrix')

    const jsonMatch = md.match(/```json\n([\s\S]+?)\n```/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1])
    expect(parsed.sessionId).toBe('rec_mock_ecommerce')
  })

  it('manifest JSON round-trips correctly', () => {
    const analyzer = new ChunkAnalyzerService()
    const manifest = analyzer.analyze(session, queries, markers)
    const json = JSON.stringify(manifest)
    const parsed = JSON.parse(json)
    expect(parsed.sessionId).toBe(manifest.sessionId)
    expect(parsed.stats.totalChunks).toBe(manifest.stats.totalChunks)
  })
})
