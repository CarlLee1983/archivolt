// web/src/components/Timeline/TimelinePanel.tsx
import { useEffect, useRef, useState } from 'react'
import { useRecordingStore } from '@/stores/recordingStore'
import { ChunkCard } from './ChunkCard'
import { PlaybackControls } from './PlaybackControls'

export function TimelinePanel() {
  const {
    sessions,
    selectedSessionId,
    chunks,
    activeChunkId,
    loading,
    fetchSessions,
    selectSession,
    setActiveChunk,
  } = useRecordingStore()

  const [isOpen, setIsOpen] = useState(false)
  const chunkListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (sessions.length > 0 && !isOpen) {
      setIsOpen(true)
    }
  }, [sessions.length])

  // Auto-scroll to active chunk during playback
  useEffect(() => {
    if (!activeChunkId || !chunkListRef.current) return
    const activeEl = chunkListRef.current.querySelector(`[data-chunk-id="${activeChunkId}"]`)
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeChunkId])

  // Cleanup playback timer on unmount
  const pause = useRecordingStore((s) => s.pause)
  useEffect(() => {
    return () => pause()
  }, [pause])

  if (sessions.length === 0) return null

  return (
    <div
      className={`fixed top-24 bottom-6 depth-card flex flex-col z-40 overflow-hidden transition-all duration-500 shadow-heavy ${
        isOpen ? 'right-4 w-80 translate-x-0 opacity-100' : 'right-4 w-12 translate-x-2 opacity-80'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-4 left-3 text-muted hover:text-primary transition-all z-10 cursor-pointer active:scale-90"
        title={isOpen ? '收合時間線' : '展開時間線'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-500 ${isOpen ? 'rotate-0' : 'rotate-180'}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {isOpen && (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 space-y-4">
            <div className="flex items-center gap-3 text-[10px] font-black text-primary uppercase tracking-[0.3em] ml-6">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Timeline
            </div>

            {/* Session selector - Bento style */}
            <div className="relative group">
              <select
                value={selectedSessionId ?? ''}
                onChange={(e) => selectSession(e.target.value || null)}
                className="w-full bg-black/40 border border-white/5 rounded-xl pl-4 pr-10 py-2.5 text-xs font-mono font-bold text-slate-300 focus:outline-none focus:border-primary/50 transition-all appearance-none shadow-inner cursor-pointer"
              >
                <option value="">Select Session...</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id.slice(0, 8)}... — {s.stats.totalQueries} Qs
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-primary transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="px-4 py-2">
            <PlaybackControls />
          </div>

          {/* Chunk list */}
          <div ref={chunkListRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 scroll-smooth">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Loading Chunks</p>
              </div>
            )}

            {!loading && selectedSessionId && chunks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 opacity-20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-[10px] font-black uppercase tracking-widest mt-3">No Data</p>
              </div>
            )}

            {!loading &&
              chunks.map((chunk) => (
                <div key={chunk.id} data-chunk-id={chunk.id}>
                  <ChunkCard
                    chunk={chunk}
                    isActive={activeChunkId === chunk.id}
                    onClick={() =>
                      setActiveChunk(activeChunkId === chunk.id ? null : chunk.id)
                    }
                  />
                </div>
              ))}
          </div>

          {/* Stats footer */}
          {selectedSessionId && chunks.length > 0 && (
            <div className="px-6 py-3 border-t border-white/5 bg-white/[0.01] text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] flex justify-between">
              <span className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-slate-700"/> {chunks.length} CHUNKS</span>
              <span>
                {chunks.reduce((sum, c) => sum + c.queries.length, 0)} QUERIES
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
