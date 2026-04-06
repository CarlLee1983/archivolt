import { useState } from 'react'

interface Props {
  severity: 'red' | 'orange' | 'yellow' | 'blue'
  title: string
  subtitle?: string
  sql?: string
  extraSql?: string
  extraSqlLabel?: string
}

const severityStyles: Record<Props['severity'], string> = {
  red: 'border-red-500/20 bg-red-500/5 text-red-300 hover:border-red-500/30',
  orange: 'border-orange-500/20 bg-orange-500/5 text-orange-300 hover:border-orange-500/30',
  yellow: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300 hover:border-yellow-500/30',
  blue: 'border-blue-500/20 bg-blue-500/5 text-blue-300 hover:border-blue-500/30',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[9px] px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-muted hover:text-text transition-colors cursor-pointer flex-shrink-0"
    >
      {copied ? '✓ 已複製' : '複製 SQL'}
    </button>
  )
}

export function FindingCard({ severity, title, subtitle, sql, extraSql, extraSqlLabel }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rounded-xl border p-4 cursor-pointer transition-colors ${severityStyles[severity]}`}
      onClick={() => setExpanded((e) => !e)}
      onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">{title}</div>
          {subtitle && <div className="text-[10px] opacity-70 mt-0.5">{subtitle}</div>}
        </div>
        <span className="text-[10px] opacity-50 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          {sql && (
            <div>
              <div className="flex items-start gap-2">
                <pre className="flex-1 text-[10px] font-mono bg-black/20 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all min-w-0">{sql}</pre>
                <CopyButton text={sql} />
              </div>
            </div>
          )}
          {extraSql && (
            <div>
              <div className="text-[9px] text-muted uppercase font-bold mb-1">{extraSqlLabel ?? '建議 SQL'}</div>
              <div className="flex items-start gap-2">
                <pre className="flex-1 text-[10px] font-mono bg-black/20 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all min-w-0">{extraSql}</pre>
                <CopyButton text={extraSql} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
