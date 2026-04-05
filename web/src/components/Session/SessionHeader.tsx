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
