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
