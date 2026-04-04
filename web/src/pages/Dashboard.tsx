import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from '@/stores/dashboardStore'
import { StatusSection } from '@/components/Dashboard/StatusSection'
import { WorkflowSection } from '@/components/Dashboard/WorkflowSection'
import { SessionList } from '@/components/Dashboard/SessionList'
import { WizardDrawer } from '@/components/Wizard/WizardDrawer'

const WindowDots = () => (
  <div className="flex gap-2 px-2">
    <div className="w-3 h-3 rounded-full bg-slate-700" />
    <div className="w-3 h-3 rounded-full bg-slate-700 opacity-60" />
    <div className="w-3 h-3 rounded-full bg-slate-700 opacity-30" />
  </div>
)

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    status,
    sessions,
    liveStats,
    loading,
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
    <div className="min-h-screen bg-surface bg-console-grid text-text font-sans overflow-hidden flex flex-col">
      {/* ── Top Navigation Bar ── */}
      <div className="h-16 bg-panel border-b border-border flex items-center justify-between px-8 shrink-0 shadow-md">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black tracking-tighter text-text-bright">ARCHIVOLT</span>
            <span className="text-text-muted">/</span>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Console_System</span>
          </div>
          <div className="h-6 w-px bg-border hidden md:block" />
          <div className="hidden md:flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(87,171,90,0.3)]" />
            <span className="text-[11px] font-bold text-success/90 uppercase tracking-wider">Node_Synchronized</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-6 text-[11px] font-mono text-text-dim/60">
            <span>LOAD: {(liveStats?.db.qps ?? 0) / 10}%</span>
            <span>UPTIME: 100%</span>
          </div>
          <button 
            onClick={() => navigate('/canvas')}
            className="px-6 py-2 bg-primary hover:bg-blue-400 text-surface text-[11px] font-black uppercase tracking-widest rounded-md transition-all active:scale-95 cursor-pointer shadow-lg shadow-blue-900/20"
          >
            Launch_Canvas {"→"}
          </button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Left Main Area */}
            <div className="xl:col-span-8 space-y-8">
              
              {/* Window: System Status */}
              <div className="terminal-window">
                <div className="terminal-header">
                  <div className="flex items-center gap-4">
                    <WindowDots />
                    <span className="text-xs font-bold text-text-dim tracking-tight">System_Diagnostics.log</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-dim opacity-50 italic">read-only</span>
                </div>
                <div className="p-8">
                  <StatusSection status={status} liveStats={liveStats} />
                </div>
              </div>

              {/* Window: Workflow Pipeline */}
              <div className="terminal-window">
                <div className="terminal-header">
                  <div className="flex items-center gap-4">
                    <WindowDots />
                    <span className="text-xs font-bold text-text-dim tracking-tight">Deployment_Pipeline.sh</span>
                  </div>
                  <div className="px-3 py-1 bg-success/10 rounded-full border border-success/20">
                    <span className="text-[10px] text-success font-black uppercase tracking-widest">Active_Session</span>
                  </div>
                </div>
                <div className="p-0">
                  <WorkflowSection status={status} sessions={sessions} />
                </div>
              </div>
            </div>

            {/* Right Sidebar: Sessions */}
            <div className="xl:col-span-4">
              <div className="terminal-window h-full min-h-[600px] flex flex-col">
                <div className="terminal-header shrink-0">
                  <div className="flex items-center gap-4">
                    <WindowDots />
                    <span className="text-xs font-bold text-text-dim tracking-tight">Capture_History</span>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <SessionList sessions={sessions} loading={loading} />
                </div>
              </div>
            </div>
          </div>

          {/* Setup Wizard Link */}
          <div className="flex justify-center pt-4 pb-12">
            <button
              onClick={openWizard}
              className="px-12 py-4 bg-card border border-border hover:border-primary/50 text-text-dim hover:text-text-bright transition-all rounded-xl flex items-center gap-6 group cursor-pointer shadow-xl"
            >
              <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-primary">Initialization_Protocol</div>
                <div className="text-sm font-bold opacity-60">Execute Setup Wizard Wizard</div>
              </div>
            </button>
          </div>
        </div>
      </div>
      <WizardDrawer />
    </div>
  )
}
