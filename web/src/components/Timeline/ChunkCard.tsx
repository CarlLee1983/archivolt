// web/src/components/Timeline/ChunkCard.tsx
import { memo } from 'react'
import type { QueryChunk } from '@/api/recording'

interface ChunkCardProps {
  chunk: QueryChunk
  isActive: boolean
  onClick: () => void
}

const ACTION_ICONS: Record<string, string> = {
  navigate: '🧭',
  submit: '📤',
  click: '👆',
  request: '📡',
}

const PATTERN_ICONS: Record<string, string> = {
  read: '📖',
  write: '✏️',
  mixed: '🔀',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function ChunkCardComponent({ chunk, isActive, onClick }: ChunkCardProps) {
  const duration = chunk.endTime - chunk.startTime
  const hasMarker = !!chunk.marker

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-3 py-2.5 mb-1.5 cursor-pointer transition-all duration-200 border ${
        isActive
          ? 'bg-primary/20 border-primary/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
          : 'border-white/5 hover:bg-white/5 hover:border-white/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">
          {hasMarker
            ? ACTION_ICONS[chunk.marker!.action] ?? '📍'
            : PATTERN_ICONS[chunk.pattern] ?? '📦'}
        </span>
        <span className="text-xs font-medium text-text truncate flex-1">
          {hasMarker ? chunk.marker!.url : chunk.tables.join(', ')}
        </span>
      </div>

      {/* Marker target */}
      {hasMarker && chunk.marker!.target && (
        <div className="text-[10px] text-muted font-mono ml-6 mb-1 truncate">
          {chunk.marker!.target}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-3 ml-6 text-[10px] text-muted">
        <span className="font-mono">{formatTime(chunk.startTime)}</span>
        <span>{chunk.queries.length} queries</span>
        {duration > 0 && <span>{duration}ms</span>}
        <span
          className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
            chunk.pattern === 'read'
              ? 'bg-emerald-500/10 text-emerald-400'
              : chunk.pattern === 'write'
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-purple-500/10 text-purple-400'
          }`}
        >
          {chunk.pattern}
        </span>
      </div>
    </button>
  )
}

export const ChunkCard = memo(ChunkCardComponent)
