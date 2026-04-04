// web/src/components/Review/SuggestionRow.tsx
import { useState } from 'react'
import type { VirtualForeignKey, Table } from '@/types/er-model'

export interface SuggestionRowProps {
  tableName: string
  vfk: VirtualForeignKey
  allTables: Record<string, Table>
  onConfirm: (tableName: string, vfkId: string, sourceColumn: string, refTable: string, refColumn: string) => Promise<void>
  onIgnore: (tableName: string, vfkId: string) => Promise<void>
  onLocate: (tableName: string) => void
}

export function SuggestionRow({ tableName, vfk, allTables, onConfirm, onIgnore, onLocate }: SuggestionRowProps) {
  const [expanded, setExpanded] = useState(vfk.refTable === '' || !allTables[vfk.refTable])
  const [sourceColumn, setSourceColumn] = useState(vfk.columns[0] ?? '')
  const [refTable, setRefTable] = useState(vfk.refTable)
  const [refColumn, setRefColumn] = useState(vfk.refColumns[0] ?? 'id')
  const [loading, setLoading] = useState(false)

  const sourceTable = allTables[tableName]
  const targetTable = allTables[refTable]
  const isUnresolved = !allTables[vfk.refTable]

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm(tableName, vfk.id, sourceColumn, refTable, refColumn)
    } finally {
      setLoading(false)
    }
  }

  async function handleIgnore() {
    setLoading(true)
    try {
      await onIgnore(tableName, vfk.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border transition-all duration-200 font-mono ${
      isUnresolved
        ? 'border-warning/40 bg-warning/5'
        : 'border-border bg-card/40 hover:border-border/80'
    }`}>
      {/* 摺疊列 */}
      <div className="flex items-center justify-between px-5 py-4 gap-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
        >
          <span className="text-[10px] text-text-dim w-3 shrink-0">{expanded ? '▼' : '▶'}</span>
          <span className="text-xs font-black text-text-bright truncate">
            <span className="text-primary">{tableName}</span>
            <span className="text-text-muted">.</span>
            <span className="text-warning">{vfk.columns[0]}</span>
            <span className="text-text-muted mx-2">→</span>
            {isUnresolved
              ? <span className="text-warning/60">?</span>
              : <><span className="text-success">{vfk.refTable}</span><span className="text-text-muted">.</span><span className="text-success/80">{vfk.refColumns[0]}</span></>
            }
          </span>
        </button>

        {!expanded && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleConfirm}
              disabled={loading || isUnresolved}
              className="px-3 py-1.5 text-[10px] font-black bg-success/15 border border-success/30 text-success rounded-lg hover:bg-success/25 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              ✓ 確認
            </button>
            <button
              onClick={handleIgnore}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-black bg-panel border border-border text-text-muted rounded-lg hover:text-text hover:border-text-muted/50 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              ✗ 忽略
            </button>
            <button
              onClick={() => onLocate(tableName)}
              className="px-3 py-1.5 text-[10px] font-black bg-panel border border-border text-primary/80 rounded-lg hover:border-primary/50 hover:text-primary transition-all active:scale-95 cursor-pointer"
            >
              ⊞ 定位
            </button>
          </div>
        )}
      </div>

      {/* 展開表單 */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-text-muted uppercase tracking-widest block">來源欄位</label>
              <select
                value={sourceColumn}
                onChange={(e) => setSourceColumn(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-all"
              >
                {sourceTable?.columns.map(col => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-text-muted uppercase tracking-widest block">目標表</label>
              <select
                value={refTable}
                onChange={(e) => { setRefTable(e.target.value); setRefColumn('id') }}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-all"
              >
                <option value="">-- 選擇 --</option>
                {Object.keys(allTables).sort().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-text-muted uppercase tracking-widest block">目標欄位</label>
              <select
                value={refColumn}
                onChange={(e) => setRefColumn(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-all"
              >
                {(targetTable?.columns ?? []).map(col => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleConfirm}
              disabled={loading || !refTable || !refColumn}
              className="px-4 py-2 text-[10px] font-black bg-success/15 border border-success/30 text-success rounded-lg hover:bg-success/25 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              {loading ? '處理中...' : '✓ 確認'}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="text-[10px] font-black text-text-muted hover:text-text transition-colors"
            >
              取消
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onLocate(tableName)}
              className="px-3 py-1.5 text-[10px] font-black bg-panel border border-border text-primary/80 rounded-lg hover:border-primary/50 hover:text-primary transition-all active:scale-95 cursor-pointer"
            >
              ⊞ 在畫布定位
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
