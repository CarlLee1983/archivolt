# Session Page with In-Browser Analysis Trigger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/report/:id` with a `/session/:id` page where every session is clickable, and users can trigger Manifest or Optimization Report analysis from the browser via SSE-streamed progress — no CLI required.

**Architecture:** A new `AnalysisService` extracts the core analysis logic (shared with the existing CLI path). `RecordingController` gains two new methods backed by an in-memory `AnalysisJobStore`. The frontend `SessionPage` drives a four-state machine (idle → analyzing → done_manifest | done_optimize) using SSE for live progress.

**Tech Stack:** Bun/TypeScript backend, React + Zustand + react-router-dom v6, Tailwind CSS, native EventSource (browser SSE), Vitest unit tests.

---

## File Map

**Create (backend)**
- `src/Modules/Recording/Application/Services/AnalysisService.ts` — `runAnalysis(sessionId, type, onProgress, recordingsDir)`

**Modify (backend)**
- `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` — add `AnalysisJobStore` type, `this.jobs` Map, `triggerAnalysis()`, `streamAnalysis()`
- `src/Modules/Recording/Presentation/Routes/Recording.routes.ts` — register 2 new routes

**Modify (frontend API)**
- `web/src/api/dashboard.ts` — add `runAnalysis()`, `analyzeStreamUrl()`

**Create (frontend components)**
- `web/src/components/Session/ReportContent.tsx` — extracted report renderer (used by SessionPage)
- `web/src/components/Session/SessionHeader.tsx` — session ID, date, status, query count
- `web/src/components/Session/AnalyzeActions.tsx` — two trigger buttons
- `web/src/components/Session/ProgressLog.tsx` — SSE log terminal display

**Create (frontend page)**
- `web/src/pages/SessionPage.tsx` — four-state machine page

**Modify (frontend routing + nav)**
- `web/src/main.tsx` — add `/session/:sessionId`, redirect `/report/:sessionId`
- `web/src/components/Dashboard/SessionList.tsx` — all rows navigate to `/session/:id`

**Create (tests)**
- `test/unit/Recording/Application/AnalysisService.test.ts`

---

## Task 1: AnalysisService

**Files:**
- Create: `src/Modules/Recording/Application/Services/AnalysisService.ts`
- Create: `test/unit/Recording/Application/AnalysisService.test.ts`

- [ ] **Step 1.1: Write failing test**

```ts
// test/unit/Recording/Application/AnalysisService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAnalysis } from '@/Modules/Recording/Application/Services/AnalysisService'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true), mkdirSync: vi.fn() }))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }))

const mockRepo = {
  loadSession: vi.fn().mockResolvedValue({
    id: 'test-session',
    startedAt: Date.now(),
    status: 'stopped',
    proxy: { listenPort: 13306, targetHost: 'localhost', targetPort: 3306 },
    stats: { totalQueries: 2, byOperation: {}, tablesAccessed: [], connectionCount: 0 },
  }),
  loadQueries: vi.fn().mockResolvedValue([
    { id: 'q1', sessionId: 'test-session', sql: 'SELECT * FROM users', normalizedSql: 'SELECT * FROM users', operation: 'SELECT', tables: ['users'], timestamp: Date.now(), connectionId: 1, durationMs: 1 },
    { id: 'q2', sessionId: 'test-session', sql: 'SELECT * FROM users', normalizedSql: 'SELECT * FROM users', operation: 'SELECT', tables: ['users'], timestamp: Date.now() + 100, connectionId: 1, durationMs: 1 },
  ]),
  loadMarkers: vi.fn().mockResolvedValue([]),
  loadHttpChunks: vi.fn().mockResolvedValue([]),
}

vi.mock('@/Modules/Recording/Infrastructure/Persistence/RecordingRepository', () => ({
  RecordingRepository: vi.fn().mockImplementation(() => mockRepo),
}))

describe('AnalysisService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls onProgress with session load message for manifest type', async () => {
    const logs: string[] = []
    await runAnalysis('test-session', 'manifest', (m) => logs.push(m), 'data/recordings')
    expect(logs[0]).toMatch(/Loaded session/)
    expect(logs[0]).toMatch(/2 queries/)
  })

  it('writes manifest.md and manifest.json for manifest type', async () => {
    await runAnalysis('test-session', 'manifest', () => {}, 'data/recordings')
    const writeFileMock = vi.mocked(fsPromises.writeFile)
    const paths = writeFileMock.mock.calls.map(([p]) => p as string)
    expect(paths.some((p) => p.endsWith('manifest.md'))).toBe(true)
    expect(paths.some((p) => p.endsWith('manifest.json'))).toBe(true)
  })

  it('writes optimization-report.md and optimization-report.json for optimize type', async () => {
    await runAnalysis('test-session', 'optimize', () => {}, 'data/recordings')
    const writeFileMock = vi.mocked(fsPromises.writeFile)
    const paths = writeFileMock.mock.calls.map(([p]) => p as string)
    expect(paths.some((p) => p.endsWith('optimization-report.md'))).toBe(true)
    expect(paths.some((p) => p.endsWith('optimization-report.json'))).toBe(true)
  })

  it('calls onProgress with done message', async () => {
    const logs: string[] = []
    await runAnalysis('test-session', 'manifest', (m) => logs.push(m), 'data/recordings')
    expect(logs[logs.length - 1]).toMatch(/written/)
  })

  it('throws if session not found', async () => {
    mockRepo.loadSession.mockResolvedValueOnce(null)
    await expect(runAnalysis('missing', 'manifest', () => {}, 'data/recordings'))
      .rejects.toThrow('Session not found: missing')
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
bun test test/unit/Recording/Application/AnalysisService.test.ts
```
Expected: FAIL — `Cannot find module '@/Modules/Recording/Application/Services/AnalysisService'`

