import { useNavigate } from 'react-router-dom'
import type { SessionSummary } from '@/api/dashboard'

interface Props {
  sessions: SessionSummary[]
  loading: boolean
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).toUpperCase().replace(',', '')
}

export function SessionList({ sessions, loading }: Props) {
  const navigate = useNavigate()
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 15)

  return (
    <div className="bg-card font-mono text-xs h-full flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="py-32 text-center opacity-20 italic font-bold tracking-widest text-sm">
            -- NO_LOG_ENTRIES_FOUND --
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-text-muted border-b-2 border-border text-left uppercase font-black tracking-[0.2em] bg-panel/30">
                <th className="px-6 py-4 font-black w-16 text-center">st</th>
                <th className="px-6 py-4 font-black">log_identifier</th>
                <th className="px-6 py-4 font-black text-right">telemetry</th>
                <th className="px-6 py-4 font-black text-right">command</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((session) => (
                <tr key={session.id} className="group hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-5 text-center">
                    <div className={`w-2 h-2 rounded-full mx-auto shadow-sm ${
                      session.status === 'recording' ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(87,171,90,0.4)]' : 'bg-slate-800'
                    }`} />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-text font-black group-hover:text-primary transition-colors tracking-tight text-[13px]">{session.id.slice(0, 32)}</span>
                      <span className="text-text-muted text-[10px] font-bold tracking-widest">{formatDate(session.startedAt)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-bold text-text-dim">
                    <div className="flex flex-col gap-1">
                      <span className="text-warning opacity-90 text-[13px]">{session.stats.totalQueries} <span className="text-[9px] font-black uppercase opacity-40">Queries</span></span>
                      <span className="text-[10px] text-text-muted font-black uppercase">{session.httpChunkCount} <span className="opacity-40 text-[8px]">Chunks</span></span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    {(session.hasManifest || session.hasOptimizationReport) ? (
                      <button
                        onClick={() => navigate(`/report/${session.id}`)}
                        className="px-4 py-1.5 bg-panel border border-border text-text-dim hover:text-primary hover:border-primary font-black cursor-pointer rounded transition-all active:scale-90 text-[10px] uppercase tracking-widest"
                      >
                        Open_Rep
                      </button>
                    ) : (
                      <span className="text-text-muted opacity-20 font-black text-[10px] tracking-widest pr-4 uppercase">No_Data</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {loading && (
        <div className="px-6 py-3 bg-panel border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-primary font-black animate-pulse tracking-[0.3em]">
            {">>"} TAILING_REMOTE_LOG_STREAM...
          </span>
          <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[scanning_1.5s_linear_infinite]" />
          </div>
        </div>
      )}
    </div>
  )
}
