import type { SystemStatus, LiveStats } from '@/api/dashboard'

interface Props {
  status: SystemStatus | null
  liveStats: LiveStats | null
}

function ProxyCard({
  label,
  running,
  detail,
  extra,
}: {
  label: string
  running: boolean
  detail: string
  extra?: string
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
      running
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        : 'bg-white/5 border-white/10 text-muted'
    }`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${running ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-xs font-mono truncate">{detail}</div>
      </div>
      {extra && <div className="text-[10px] font-mono text-right opacity-70 flex-shrink-0">{extra}</div>}
    </div>
  )
}

export function StatusSection({ status, liveStats }: Props) {
  const db = status?.proxy.db
  const http = status?.proxy.http

  const dbDetail = db?.running
    ? `Port ${db.port}${db.protocol ? ` · ${db.protocol}` : ''}`
    : '未運行'
  const dbExtra = liveStats
    ? `${liveStats.db.qps} QPS · ${liveStats.db.totalQueries} queries`
    : undefined

  const httpDetail = http?.running
    ? `Port ${http.port} → ${http.target ?? '?'}`
    : '未啟動（選用）'
  const httpExtra = liveStats?.http
    ? `${liveStats.http.totalChunks} chunks`
    : undefined

  return (
    <section className="backdrop-blur-md border border-white/10 shadow-glass rounded-2xl p-5">
      <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">系統狀態</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProxyCard
          label="DB Proxy"
          running={db?.running ?? false}
          detail={dbDetail}
          extra={dbExtra}
        />
        <ProxyCard
          label="HTTP Proxy"
          running={http?.running ?? false}
          detail={httpDetail}
          extra={httpExtra}
        />
      </div>
    </section>
  )
}
