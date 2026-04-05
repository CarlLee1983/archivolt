import type { OptimizationReportJson } from '@/api/dashboard'
import { FindingCard } from '@/components/Report/FindingCard'

interface Props {
  report: OptimizationReportJson
}

export function ReportContent({ report }: Props) {
  const hasFindings =
    (report.n1Findings?.length ?? 0) > 0 ||
    (report.indexGapFindings?.length ?? 0) > 0 ||
    (report.fragmentationFindings?.length ?? 0) > 0 ||
    (report.fullScanFindings?.length ?? 0) > 0

  return (
    <div className="space-y-8">
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

      {report.fragmentationFindings && report.fragmentationFindings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3">
            查詢碎片化 ({report.fragmentationFindings.length} 處)
          </h2>
          <div className="space-y-2">
            {report.fragmentationFindings.map((f, i) => (
              <FindingCard key={i} severity="yellow" title={`重複 ${f.count} 次`} sql={f.sql} />
            ))}
          </div>
        </section>
      )}

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

      {!hasFindings && (
        <div className="text-center py-12 text-muted">
          <p className="text-sm">沒有發現效能問題</p>
        </div>
      )}
    </div>
  )
}
