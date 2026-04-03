// web/src/stores/recordingStore.ts
import { create } from 'zustand'
import { recordingApi, type RecordingSession, type QueryChunk } from '@/api/recording'
import { computeDelays } from './playbackUtils'

type PlaybackSpeed = 0.5 | 1 | 2 | 4

interface RecordingState {
  // Existing
  sessions: RecordingSession[]
  selectedSessionId: string | null
  chunks: QueryChunk[]
  activeChunkId: string | null
  loading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  selectSession: (sessionId: string | null) => Promise<void>
  setActiveChunk: (chunkId: string | null) => void

  // Playback
  playing: boolean
  playbackSpeed: PlaybackSpeed
  playbackTimerId: ReturnType<typeof setTimeout> | null
  autoFocus: boolean
  toggleAutoFocus: () => void
  play: () => void
  pause: () => void
  stepNext: () => void
  stepPrev: () => void
  setPlaybackSpeed: (speed: PlaybackSpeed) => void
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  // ── Existing state ──
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
    const { pause } = get()
    pause()
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

  // ── Playback state ──
  playing: false,
  playbackSpeed: 1,
  playbackTimerId: null,
  autoFocus: true,
  toggleAutoFocus: () => set((s) => ({ autoFocus: !s.autoFocus })),

  play: () => {
    const { chunks, activeChunkId, playing, playbackSpeed } = get()
    if (playing || chunks.length === 0) return

    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const startIndex = currentIndex >= chunks.length - 1 ? 0 : currentIndex

    set({ playing: true, activeChunkId: chunks[startIndex >= 0 ? startIndex : 0].id })

    function scheduleNext(index: number): void {
      const state = get()
      if (!state.playing || index >= state.chunks.length - 1) {
        set({ playing: false, playbackTimerId: null })
        return
      }
      const delays = computeDelays(state.chunks, state.playbackSpeed)
      const timerId = setTimeout(() => {
        const latest = get()
        if (!latest.playing) return
        const nextIndex = index + 1
        set({ activeChunkId: latest.chunks[nextIndex].id })
        scheduleNext(nextIndex)
      }, delays[index])
      set({ playbackTimerId: timerId })
    }

    scheduleNext(startIndex >= 0 ? startIndex : 0)
  },

  pause: () => {
    const { playbackTimerId } = get()
    if (playbackTimerId) clearTimeout(playbackTimerId)
    set({ playing: false, playbackTimerId: null })
  },

  stepNext: () => {
    const { chunks, activeChunkId, pause: pauseFn } = get()
    pauseFn()
    if (chunks.length === 0) return
    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const nextIndex = Math.min(currentIndex + 1, chunks.length - 1)
    set({ activeChunkId: chunks[nextIndex].id })
  },

  stepPrev: () => {
    const { chunks, activeChunkId, pause: pauseFn } = get()
    pauseFn()
    if (chunks.length === 0) return
    const currentIndex = activeChunkId
      ? chunks.findIndex((c) => c.id === activeChunkId)
      : -1
    const prevIndex = Math.max(currentIndex - 1, 0)
    set({ activeChunkId: chunks[prevIndex].id })
  },

  setPlaybackSpeed: (speed) => {
    const { playing, pause: pauseFn, play: playFn } = get()
    set({ playbackSpeed: speed })
    if (playing) {
      pauseFn()
      setTimeout(() => playFn(), 0)
    }
  },
}))

/** Get the tables involved in the active chunk */
export function getActiveChunkTables(state: RecordingState): Set<string> | null {
  const { activeChunkId, chunks } = state
  if (!activeChunkId) return null
  const chunk = chunks.find((c) => c.id === activeChunkId)
  if (!chunk) return null
  return new Set(chunk.tables)
}
