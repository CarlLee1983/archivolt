import { useEffect, useRef } from 'react'

interface Props {
  logs: string[]
  done: boolean
  error?: string
}

export function ProgressLog({ logs, done, error }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="bg-black/40 border border-border rounded-xl p-4 font-mono text-[11px] space-y-1 min-h-32 max-h-64 overflow-y-auto custom-scrollbar">
      <div className="text-primary/60 mb-2 text-[9px] uppercase tracking-widest">
        {'>> Analysis running...'}
      </div>
      {logs.map((log, i) => (
        <div key={i} className="text-text-dim">
          <span className="text-primary/40 mr-2">›</span>
          {log}
        </div>
      ))}
      {error && (
        <div className="text-red-400 mt-2">
          <span className="mr-2">✗</span>
          {error}
        </div>
      )}
      {done && !error && (
        <div className="text-success mt-2">
          <span className="mr-2">✓</span>
          Complete
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
