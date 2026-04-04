import { useNavigate } from 'react-router-dom'
import type { SystemStatus, SessionSummary } from '@/api/dashboard'

interface Props {
  status: SystemStatus | null
  sessions: SessionSummary[]
}

interface Stage {
  label: string
  done: boolean
  active: boolean
  hint: string
}

export function WorkflowSection({ status, sessions }: Props) {
  const navigate = useNavigate()
  const schemaLoaded = status?.schema.loaded ?? false
  const hasGroups = status?.schema.hasGroups ?? false
  const isRecording = status?.proxy.db.running ?? false
  const hasSessions = sessions.length > 0
  const hasAnalysis = sessions.some((s) => s.hasManifest || s.hasOptimizationReport)

  const stages: Stage[] = [
    { label: '提取 Schema', done: schemaLoaded, active: !schemaLoaded, hint: 'dbcli schema --format json > db.json && archivolt --input db.json' },
    { label: '整理視覺化', done: hasGroups, active: schemaLoaded && !hasGroups, hint: '前往 Canvas 分組' },
    { label: '錄製查詢', done: hasSessions, active: schemaLoaded && !hasSessions, hint: 'archivolt record start --target localhost:3306' },
    { label: '執行分析', done: hasAnalysis, active: hasSessions && !hasAnalysis, hint: 'archivolt analyze <session-id>' },
    { label: '匯出', done: false, active: hasAnalysis, hint: 'archivolt export prisma' },
  ]

  const nextStage = stages.find((s) => s.active && !s.done)

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">工作流程</h2>
      <div className="flex items-center gap-1.5 flex-wrap">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              stage.done
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : stage.active
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-white/5 text-muted border-white/5'
            }`}>
              <span className="text-[10px]">{stage.done ? '✓' : `${i + 1}`}</span>
              <span>{stage.label}</span>
            </div>
            {i < stages.length - 1 && <span className="text-white/20 text-xs">→</span>}
          </div>
        ))}
      </div>

      {nextStage && (
        <div className="mt-4 flex items-center gap-3">
          {nextStage.label === '整理視覺化' ? (
            <button
              onClick={() => navigate('/canvas')}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              前往 Canvas →
            </button>
          ) : (
            <code className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-text-dim">
              {nextStage.hint}
            </code>
          )}
        </div>
      )}

      {isRecording && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          錄製進行中 — 完成後執行 archivolt analyze
        </div>
      )}
    </section>
  )
}
