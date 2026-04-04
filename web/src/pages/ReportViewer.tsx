import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { dashboardApi } from '@/api/dashboard'
import type { OptimizationReportJson } from '@/api/dashboard'
import { FindingCard } from '@/components/Report/FindingCard'

export default function ReportViewer() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<OptimizationReportJson | null>(null)
  const [rawMd] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    dashboardApi
      .getReport(sessionId, 'optimize')
      .then((data) => {
        setReport(data)
        setLoading(false)
      })
      .catch(() => {
        dashboardApi
          .getReport(sessionId, 'manifest')
          .then((data) => {
            setReport(data as OptimizationReportJson)
            setLoading(false)
          })
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : 'Report not found')
            setLoading(false)
          })
      })
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex h-screen bg-surface items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-screen bg-surface text-text items-center justify-center flex-col gap-3">
        <p className="text-muted text-sm">報告不存在</p>
        <p className="text-[10px] text-muted/60">
          執行: archivolt analyze {sessionId ?? ''} --format optimize-md
        </p>
        <button onClick={() => navigate('/')} className="text-xs text-primary underline cursor-pointer mt-2">
          ← 返回 Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-text font-sans">
      {/* Header */}
      <div className="sticky top-0 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-muted hover:text-text transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <div className="text-sm font-bold">分析報告</div>
            <div className="text-[10px] font-mono text-muted">{sessionId}</div>
          </div>
        </div>
        <button
          onClick={() => setShowRaw((r) => !r)}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-muted hover:text-text transition-colors cursor-pointer"
        >
          {showRaw ? '結構化檢視' : 'Raw MD'}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {showRaw ? (
          <div className="prose prose-invert prose-sm max-w-none">
            {rawMd ? (
              <ReactMarkdown>{rawMd}</ReactMarkdown>
            ) : (
              <p className="text-muted text-sm">Raw Markdown 預覽尚未實作。請在終端執行 archivolt analyze 查看報告。</p>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* N+1 */}
            {report.n1Findings && report.n1Findings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
                  N+1 問題 ({report.n1Findings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.n1Findings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="red"
                      title={`${f.apiPath} — 重複 ${f.count} 次`}
                      sql={f.sql}
                      extraSql={f.batchSql}
                      extraSqlLabel="建議批次查詢"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Index gaps */}
            {report.indexGapFindings && report.indexGapFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-3">
                  索引缺失 ({report.indexGapFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.indexGapFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="orange"
                      title={`${f.table}.${f.column} 無索引`}
                      sql={f.createIndexSql}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Fragmentation */}
            {report.fragmentationFindings && report.fragmentationFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3">
                  查詢碎片化 ({report.fragmentationFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.fragmentationFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="yellow"
                      title={`重複 ${f.count} 次`}
                      sql={f.sql}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Full scans */}
            {report.fullScanFindings && report.fullScanFindings.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">
                  全表掃描 ({report.fullScanFindings.length} 處)
                </h2>
                <div className="space-y-2">
                  {report.fullScanFindings.map((f, i) => (
                    <FindingCard
                      key={i}
                      severity="red"
                      title={`${f.table} 全表掃描`}
                      sql={f.sql}
                      extraSql={f.createIndexSql}
                      extraSqlLabel="建議索引"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Read/Write ratio */}
            {report.readWriteReport && report.readWriteReport.tables.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">
                  讀寫比分析
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] text-muted uppercase">
                        <th className="px-4 py-2 text-left font-semibold">資料表</th>
                        <th className="px-4 py-2 text-right font-semibold">讀</th>
                        <th className="px-4 py-2 text-right font-semibold">寫</th>
                        <th className="px-4 py-2 text-right font-semibold">讀佔比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.readWriteReport.tables.map((t, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                          <td className="px-4 py-2 font-mono">{t.table}</td>
                          <td className="px-4 py-2 text-right text-emerald-400">{t.reads}</td>
                          <td className="px-4 py-2 text-right text-amber-400">{t.writes}</td>
                          <td className="px-4 py-2 text-right">{Math.round(t.readRatio * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 空報告 */}
            {report.n1Findings?.length === 0 &&
              !report.indexGapFindings?.length &&
              !report.fragmentationFindings?.length &&
              !report.fullScanFindings?.length && (
                <div className="text-center py-12 text-muted">
                  <p className="text-sm">沒有發現效能問題</p>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
