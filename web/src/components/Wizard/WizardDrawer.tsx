import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from '@/stores/dashboardStore'
import { dashboardApi } from '@/api/dashboard'

const STEPS = [
  { title: '提取 Schema', subtitle: '從資料庫匯出 Schema' },
  { title: '整理視覺化', subtitle: '在 Canvas 上整理資料表分組' },
  { title: '啟動錄製 Proxy', subtitle: '攔截 DB 查詢（和 HTTP API）' },
  { title: '執行分析', subtitle: '將查詢轉化為結構化報告' },
  { title: '匯出', subtitle: '產出 ORM 模型或文件' },
] as const

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[9px] px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-muted hover:text-text transition-colors cursor-pointer flex-shrink-0"
    >
      {copied ? '✓' : '複製'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface/50 border border-white/5 rounded-lg px-3 py-2">
      <code className="text-[11px] font-mono text-text-dim flex-1 min-w-0 break-all">{code}</code>
      <CopyButton text={code} />
    </div>
  )
}

export function WizardDrawer() {
  const navigate = useNavigate()
  const { wizardOpen, wizardStep, closeWizard, setWizardStep, status, fetchStatus } = useDashboardStore()

  const [form, setForm] = useState({
    targetHost: 'localhost',
    targetPort: '3306',
    listenPort: '13306',
    httpEnabled: false,
    httpPort: '18080',
    httpTarget: 'http://localhost:8000',
  })
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  if (!wizardOpen) return null

  const handleStop = async () => {
    setStopping(true)
    setStartError(null)
    try {
      await dashboardApi.stopRecording()
      await fetchStatus()
    } catch (e) {
      setStartError(e instanceof Error ? e.message : '停止失敗')
    } finally {
      setStopping(false)
    }
  }

  const handleStart = async () => {
    setStarting(true)
    setStartError(null)
    try {
      const res = await dashboardApi.startRecording({
        targetHost: form.targetHost,
        targetPort: parseInt(form.targetPort, 10),
        listenPort: parseInt(form.listenPort, 10),
        ...(form.httpEnabled && {
          httpProxy: {
            enabled: true,
            port: parseInt(form.httpPort, 10),
            target: form.httpTarget,
          },
        }),
      })
      if (!res.success) {
        setStartError(res.error ?? '啟動失敗')
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : '啟動失敗')
    } finally {
      setStarting(false)
    }
  }

  const inputClass =
    'bg-surface/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-primary/50 transition-colors'

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={closeWizard} />

      <div className="fixed top-0 right-0 bottom-0 w-96 bg-surface border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold">新手引導</h2>
            <p className="text-[10px] text-muted mt-0.5">步驟 {wizardStep} / {STEPS.length}</p>
          </div>
          <button onClick={closeWizard} className="text-muted hover:text-text transition-colors cursor-pointer text-xl leading-none">×</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/5 flex-shrink-0">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setWizardStep(i + 1)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i + 1 === wizardStep ? 'w-6 bg-primary' : i + 1 < wizardStep ? 'w-3 bg-emerald-400' : 'w-3 bg-white/15'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-base font-bold mb-1">{STEPS[wizardStep - 1].title}</h3>
          <p className="text-xs text-muted mb-5">{STEPS[wizardStep - 1].subtitle}</p>

          {wizardStep === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-text-dim">用 dbcli 匯出 Schema 並匯入 Archivolt：</p>
              <CodeBlock code="dbcli schema --format json > my-db.json" />
              <CodeBlock code="archivolt --input my-db.json" />
              {status?.schema.loaded && (
                <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                  <span>✓</span> archivolt.json 已載入
                </p>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">在 Canvas 上拖曳資料表、建立分組，讓結構一目了然。</p>
              <button
                onClick={() => { closeWizard(); navigate('/canvas') }}
                className="w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                前往 Canvas →
              </button>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-text-dim">設定 DB Proxy 攔截 SQL 查詢。</p>

              <div className="space-y-2">
                <label className="text-[10px] text-muted uppercase font-bold block">DB Target Host / Port</label>
                <div className="flex gap-2">
                  <input
                    value={form.targetHost}
                    onChange={(e) => setForm((f) => ({ ...f, targetHost: e.target.value }))}
                    placeholder="localhost"
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    value={form.targetPort}
                    onChange={(e) => setForm((f) => ({ ...f, targetPort: e.target.value }))}
                    placeholder="3306"
                    className={`${inputClass} w-20`}
                  />
                </div>
                <label className="text-[10px] text-muted uppercase font-bold block mt-2">Proxy Port（你的 app 改連這個）</label>
                <input
                  value={form.listenPort}
                  onChange={(e) => setForm((f) => ({ ...f, listenPort: e.target.value }))}
                  placeholder="13306"
                  className={`${inputClass} w-28`}
                />
              </div>

              <div className="border border-white/5 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.httpEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, httpEnabled: e.target.checked }))}
                    className="accent-primary"
                  />
                  <span className="text-xs text-text-dim">同時啟動 HTTP Proxy（選用）</span>
                </label>
                {form.httpEnabled && (
                  <div className="pl-5 space-y-2">
                    <input
                      value={form.httpTarget}
                      onChange={(e) => setForm((f) => ({ ...f, httpTarget: e.target.value }))}
                      placeholder="http://localhost:8000"
                      className={`${inputClass} w-full`}
                    />
                    <input
                      value={form.httpPort}
                      onChange={(e) => setForm((f) => ({ ...f, httpPort: e.target.value }))}
                      placeholder="18080"
                      className={`${inputClass} w-24`}
                    />
                  </div>
                )}
              </div>

              {startError && <p className="text-xs text-red-400">{startError}</p>}

              {status?.proxy.db.running ? (
                <div className="space-y-2">
                  <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
                    DB Proxy 運行中 — Port {status.proxy.db.port}
                  </p>
                  <button
                    onClick={handleStop}
                    disabled={stopping}
                    className="w-full py-2.5 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-300 border border-red-500/30 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  >
                    {stopping ? '停止中...' : '停止 Proxy'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  {starting ? '啟動中...' : '啟動 Proxy'}
                </button>
              )}
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-text-dim">錄製完成後執行分析：</p>
              <CodeBlock code="archivolt analyze <session-id>" />
              <CodeBlock code="archivolt analyze <session-id> --format optimize-md" />
              <p className="text-[10px] text-muted">加上 --ddl schema.sql 可分析索引缺口。</p>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="space-y-3">
              <p className="text-xs text-text-dim">將 vFK 標註匯出為 ORM 模型或文件：</p>
              <CodeBlock code="archivolt export eloquent --laravel /path/to/project" />
              <CodeBlock code="archivolt export prisma" />
              <CodeBlock code="archivolt export mermaid" />
              <CodeBlock code="archivolt export dbml" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={() => setWizardStep(Math.max(1, wizardStep - 1))}
            disabled={wizardStep === 1}
            className="px-4 py-2 text-xs text-muted hover:text-text disabled:opacity-30 transition-colors cursor-pointer"
          >
            ← 上一步
          </button>
          {wizardStep < STEPS.length ? (
            <button
              onClick={() => setWizardStep(wizardStep + 1)}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={closeWizard}
              className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/20 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              完成 ✓
            </button>
          )}
        </div>
      </div>
    </>
  )
}
