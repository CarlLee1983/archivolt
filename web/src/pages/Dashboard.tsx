import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from '@/stores/dashboardStore'
import { StatusSection } from '@/components/Dashboard/StatusSection'
import { WorkflowSection } from '@/components/Dashboard/WorkflowSection'

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    status,
    sessions,
    liveStats,
    fetchStatus,
    fetchSessions,
    connectSSE,
    openWizard,
  } = useDashboardStore()

  useEffect(() => {
    fetchStatus()
    fetchSessions()
    const cleanupSSE = connectSSE()
    const interval = setInterval(() => {
      fetchStatus()
      fetchSessions()
    }, 10_000)
    return () => {
      cleanupSSE()
      clearInterval(interval)
    }
  }, [fetchStatus, fetchSessions, connectSSE])

  return (
    <div className="min-h-screen bg-surface text-text font-sans">
      {/* Navbar */}
      <div className="fixed top-4 left-4 right-4 h-12 backdrop-blur-md border border-white/10 shadow-glass rounded-xl z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 text-[10px] font-bold text-white">
            A
          </div>
          <h1 className="text-sm font-bold tracking-tight">Archivolt</h1>
        </div>
        <button
          onClick={() => navigate('/canvas')}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
        >
          開啟 Canvas →
        </button>
      </div>

      {/* Content */}
      <div className="pt-20 pb-8 px-4 max-w-4xl mx-auto space-y-4">
        <StatusSection status={status} liveStats={liveStats} />
        <WorkflowSection status={status} sessions={sessions} />

        {/* Session list + Wizard — Task 8 & 9 會補充 */}
        <div className="flex justify-center pt-2">
          <button
            onClick={openWizard}
            className="px-6 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            🧙 新手引導 Wizard
          </button>
        </div>
      </div>
    </div>
  )
}
