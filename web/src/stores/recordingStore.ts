// web/src/stores/recordingStore.ts
import { create } from 'zustand'
import { recordingApi, type RecordingSession, type QueryChunk } from '@/api/recording'

interface RecordingState {
  sessions: RecordingSession[]
  selectedSessionId: string | null
  chunks: QueryChunk[]
  activeChunkId: string | null
  loading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  selectSession: (sessionId: string | null) => Promise<void>
  setActiveChunk: (chunkId: string | null) => void
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  chunks: [],
  activeChunkId: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    try {
      const sessions = await recordingApi.listSessions()
      set({ sessions })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  selectSession: async (sessionId) => {
    if (!sessionId) {
      set({ selectedSessionId: null, chunks: [], activeChunkId: null })
      return
    }
    set({ selectedSessionId: sessionId, loading: true, error: null })
    try {
      const { chunks } = await recordingApi.getChunks(sessionId)
      set({ chunks, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  setActiveChunk: (chunkId) => set({ activeChunkId: chunkId }),
}))

/** Get the tables involved in the active chunk */
export function getActiveChunkTables(state: RecordingState): Set<string> | null {
  const { activeChunkId, chunks } = state
  if (!activeChunkId) return null
  const chunk = chunks.find((c) => c.id === activeChunkId)
  if (!chunk) return null
  return new Set(chunk.tables)
}
