// web/src/components/Timeline/TimelinePanel.tsx
import { useEffect, useState } from 'react'
import { useRecordingStore } from '@/stores/recordingStore'
import { ChunkCard } from './ChunkCard'

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

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (sessions.length > 0 && !isOpen) {
      setIsOpen(true)
    }
  }, [sessions.length])

  if (sessions.length === 0) return null

  return (
    <div
      className={`fixed top-20 bottom-4 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl flex flex-col z-40 overflow-hidden transition-all duration-300 ${
        isOpen ? 'right-4 w-80' : 'right-4 w-10'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-3 left-3 text-muted hover:text-white transition-colors z-10 cursor-pointer"
        title={isOpen ? '收合時間線' : '展開時間線'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isOpen ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-dim uppercase tracking-wider ml-6">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Timeline
            </div>

            {/* Session selector */}
            <select
              value={selectedSessionId ?? ''}
              onChange={(e) => selectSession(e.target.value || null)}
              className="mt-2 w-full bg-surface/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">選擇 Session...</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 20)} — {s.stats.totalQueries} queries
                </option>
              ))}
            </select>
          </div>

          {/* Chunk list */}
          <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && selectedSessionId && chunks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 opacity-30">
                <p className="text-[11px] mt-2">無 chunk 資料</p>
              </div>
            )}

            {!loading &&
              chunks.map((chunk) => (
                <ChunkCard
                  key={chunk.id}
                  chunk={chunk}
                  isActive={activeChunkId === chunk.id}
                  onClick={() =>
                    setActiveChunk(activeChunkId === chunk.id ? null : chunk.id)
                  }
                />
              ))}
          </div>

          {/* Stats footer */}
          {selectedSessionId && chunks.length > 0 && (
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-muted font-mono flex justify-between">
              <span>{chunks.length} chunks</span>
              <span>
                {chunks.reduce((sum, c) => sum + c.queries.length, 0)} queries
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
