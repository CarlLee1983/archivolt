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
    { label: 'SCHEMA_INGEST', done: schemaLoaded, active: !schemaLoaded, hint: 'dbcli schema --format json > db.json' },
    { label: 'VISUAL_LAYOUT', done: hasGroups, active: schemaLoaded && !hasGroups, hint: 'ORGANIZE_TABLE_GROUPS' },
    { label: 'QUERY_RECORD', done: hasSessions, active: schemaLoaded && !hasSessions, hint: 'archivolt record start' },
    { label: 'DATA_ANALYSIS', done: hasAnalysis, active: hasSessions && !hasAnalysis, hint: 'archivolt analyze <sid>' },
    { label: 'ASSET_EXPORT', done: false, active: hasAnalysis, hint: 'archivolt export prisma' },
  ]

  const nextStage = stages.find((s) => s.active && !s.done)

  return (
    <div className="bg-card font-mono text-[13px] divide-y-2 divide-border">
      {stages.map((stage, i) => (
        <div key={i} className="flex items-center group hover:bg-white/[0.01] transition-colors">
          <div className="w-16 py-5 text-right pr-6 text-text-muted select-none font-black opacity-30 group-hover:opacity-60 transition-opacity">{(i + 1).toString().padStart(2, '0')}</div>
          <div className="flex-1 py-5 px-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className={`text-sm font-black tracking-tight ${
                stage.done ? 'text-success' : stage.active ? 'text-primary' : 'text-text-muted'
              }`}>
                {stage.label.padEnd(18, '_')}
              </span>
              <span className={`px-3 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.2em] border transition-all ${
                stage.done 
                  ? 'bg-success/5 text-success border-success/20' 
                  : stage.active 
                    ? 'bg-primary/5 text-primary border-primary/20 shadow-[0_0_15px_rgba(83,155,245,0.1)]' 
                    : 'bg-transparent text-text-muted border-slate-800 opacity-30'
              }`}>
                {stage.done ? 'COMPLETED' : stage.active ? 'AWAITING' : 'LOCKED'}
              </span>
            </div>
            
            {stage.active && (
              <div className="flex items-center gap-6">
                {stage.label === 'VISUAL_LAYOUT' ? (
                  <button 
                    onClick={() => navigate('/canvas')}
                    className="px-4 py-1 bg-primary text-surface text-[10px] font-black rounded hover:bg-blue-400 transition-all cursor-pointer shadow-lg shadow-blue-900/20 uppercase tracking-widest"
                  >
                    RUN_UI {"→"}
                  </button>
                ) : (
                  <span className="text-text-muted font-bold italic opacity-40 text-[10px] uppercase tracking-widest">Protocol_Pending</span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Footer / Console Command Area */}
      <div className="py-8 px-16 bg-panel/20">
        <div className="flex items-start gap-6">
          <span className="text-primary font-black text-xl leading-none pt-1">❯</span>
          {nextStage ? (
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3">
                <span className="text-text font-bold">Recommended action protocol:</span>
                <span className="px-2 py-0.5 bg-warning/10 text-warning text-[9px] font-black rounded border border-warning/20 tracking-widest uppercase">Critical</span>
              </div>
              <div className="relative group max-w-2xl">
                <div className="absolute -inset-1 bg-primary/5 rounded-lg blur-sm opacity-40 group-hover:opacity-100 transition-all" />
                <code className="relative block px-6 py-4 bg-black border border-border text-sm font-mono text-primary/90 shadow-inner">
                  <span className="text-text-muted mr-4 opacity-50">$</span> {nextStage.hint}
                  <span className="w-2.5 h-5 bg-primary inline-block align-middle ml-2 animate-[blink_1s_step-end_infinite]" />
                </code>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 py-2 opacity-80">
              <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_10px_#57ab5a]" />
              <span className="text-success font-black tracking-[0.2em] text-[11px] uppercase">Environment_Synchronization_Nominal</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 
          from, to { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