- [ ] **Step 1.3: Implement AnalysisService**

```ts
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
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
bun test test/unit/Recording/Application/AnalysisService.test.ts
```
Expected: 5 pass, 0 fail

- [ ] **Step 1.5: Commit**

```bash
git add src/Modules/Recording/Application/Services/AnalysisService.ts \
        test/unit/Recording/Application/AnalysisService.test.ts
git commit -m "feat: [proxy] AnalysisService with onProgress callback for web-triggered analysis"
```

---

## Task 2: AnalysisJobStore + Controller Methods

**Files:**
- Modify: `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`

- [ ] **Step 2.1: Add AnalysisJob type, jobs Map, and two new methods to RecordingController**

Open `src/Modules/Recording/Presentation/Controllers/RecordingController.ts`.

Add after the existing imports at line 1:

```ts
import { runAnalysis } from '@/Modules/Recording/Application/Services/AnalysisService'
```

Add after the class opening brace (before `constructor`):

```ts
  private readonly jobs = new Map<string, {
    status: 'running' | 'done' | 'error'
    type: 'manifest' | 'optimize'
    logs: string[]
    error?: string
  }>()
```

Add these two methods after the existing `getReport` method (at the end of the class, before the closing `}`):

```ts
  async triggerAnalysis(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const body = await ctx.getBody<{ type: 'manifest' | 'optimize' }>()
    const type = body.type

    const existing = this.jobs.get(id)
    if (existing?.status === 'running') {
      return ctx.json(ApiResponse.error('ALREADY_RUNNING', 'Analysis already running for this session'), 409)
    }

    const job = { status: 'running' as const, type, logs: [] as string[] }
    this.jobs.set(id, job)

    const recordingsDir =
      process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')

    runAnalysis(id, type, (message) => { job.logs.push(message) }, recordingsDir)
      .then(() => { job.status = 'done' })
      .catch((err) => {
        job.status = 'error'
        job.error = err instanceof Error ? err.message : String(err)
      })

    return ctx.json(ApiResponse.success({ jobId: id }), 202)
  }

  async streamAnalysis(ctx: IHttpContext): Promise<Response> {
    const id = ctx.getParam('id')!
    const jobs = this.jobs
    let sentCount = 0
    const encoder = new TextEncoder()
    let timer: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        }

        timer = setInterval(() => {
          const job = jobs.get(id)
          if (!job) return

          while (sentCount < job.logs.length) {
            send('progress', { message: job.logs[sentCount] })
            sentCount++
          }

          if (job.status === 'done') {
            send('done', { type: job.type })
            clearInterval(timer!)
            controller.close()
          } else if (job.status === 'error') {
            send('error', { message: job.error ?? 'Unknown error' })
            clearInterval(timer!)
            controller.close()
          }
        }, 100)
      },
      cancel() {
        if (timer) clearInterval(timer)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': 'http://localhost:5173',
      },
    })
  }
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
bun run typecheck 2>&1 | grep RecordingController
```
Expected: no errors for RecordingController.ts

