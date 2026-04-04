import { useNavigate } from 'react-router-dom'
import type { SessionSummary } from '@/api/dashboard'

interface Props {
  sessions: SessionSummary[]
  loading: boolean
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SessionList({ sessions, loading }: Props) {
  const navigate = useNavigate()
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10)

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">
        最近 Session
        {loading && <span className="ml-2 text-primary animate-pulse">·</span>}
      </h2>

      {sorted.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-xs text-muted">尚無錄製紀錄</p>
          <p className="text-[10px] text-muted/60 mt-1">執行 archivolt record start --target localhost:3306 開始錄製</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 ${
                    session.status === 'recording'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-muted border border-white/10'
                  }`}>
                    {session.status === 'recording' ? '● 錄製中' : '停止'}
                  </span>
                  <span className="text-[10px] font-mono text-muted truncate">{session.id}</span>
                </div>
                <div className="text-[10px] text-muted">
                  {formatDate(session.startedAt)}
                  {' · '}
                  {session.stats.totalQueries} queries
                  {session.httpChunkCount > 0 && ` · ${session.httpChunkCount} HTTP chunks`}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {(session.hasManifest || session.hasOptimizationReport) ? (
                  <button
                    onClick={() => navigate(`/report/${session.id}`)}
                    className="text-[10px] px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors cursor-pointer"
                  >
                    查看報告
                  </button>
                ) : (
                  <span className="text-[10px] text-muted/50 px-2">尚未分析</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
