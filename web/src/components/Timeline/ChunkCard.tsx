// web/src/components/Timeline/ChunkCard.tsx
import { memo } from 'react'
import type { QueryChunk } from '@/api/recording'

interface ChunkCardProps {
  chunk: QueryChunk
  isActive: boolean
  onClick: () => void
}

/* ─── SVG Icons ─── */

const CompassIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  </svg>
)

const SendIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

const MousePointerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/>
  </svg>
)

const ActivityIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)

const BoxIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
  </svg>
)

const BookIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
  </svg>
)

const EditIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

const ACTION_ICONS: Record<string, React.ReactNode> = {
  navigate: <CompassIcon />,
  submit: <SendIcon />,
  click: <MousePointerIcon />,
  request: <ActivityIcon />,
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ChunkCardComponent({ chunk, isActive, onClick }: ChunkCardProps) {
  const duration = chunk.endTime - chunk.startTime
  const hasMarker = !!chunk.marker

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl px-4 py-3.5 mb-2 cursor-pointer transition-all duration-300 border active:scale-[0.97] ${
        isActive
          ? 'bg-primary/15 border-primary/40 shadow-glow'
          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10 hover:translate-x-1'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-500'}`}>
          {hasMarker
            ? ACTION_ICONS[chunk.marker!.action] ?? <CompassIcon />
            : <BoxIcon />}
        </div>
        <span className={`text-[11px] font-bold truncate flex-1 tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>
          {hasMarker ? chunk.marker!.url.replace(/^https?:\/\//, '') : chunk.tables.join(', ')}
        </span>
      </div>

      {/* Marker target */}
      {hasMarker && chunk.marker!.target && (
        <div className="text-[10px] text-slate-500 font-mono ml-8 mb-2 truncate bg-black/20 px-2 py-0.5 rounded-md border border-white/5">
          {chunk.marker!.target}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-4 ml-8 text-[9px] font-bold uppercase tracking-widest">
        <span className="text-slate-600 font-mono tracking-normal">{formatTime(chunk.startTime)}</span>
        <span className="text-slate-600">{chunk.queries.length} Qs</span>
        
        <div className="flex-1" />

        <span
          className={`px-2 py-0.5 rounded-lg font-black border transition-colors ${
            chunk.pattern === 'read'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
              : chunk.pattern === 'write'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/10'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/10'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {chunk.pattern === 'read' ? <BookIcon /> : chunk.pattern === 'write' ? <EditIcon /> : null}
            {chunk.pattern}
          </div>
        </span>
      </div>
    </button>
  )
}

export const ChunkCard = memo(ChunkCardComponent)