- [ ] **Step 2.3: Commit**

```bash
git add src/Modules/Recording/Presentation/Controllers/RecordingController.ts
git commit -m "feat: [proxy] add triggerAnalysis and streamAnalysis to RecordingController"
```

---

## Task 3: Register New Routes

**Files:**
- Modify: `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`

- [ ] **Step 3.1: Add two routes to the /api group**

In `src/Modules/Recording/Presentation/Routes/Recording.routes.ts`, add after line 24 (`r.get('/report/:id/:type', ...)`):

```ts
    r.post('/recordings/:id/analyze', (ctx) => controller.triggerAnalysis(ctx))
    r.get('/recordings/:id/analyze/stream', (ctx) => controller.streamAnalysis(ctx))
```

- [ ] **Step 3.2: Verify routes work with curl**

```bash
# Start dev server first: bun run dev &
curl -s -X POST http://localhost:3100/api/recordings/rec_1775403523902_302/analyze \
  -H 'Content-Type: application/json' \
  -d '{"type":"manifest"}' | python3 -m json.tool
```
Expected: `{"success": true, "data": {"jobId": "rec_1775403523902_302"}}`

```bash
curl -s -N http://localhost:3100/api/recordings/rec_1775403523902_302/analyze/stream
```
Expected: SSE events flowing — `event: progress`, then `event: done`

- [ ] **Step 3.3: Commit**

```bash
git add src/Modules/Recording/Presentation/Routes/Recording.routes.ts
git commit -m "feat: [proxy] register POST analyze + GET analyze/stream routes"
```

---

## Task 4: Frontend API Additions

**Files:**
- Modify: `web/src/api/dashboard.ts`

- [ ] **Step 4.1: Add runAnalysis and analyzeStreamUrl to dashboardApi**

In `web/src/api/dashboard.ts`, add after the `stopRecording` method (before the closing `}`):

```ts
  runAnalysis: (
    sessionId: string,
    type: 'manifest' | 'optimize',
  ): Promise<{ success: boolean; data?: { jobId: string }; error?: { code: string; message: string } }> =>
    fetch(`/api/recordings/${sessionId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).then((r) => r.json()),

  analyzeStreamUrl: (sessionId: string): string =>
    `/api/recordings/${sessionId}/analyze/stream`,
```

- [ ] **Step 4.2: Commit**

```bash
git add web/src/api/dashboard.ts
git commit -m "feat: [web] add runAnalysis and analyzeStreamUrl to dashboardApi"
```

---

## Task 5: ReportContent Component

Extract the report rendering from `ReportViewer.tsx` into a shared component so `SessionPage` can reuse it without duplicating JSX.

**Files:**
- Create: `web/src/components/Session/ReportContent.tsx`

- [ ] **Step 5.1: Create ReportContent**

```tsx
// web/src/components/Session/ReportContent.tsx
import type { OptimizationReportJson } from '@/api/dashboard'
import { FindingCard } from '@/components/Report/FindingCard'

interface Props {
  report: OptimizationReportJson
}

