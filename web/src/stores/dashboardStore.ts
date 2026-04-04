import { create } from 'zustand'
import { dashboardApi } from '@/api/dashboard'
import type { SystemStatus, SessionSummary, LiveStats } from '@/api/dashboard'

interface DashboardStore {
  status: SystemStatus | null
  sessions: SessionSummary[]
  liveStats: LiveStats | null
  wizardOpen: boolean
  wizardStep: number
  loading: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  fetchSessions: () => Promise<void>
  openWizard: () => void
  closeWizard: () => void
  setWizardStep: (step: number) => void
  connectSSE: () => () => void
}

const getSavedStep = (): number => {
  try {
    const saved = localStorage.getItem('archivolt_wizard_step')
    return saved ? parseInt(saved, 10) : 1
  } catch {
    return 1
  }
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  status: null,
  sessions: [],
  liveStats: null,
  wizardOpen: false,
  wizardStep: getSavedStep(),
  loading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const status = await dashboardApi.getStatus()
      set({ status })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Unknown error' })
    }
  },

  fetchSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await dashboardApi.getSessions()
      set({ sessions, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Unknown error', loading: false })
    }
  },

  openWizard: () => set({ wizardOpen: true }),
  closeWizard: () => set({ wizardOpen: false }),

  setWizardStep: (step) => {
    try {
      localStorage.setItem('archivolt_wizard_step', String(step))
    } catch {
      // localStorage 不可用時靜默跳過
    }
    set({ wizardStep: step })
  },

  connectSSE: () => {
    const es = new EventSource('/api/recording/live')

    es.addEventListener('stats', (e: MessageEvent) => {
      try {
        set({ liveStats: JSON.parse(e.data) })
      } catch {
        // 忽略解析錯誤
      }
    })

    es.addEventListener('idle', () => {
      set({ liveStats: null })
    })

    es.onerror = () => {
      // SSE 連線中斷時靜默處理，瀏覽器會自動重連
    }

    return () => es.close()
  },
}))
