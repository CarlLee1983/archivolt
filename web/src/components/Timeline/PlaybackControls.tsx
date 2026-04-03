// web/src/components/Timeline/PlaybackControls.tsx
import { useRecordingStore } from '@/stores/recordingStore'

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export function PlaybackControls() {
  const {
    chunks,
    activeChunkId,
    playing,
    playbackSpeed,
    play,
    pause,
    stepPrev,
    stepNext,
    setPlaybackSpeed,
    autoFocus,
    toggleAutoFocus,
  } = useRecordingStore()

  if (chunks.length === 0) return null

  const currentIndex = activeChunkId
    ? chunks.findIndex((c) => c.id === activeChunkId)
    : -1
  const isAtStart = currentIndex <= 0
  const isAtEnd = currentIndex >= chunks.length - 1

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
      {/* Prev */}
      <button
        onClick={stepPrev}
        disabled={isAtStart && !playing}
        className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"
        title="上一步"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      {/* Play / Pause */}
      <button
        onClick={playing ? pause : play}
        className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors cursor-pointer"
        title={playing ? '暫停' : '播放'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Next */}
      <button
        onClick={stepNext}
        disabled={isAtEnd && !playing}
        className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"
        title="下一步"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M16 6h2v12h-2zM4 18l8.5-6L4 6z" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Auto-focus toggle */}
      <button
        onClick={toggleAutoFocus}
        className={`p-1 rounded transition-colors cursor-pointer ${
          autoFocus ? 'text-primary' : 'text-muted hover:text-text-dim'
        }`}
        title={autoFocus ? '自動聚焦：開' : '自動聚焦：關'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      </button>

      {/* Position indicator */}
      {activeChunkId && (
        <span className="text-[9px] font-mono text-muted tabular-nums">
          {currentIndex + 1}/{chunks.length}
        </span>
      )}

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
              playbackSpeed === speed
                ? 'bg-primary/20 text-primary'
                : 'text-muted hover:text-text-dim'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  )
}
