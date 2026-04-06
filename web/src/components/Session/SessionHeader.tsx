interface Props {
  sessionId: string
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopped'
  totalQueries: number
  httpChunkCount: number
  byOperation: Record<string, number>
}

function formatTimeRange(startedAt: number, endedAt?: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString('zh-TW', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  if (endedAt) return `${fmt(startedAt)} → ${fmt(endedAt).slice(-5)}`
  return fmt(startedAt)
}

function formatDuration(startedAt: number, endedAt: number): string {
  const secs = Math.floor((endedAt - startedAt) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

const OP_COLORS: Record<string, string> = {
  SELECT: 'bg-primary',
  INSERT: 'bg-success',
  UPDATE: 'bg-warning',
  DELETE: 'bg-error',
}

const OP_TEXT_COLORS: Record<string, string> = {
  SELECT: 'text-primary',
  INSERT: 'text-success',
  UPDATE: 'text-warning',
  DELETE: 'text-error',
}

export function SessionHeader({
  sessionId,
  startedAt,
  endedAt,
  status,
  totalQueries,
  httpChunkCount,
  byOperation,
}: Props) {
  const duration = endedAt ? formatDuration(startedAt, endedAt) : null
  const qps =
    endedAt && endedAt > startedAt
      ? (totalQueries / ((endedAt - startedAt) / 1000)).toFixed(2)
      : null

  // Normalise operation keys to uppercase; group unknowns as OTHER
  const known = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  const opEntries: { op: string; count: number }[] = []
  let otherCount = 0
  for (const [op, count] of Object.entries(byOperation)) {
    if (known.includes(op.toUpperCase())) {
      opEntries.push({ op: op.toUpperCase(), count })
    } else {
      otherCount += count
    }
  }
  // Sort by known order
  opEntries.sort((a, b) => known.indexOf(a.op) - known.indexOf(b.op))
  if (otherCount > 0) opEntries.push({ op: 'OTHER', count: otherCount })

  const hasOps = opEntries.length > 0 && totalQueries > 0

  return (
    <div className="border border-border rounded-xl p-4 space-y-4">
      {/* Top: identity + stats grid */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === 'recording'
                  ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(87,171,90,0.4)]'
                  : 'bg-slate-600'
              }`}
            />
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">
              {status === 'recording' ? 'Recording' : 'Stopped'}
            </span>
          </div>
          <h1 className="font-mono text-sm font-black text-text break-all">{sessionId}</h1>
          <p className="text-[10px] text-text-muted font-mono">
            {formatTimeRange(startedAt, endedAt)}
          </p>
        </div>

        {/* Right: stats grid — 2×2 when endedAt present, 1×2 otherwise */}
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
          <StatCell label="QUERIES" value={totalQueries.toLocaleString()} color="text-warning" />
          <StatCell label="HTTP" value={`${httpChunkCount}c`} />
          {duration && <StatCell label="DURATION" value={duration} />}
          {qps && <StatCell label="QPS AVG" value={qps} />}
        </div>
      </div>

      {/* Op Distribution */}
      {hasOps && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
            Op Distribution
          </p>
          {opEntries.map(({ op, count }) => {
            const pct = Math.round((count / totalQueries) * 100)
            const barColor = OP_COLORS[op] ?? 'bg-slate-600'
            const textColor = OP_TEXT_COLORS[op] ?? 'text-muted'
            return (
              <div key={op} className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted w-11 text-right uppercase">
                  {op}
                </span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`font-mono text-[9px] font-black w-14 ${textColor}`}>
                  {count.toLocaleString()} · {pct}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCell({
  label,
  value,
  color = 'text-text',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-panel border border-border rounded px-2.5 py-1.5 min-w-[60px]">
      <p className="text-[8px] font-mono text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`font-mono font-black text-base leading-tight ${color}`}>{value}</p>
    </div>
  )
}
