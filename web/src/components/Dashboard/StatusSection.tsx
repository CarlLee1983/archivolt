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
    <div className="space-y-3">
      <div className="flex items-center justify-between group">
        <div className="flex items-center gap-4">
          <div className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest border transition-all ${
            running ? 'bg-success/10 text-success border-success/30' : 'bg-slate-800/50 text-slate-600 border-slate-700'
          }`}>
            {running ? 'ACTIVE' : 'OFFLINE'}
          </div>
          <span className="text-[13px] font-black text-text-bright tracking-tight uppercase">{label}</span>
        </div>
        {running && (
          <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] text-success font-mono font-bold uppercase tracking-[0.2em]">Signal_OK</span>
            <div className="w-1 h-1 rounded-full bg-success animate-pulse" />
          </div>
        )}
      </div>
      
      <div className="pl-6 border-l-2 border-border py-1 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-text-muted w-20 shrink-0 tracking-widest uppercase">Endpoint:</span>
          <span className={`text-[13px] font-mono font-bold ${running ? 'text-primary' : 'text-text-muted'}`}>
            {running ? detail : '0.0.0.0:NULL'}
          </span>
        </div>
        {extra && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-text-muted w-20 shrink-0 tracking-widest uppercase">Metrics:</span>
            <span className="text-[12px] font-mono text-warning font-bold tracking-tight opacity-90">{extra}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function StatusSection({ status, liveStats }: Props) {
  const db = status?.proxy.db
  const http = status?.proxy.http

  const dbDetail = db?.running
    ? `localhost:${db.port} [${db.protocol ?? 'mysql'}]`
    : 'service_terminated'
  const dbExtra = liveStats
    ? `${liveStats.db.qps} QPS // ${liveStats.db.totalQueries} REQ_TOTAL`
    : undefined

  const httpDetail = http?.running
    ? `localhost:${http.port} -> ${http.target ?? '?'}`
    : 'service_idle'
  const httpExtra = liveStats?.http
    ? `${liveStats.http.totalChunks} LOG_CHUNKS_CAPTURED`
    : undefined

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
      <ProxyCard
        label="Database_Network_Layer"
        running={db?.running ?? false}
        detail={dbDetail}
        extra={dbExtra}
      />
      <ProxyCard
        label="Traffic_Control_Interceptor"
        running={http?.running ?? false}
        detail={httpDetail}
        extra={httpExtra}
      />
    </div>
  )
}