export function ReportContent({ report }: Props) {
  const hasFindings =
    (report.n1Findings?.length ?? 0) > 0 ||
    (report.indexGapFindings?.length ?? 0) > 0 ||
    (report.fragmentationFindings?.length ?? 0) > 0 ||
    (report.fullScanFindings?.length ?? 0) > 0

  return (
    <div className="space-y-8">
      {report.n1Findings && report.n1Findings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
            N+1 問題 ({report.n1Findings.length} 處)
          </h2>
          <div className="space-y-2">
            {report.n1Findings.map((f, i) => (
              <FindingCard
                key={i}
                severity="red"
                title={`${f.apiPath} — 重複 ${f.count} 次`}
                sql={f.sql}
                extraSql={f.batchSql}
                extraSqlLabel="建議批次查詢"
              />
            ))}
          </div>
        </section>
      )}

      {report.indexGapFindings && report.indexGapFindings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-3">
            索引缺失 ({report.indexGapFindings.length} 處)
          </h2>
          <div className="space-y-2">
            {report.indexGapFindings.map((f, i) => (
              <FindingCard
                key={i}
                severity="orange"
                title={`${f.table}.${f.column} 無索引`}
                sql={f.createIndexSql}
              />
            ))}
          </div>
        </section>
      )}

      {report.fragmentationFindings && report.fragmentationFindings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3">
            查詢碎片化 ({report.fragmentationFindings.length} 處)
          </h2>
          <div className="space-y-2">
            {report.fragmentationFindings.map((f, i) => (
              <FindingCard key={i} severity="yellow" title={`重複 ${f.count} 次`} sql={f.sql} />
            ))}
          </div>
        </section>
      )}

      {report.fullScanFindings && report.fullScanFindings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
            全表掃描 ({report.fullScanFindings.length} 處)
          </h2>
          <div className="space-y-2">
            {report.fullScanFindings.map((f, i) => (
              <FindingCard
                key={i}
                severity="red"
                title={`${f.table} 全表掃描`}
                sql={f.sql}
                extraSql={f.createIndexSql}
                extraSqlLabel="建議索引"
              />
            ))}
          </div>
        </section>
      )}

      {report.readWriteReport && report.readWriteReport.tables.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">
            讀寫比分析
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] text-muted uppercase">
                  <th className="px-4 py-2 text-left font-semibold">資料表</th>
                  <th className="px-4 py-2 text-right font-semibold">讀</th>
                  <th className="px-4 py-2 text-right font-semibold">寫</th>
                  <th className="px-4 py-2 text-right font-semibold">讀佔比</th>
                </tr>
              </thead>
              <tbody>
                {report.readWriteReport.tables.map((t, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2 font-mono">{t.table}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">{t.reads}</td>
                    <td className="px-4 py-2 text-right text-amber-400">{t.writes}</td>
                    <td className="px-4 py-2 text-right">{Math.round(t.readRatio * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!hasFindings && (
        <div className="text-center py-12 text-muted">
          <p className="text-sm">沒有發現效能問題</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Commit**

```bash
git add web/src/components/Session/ReportContent.tsx
git commit -m "feat: [web] extract ReportContent shared component from ReportViewer"
```

---

## Task 6: SessionHeader, AnalyzeActions, ProgressLog Components

**Files:**
- Create: `web/src/components/Session/SessionHeader.tsx`
- Create: `web/src/components/Session/AnalyzeActions.tsx`
- Create: `web/src/components/Session/ProgressLog.tsx`

- [ ] **Step 6.1: Create SessionHeader**

```tsx
// web/src/components/Session/SessionHeader.tsx
interface Props {
  sessionId: string
  startedAt: number
  status: 'recording' | 'stopped'
  totalQueries: number
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-TW', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function SessionHeader({ sessionId, startedAt, status, totalQueries }: Props) {
  return (
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'recording'
                ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(87,171,90,0.4)]'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
            {status === 'recording' ? 'Recording' : 'Stopped'}
          </span>
        </div>
        <h1 className="font-mono text-sm font-black text-text break-all">{sessionId}</h1>
        <p className="text-[10px] text-text-muted">
          {formatDate(startedAt)} &middot; {totalQueries} queries
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: Create AnalyzeActions**

```tsx
// web/src/components/Session/AnalyzeActions.tsx
interface Props {
  onRun: (type: 'manifest' | 'optimize') => void
  disabled?: boolean
}

export function AnalyzeActions({ onRun, disabled = false }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center text-text-muted text-[11px] font-bold uppercase tracking-widest">
        — No analysis yet —
      </div>

      <div className="grid grid-cols-1 gap-4">
        <button
          onClick={() => onRun('manifest')}
          disabled={disabled}
          className="w-full px-6 py-4 bg-panel border border-border hover:border-primary/50 hover:bg-primary/5 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed group cursor-pointer"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
            Manifest
          </div>
          <div className="text-[11px] text-text-muted">
            Operation manifest — chunk breakdown, table involvement, inferred relations
          </div>
        </button>

        <button
          onClick={() => onRun('optimize')}
          disabled={disabled}
          className="w-full px-6 py-4 bg-panel border border-border hover:border-warning/50 hover:bg-warning/5 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-warning mb-1">
            Optimization Report
          </div>
          <div className="text-[11px] text-text-muted">
            Layer 1 offline analysis — N+1, query fragmentation, read/write ratio
          </div>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.3: Create ProgressLog**

```tsx
// web/src/components/Session/ProgressLog.tsx
import { useEffect, useRef } from 'react'

interface Props {
  logs: string[]
  done: boolean
  error?: string
}

export function ProgressLog({ logs, done, error }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="bg-black/40 border border-border rounded-xl p-4 font-mono text-[11px] space-y-1 min-h-32 max-h-64 overflow-y-auto custom-scrollbar">
      <div className="text-primary/60 mb-2 text-[9px] uppercase tracking-widest">
        {'>> Analysis running...'}
      </div>
      {logs.map((log, i) => (
        <div key={i} className="text-text-dim">
          <span className="text-primary/40 mr-2">›</span>
          {log}
        </div>
      ))}
      {error && (
        <div className="text-red-400 mt-2">
          <span className="mr-2">✗</span>
          {error}
        </div>
      )}
      {done && !error && (
        <div className="text-success mt-2">
          <span className="mr-2">✓</span>
          Complete
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 6.4: Commit**

```bash
git add web/src/components/Session/SessionHeader.tsx \
        web/src/components/Session/AnalyzeActions.tsx \
        web/src/components/Session/ProgressLog.tsx
git commit -m "feat: [web] add SessionHeader, AnalyzeActions, ProgressLog components"
```

---

## Task 7: SessionPage

**Files:**
- Create: `web/src/pages/SessionPage.tsx`

- [ ] **Step 7.1: Create SessionPage**

```tsx
// web/src/pages/SessionPage.tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { dashboardApi } from '@/api/dashboard'
import type { OptimizationReportJson, SessionSummary } from '@/api/dashboard'
import { SessionHeader } from '@/components/Session/SessionHeader'
import { AnalyzeActions } from '@/components/Session/AnalyzeActions'
import { ProgressLog } from '@/components/Session/ProgressLog'
import { ReportContent } from '@/components/Session/ReportContent'

type PageState =
  | { kind: 'loading' }
  | { kind: 'idle'; session: SessionSummary }
  | { kind: 'analyzing'; session: SessionSummary; logs: string[] }
  | { kind: 'done'; session: SessionSummary; report: OptimizationReportJson; analysisType: 'manifest' | 'optimize' }
  | { kind: 'error'; session?: SessionSummary; message: string }
  | { kind: 'stream_error'; session: SessionSummary; logs: string[]; message: string }

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const esRef = useRef<EventSource | null>(null)

  // Load session and initial report on mount
  useEffect(() => {
    if (!sessionId) return

    dashboardApi.getSessions().then((sessions) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) {
        setState({ kind: 'error', message: `Session not found: ${sessionId}` })
        return
      }

      // Load most complete report if available
      if (session.hasOptimizationReport) {
        dashboardApi.getReport(sessionId, 'optimize').then((report) => {
          setState({ kind: 'done', session, report, analysisType: 'optimize' })
        }).catch(() => setState({ kind: 'idle', session }))
      } else if (session.hasManifest) {
        dashboardApi.getReport(sessionId, 'manifest').then((report) => {
          setState({ kind: 'done', session, report: report as OptimizationReportJson, analysisType: 'manifest' })
        }).catch(() => setState({ kind: 'idle', session }))
      } else {
        setState({ kind: 'idle', session })
      }
    }).catch(() => {
      setState({ kind: 'error', message: 'Failed to load sessions' })
    })

    return () => {
      esRef.current?.close()
    }
  }, [sessionId])

  const handleRun = async (type: 'manifest' | 'optimize') => {
    if (state.kind !== 'idle' && state.kind !== 'done' && state.kind !== 'stream_error') return
    const session = 'session' in state ? state.session : null
    if (!session || !sessionId) return

    const logs: string[] = []
    setState({ kind: 'analyzing', session, logs })

    const result = await dashboardApi.runAnalysis(sessionId, type)
    if (!result.success) {
      setState({ kind: 'stream_error', session, logs, message: result.error?.message ?? 'Failed to start analysis' })
      return
    }

    const es = new EventSource(dashboardApi.analyzeStreamUrl(sessionId))
    esRef.current = es

    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data) as { message: string }
        setState((prev) =>
          prev.kind === 'analyzing'
            ? { ...prev, logs: [...prev.logs, message] }
            : prev,
        )
      } catch {}
    })

    es.addEventListener('done', (e: MessageEvent) => {
      es.close()
      try {
        const { type: doneType } = JSON.parse(e.data) as { type: 'manifest' | 'optimize' }
        dashboardApi.getReport(sessionId, doneType === 'optimize' ? 'optimize' : 'manifest').then((report) => {
          setState({
            kind: 'done',
            session,
            report: report as OptimizationReportJson,
            analysisType: doneType,
          })
        }).catch(() => {
          setState({ kind: 'stream_error', session, logs, message: 'Analysis complete but report not found' })
        })
      } catch {}
    })

    es.addEventListener('error', (e: MessageEvent) => {
      es.close()
      try {
        const { message } = JSON.parse(e.data) as { message: string }
        setState({ kind: 'stream_error', session, logs, message })
      } catch {
        setState({ kind: 'stream_error', session, logs, message: 'Analysis failed' })
      }
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      es.close()
      setState((prev) =>
        prev.kind === 'analyzing'
          ? { kind: 'stream_error', session: prev.session, logs: prev.logs, message: 'Connection lost' }
          : prev,
      )
    }
  }

  const session = 'session' in state ? state.session : undefined

  return (
    <div className="min-h-screen bg-surface text-text font-sans">
      {/* Header bar */}
      <div className="sticky top-0 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between z-10">
        <button
          onClick={() => navigate('/')}
          className="text-muted hover:text-text transition-colors cursor-pointer text-sm"
        >
          ←
        </button>
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Session</span>
        {state.kind === 'done' && (
          <button
            onClick={() => setState({ kind: 'idle', session: state.session })}
            className="text-[10px] font-black text-text-muted hover:text-text uppercase tracking-widest cursor-pointer"
          >
            Re-analyze
          </button>
        )}
        {state.kind !== 'done' && <div className="w-20" />}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Loading */}
        {state.kind === 'loading' && (
          <div className="flex justify-center py-24">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Fatal error (session not found) */}
        {state.kind === 'error' && !session && (
          <div className="text-center py-24 space-y-3">
            <p className="text-muted text-sm">{state.message}</p>
            <button onClick={() => navigate('/')} className="text-xs text-primary underline cursor-pointer">
              ← 返回 Dashboard
            </button>
          </div>
        )}

        {/* Session found — show header + content */}
        {session && (
          <>
            <SessionHeader
              sessionId={session.id}
              startedAt={session.startedAt}
              status={session.status}
              totalQueries={session.stats.totalQueries}
            />

            {(state.kind === 'idle') && (
              <AnalyzeActions onRun={handleRun} />
            )}

            {state.kind === 'analyzing' && (
              <ProgressLog logs={state.logs} done={false} />
            )}

            {state.kind === 'stream_error' && (
              <div className="space-y-4">
                <ProgressLog logs={state.logs} done={false} error={state.message} />
                <button
                  onClick={() => setState({ kind: 'idle', session })}
                  className="text-[10px] font-black text-primary uppercase tracking-widest cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {state.kind === 'done' && (
              <ReportContent report={state.report} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7.2: Commit**

```bash
git add web/src/pages/SessionPage.tsx
git commit -m "feat: [web] add SessionPage with four-state machine and SSE analysis trigger"
```

---

## Task 8: Route Wiring + SessionList Update

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/components/Dashboard/SessionList.tsx`

- [ ] **Step 8.1: Add /session/:sessionId route and redirect /report/:sessionId in main.tsx**

In `web/src/main.tsx`, replace the entire file contents with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'
import ReviewPage from './pages/ReviewPage'
import SessionPage from './pages/SessionPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/report/:sessionId" element={<Navigate to="/session/:sessionId" replace />} />
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

Note: The `/report/:sessionId` redirect uses a static string — React Router will match the param but the `Navigate` target needs to use the actual param. Fix by wrapping in a small redirect component:

```tsx
// Replace the /report route with:
<Route path="/report/:sessionId" element={<ReportRedirect />} />
```

And add this component above the `createRoot` call:

```tsx
import { useParams } from 'react-router-dom'

function ReportRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <Navigate to={`/session/${sessionId}`} replace />
}
```

Full `main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'
import ReviewPage from './pages/ReviewPage'
import SessionPage from './pages/SessionPage'

function ReportRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <Navigate to={`/session/${sessionId}`} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/report/:sessionId" element={<ReportRedirect />} />
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 8.2: Update SessionList — all rows navigate to /session/:id**

In `web/src/components/Dashboard/SessionList.tsx`, find the `<tr>` element (around line 41) and replace:

```tsx
                <tr
                    key={session.id}
                    onClick={hasReport ? () => navigate(`/report/${session.id}`) : undefined}
                    className={`group transition-all ${hasReport ? 'cursor-pointer hover:bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
                  >
```

with:

```tsx
                  <tr
                    key={session.id}
                    onClick={() => navigate(`/session/${session.id}`)}
                    className="group transition-all cursor-pointer hover:bg-white/[0.04]"
                  >
```

Also remove the `const hasReport = ...` line since all rows are now always clickable, and update the session ID style to always use the `text-text group-hover:text-primary` styling:

```tsx
                        <span className="font-black transition-colors tracking-tight text-[13px] text-text group-hover:text-primary">
```

- [ ] **Step 8.3: Verify the full app builds**

```bash
cd web && bun run build 2>&1 | tail -20
```
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 8.4: Manual smoke test**

```bash
bun run dev:all
```

1. Open `http://localhost:5173`
2. Click any session row → navigates to `/session/:id`
3. If no report: see two analyze buttons
4. Click "Optimization Report" → progress log appears, then report renders
5. Click "Re-analyze" → returns to idle state with buttons
6. Navigate to `http://localhost:5173/report/:id` → redirects to `/session/:id`

- [ ] **Step 8.5: Commit**

```bash
git add web/src/main.tsx web/src/components/Dashboard/SessionList.tsx
git commit -m "feat: [web] wire /session/:id route and make all session list rows clickable"
```

---

## Self-Review

**Spec coverage:**
- ✅ `/session/:id` page as single entry point for all sessions
- ✅ All rows clickable → `/session/:id`
- ✅ `/report/:id` redirects to `/session/:id`
- ✅ Four-state machine (loading → idle → analyzing → done)
- ✅ SSE streaming via POST + GET stream endpoints
- ✅ `POST /api/recordings/:id/analyze` returning 202 / 409
- ✅ `GET /api/recordings/:id/analyze/stream` SSE events (progress, done, error)
- ✅ AnalysisService with onProgress callback
- ✅ Phase 1 only: manifest + optimize (no DDL/Explain/LLM)
- ✅ Error handling: session not found, analysis failed, SSE disconnect

**Placeholder scan:** None found. All code is complete.

**Type consistency:**
- `AnalysisType` defined in Task 1, used in Task 2 — ✅ matches
- `SessionSummary` from `@/api/dashboard` used in SessionPage — ✅ already defined
- `OptimizationReportJson` used in ReportContent and SessionPage — ✅ already defined
- `runAnalysis` signature in Task 1 matches usage in Task 2 — ✅ `(sessionId, type, onProgress, recordingsDir)`
- `dashboardApi.analyzeStreamUrl` returns `string` used as `EventSource` constructor arg in Task 7 — ✅
