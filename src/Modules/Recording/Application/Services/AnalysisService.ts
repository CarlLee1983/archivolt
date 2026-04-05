// src/Modules/Recording/Application/Services/AnalysisService.ts
import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import { pairHttpChunks } from '@/Modules/Recording/Application/Strategies/HttpFlowGrouper'
import { correlate } from '@/Modules/Recording/Application/Services/UnifiedCorrelationService'
import { analyzeReadWriteRatio } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import { detectN1Queries } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import { detectQueryFragmentation } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import { renderOptimizationReport } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import type { OptimizationReportData } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer'
import { renderOptimizationReportJson } from '@/Modules/Recording/Infrastructure/Renderers/OptimizationReportJsonRenderer'

export type AnalysisType = 'manifest' | 'optimize'

export async function runAnalysis(
  sessionId: string,
  type: AnalysisType,
  onProgress: (message: string) => void,
  recordingsDir: string,
): Promise<void> {
  const repo = new RecordingRepository(recordingsDir)

  const session = await repo.loadSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const queries = await repo.loadQueries(sessionId)
  const markers = await repo.loadMarkers(sessionId)
  onProgress(`Loaded session — ${queries.length} queries`)

  const analyzer = new ChunkAnalyzerService()
  const manifest = analyzer.analyze(session, queries, markers)
  onProgress(`Built ${manifest.stats.totalChunks} chunks`)

  const httpChunks = await repo.loadHttpChunks(sessionId)
  const apiFlows =
    httpChunks.length > 0 ? correlate(pairHttpChunks(httpChunks), queries) : undefined

  const analysisDir = path.resolve(process.cwd(), `data/analysis/${sessionId}`)
  if (!existsSync(analysisDir)) mkdirSync(analysisDir, { recursive: true })

  if (type === 'manifest') {
    const md = renderManifest(manifest, apiFlows)
    const json = JSON.stringify(apiFlows ? { ...manifest, apiFlows } : manifest, null, 2)
    await writeFile(path.join(analysisDir, 'manifest.md'), md, 'utf-8')
    await writeFile(path.join(analysisDir, 'manifest.json'), json, 'utf-8')
    onProgress('Manifest written')
    return
  }

  // type === 'optimize'
  const readWriteReport = analyzeReadWriteRatio(queries)
  onProgress('Read/write analysis complete')

  const n1Findings = apiFlows ? detectN1Queries(apiFlows, queries) : []
  onProgress(`N+1 detection complete — ${n1Findings.length} found`)

  const fragmentationFindings = apiFlows ? detectQueryFragmentation(apiFlows, queries) : []
  onProgress(`Fragmentation detection complete — ${fragmentationFindings.length} found`)

  const reportData: OptimizationReportData = {
    sessionId,
    generatedAt: new Date().toISOString(),
    enabledLayers: ['pattern'],
    readWriteReport,
    n1Findings: [...n1Findings],
    fragmentationFindings: [...fragmentationFindings],
  }

  await writeFile(
    path.join(analysisDir, 'optimization-report.md'),
    renderOptimizationReport(reportData),
    'utf-8',
  )
  await writeFile(
    path.join(analysisDir, 'optimization-report.json'),
    renderOptimizationReportJson(reportData),
    'utf-8',
  )
  onProgress('Optimization report written')
}
