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

  useEffect(() => {
    if (!sessionId) return

    dashboardApi.getSessions().then((sessions) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) {
        setState({ kind: 'error', message: `Session not found: ${sessionId}` })
        return
      }

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

    esRef.current?.close()
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
      } catch { /* ignore parse errors */ }
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
      } catch { /* ignore parse errors */ }
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
        {state.kind === 'loading' && (
          <div className="flex justify-center py-24">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state.kind === 'error' && !session && (
          <div className="text-center py-24 space-y-3">
            <p className="text-muted text-sm">{state.message}</p>
            <button onClick={() => navigate('/')} className="text-xs text-primary underline cursor-pointer">
              ← 返回 Dashboard
            </button>
          </div>
        )}

        {session && (
          <>
            <SessionHeader
              sessionId={session.id}
              startedAt={session.startedAt}
              endedAt={session.endedAt}
              status={session.status}
              totalQueries={session.stats.totalQueries}
              httpChunkCount={session.httpChunkCount}
              byOperation={session.stats.byOperation}
            />

            {state.kind === 'idle' && (
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
