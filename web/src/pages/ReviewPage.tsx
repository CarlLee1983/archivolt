// web/src/pages/ReviewPage.tsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSchemaStore } from '@/stores/schemaStore'
import { schemaApi } from '@/api/schema'
import { SuggestionRow } from '@/components/Review/SuggestionRow'
import type { VirtualForeignKey } from '@/types/er-model'

type SubTab = 'pending' | 'confirmed' | 'ignored'

interface VFKItem {
  tableName: string
  vfk: VirtualForeignKey
}

export default function ReviewPage() {
  const navigate = useNavigate()
  const { model, fetchSchema, refreshModel, selectTable } = useSchemaStore()
  const [subTab, setSubTab] = useState<SubTab>('pending')

  useEffect(() => {
    if (!model) fetchSchema()
  }, [model, fetchSchema])

  const allVFKs: VFKItem[] = model
    ? Object.entries(model.tables).flatMap(([tableName, table]) =>
        table.virtualForeignKeys.map(vfk => ({ tableName, vfk }))
      )
    : []

  const pending = allVFKs.filter(({ vfk }) => vfk.confidence === 'auto-suggested')
  const confirmed = allVFKs.filter(({ vfk }) => vfk.confidence === 'manual')
  const ignored = allVFKs.filter(({ vfk }) => vfk.confidence === 'ignored')

  const handleConfirm = useCallback(async (
    tableName: string,
    vfkId: string,
    sourceColumn: string,
    refTable: string,
    refColumn: string,
  ) => {
    const original = model?.tables[tableName]?.virtualForeignKeys.find(v => v.id === vfkId)
    if (!original) return

    const columnChanged = original.columns[0] !== sourceColumn ||
                          original.refTable !== refTable ||
                          original.refColumns[0] !== refColumn

    if (columnChanged) {
      await schemaApi.deleteVirtualFK(vfkId, tableName)
      await schemaApi.addVirtualFK({ tableName, columns: [sourceColumn], refTable, refColumns: [refColumn] })
    } else {
      await schemaApi.confirmVirtualFK(tableName, vfkId)
    }

    const updated = await schemaApi.getSchema()
    refreshModel(updated)
  }, [model, refreshModel])

  const handleIgnore = useCallback(async (tableName: string, vfkId: string) => {
    await schemaApi.ignoreVirtualFK(tableName, vfkId)
    const updated = await schemaApi.getSchema()
    refreshModel(updated)
  }, [refreshModel])

  const handleRestore = useCallback(async (tableName: string, vfkId: string) => {
    await schemaApi.restoreVirtualFK(tableName, vfkId)
    const updated = await schemaApi.getSchema()
    refreshModel(updated)
  }, [refreshModel])

  const handleLocate = useCallback((tableName: string) => {
    selectTable(tableName)
    navigate('/canvas')
  }, [selectTable, navigate])

  const tabCount = { pending: pending.length, confirmed: confirmed.length, ignored: ignored.length }

  if (!model) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface font-mono">
        <div className="space-y-4 text-center">
          <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-primary animate-[scanning_1s_linear_infinite]" />
          </div>
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.4em]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen bg-surface text-text font-sans overflow-hidden flex flex-col">
      {/* Navbar */}
      <div className="h-14 bg-panel border-b border-border px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/canvas')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-lg font-black tracking-tighter text-text-bright">ARCHIVOLT</span>
            <span className="text-text-muted">/</span>
          </button>

          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => navigate('/canvas')}
              className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all text-text-muted hover:text-text cursor-pointer"
            >
              Canvas
            </button>
            <button
              className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all bg-primary/15 text-primary border border-primary/30 cursor-pointer"
            >
              Review
              {tabCount.pending > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-warning/20 text-warning border border-warning/30 rounded-full font-black">
                  {tabCount.pending}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-border bg-panel/50 px-8 flex items-center gap-0 shrink-0">
        {(['pending', 'confirmed', 'ignored'] as SubTab[]).map((tab) => {
          const labels: Record<SubTab, string> = { pending: '待審查', confirmed: '已確認', ignored: '已忽略' }
          const colors: Record<SubTab, string> = {
            pending: 'text-warning border-warning',
            confirmed: 'text-success border-success',
            ignored: 'text-text-muted border-text-muted',
          }
          return (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
                subTab === tab
                  ? colors[tab]
                  : 'border-transparent text-text-dim hover:text-text'
              }`}
            >
              {labels[tab]}
              <span className="ml-2 text-[9px] opacity-60">({tabCount[tab]})</span>
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-8">
        {subTab === 'pending' && (
          <div className="max-w-4xl mx-auto space-y-3">
            {pending.length === 0 ? (
              <div className="text-center py-24 text-text-muted">
                <div className="text-4xl font-black tracking-tighter uppercase opacity-20 mb-4">All_Clear</div>
                <p className="text-xs font-mono">沒有待審查的建議</p>
              </div>
            ) : pending.map(({ tableName, vfk }) => (
              <SuggestionRow
                key={`${tableName}-${vfk.id}`}
                tableName={tableName}
                vfk={vfk}
                allTables={model.tables}
                onConfirm={handleConfirm}
                onIgnore={handleIgnore}
                onLocate={handleLocate}
              />
            ))}
          </div>
        )}

        {subTab === 'confirmed' && (
          <div className="max-w-4xl mx-auto space-y-3">
            {confirmed.length === 0 ? (
              <div className="text-center py-24 text-text-muted">
                <p className="text-xs font-mono opacity-40">尚無已確認的關聯</p>
              </div>
            ) : confirmed.map(({ tableName, vfk }) => (
              <div
                key={`${tableName}-${vfk.id}`}
                className="flex items-center justify-between px-5 py-4 rounded-xl border border-success/20 bg-success/5 font-mono"
              >
                <span className="text-xs font-black">
                  <span className="text-primary">{tableName}</span>
                  <span className="text-text-muted">.</span>
                  <span className="text-warning">{vfk.columns[0]}</span>
                  <span className="text-text-muted mx-2">→</span>
                  <span className="text-success">{vfk.refTable}</span>
                  <span className="text-text-muted">.</span>
                  <span className="text-success/80">{vfk.refColumns[0]}</span>
                </span>
                <span className="text-[9px] px-2 py-0.5 bg-success/15 border border-success/30 text-success font-black rounded-lg uppercase">manual</span>
              </div>
            ))}
          </div>
        )}

        {subTab === 'ignored' && (
          <div className="max-w-4xl mx-auto space-y-3">
            {ignored.length === 0 ? (
              <div className="text-center py-24 text-text-muted">
                <p className="text-xs font-mono opacity-40">沒有被忽略的建議</p>
              </div>
            ) : ignored.map(({ tableName, vfk }) => (
              <div
                key={`${tableName}-${vfk.id}`}
                className="flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card/30 font-mono"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-text-dim">
                    <span className="text-text-muted">{tableName}</span>
                    <span className="text-text-dim">.</span>
                    <span className="text-text-muted/60">{vfk.columns[0]}</span>
                    <span className="text-text-dim mx-2">→</span>
                    <span className="text-text-muted">{vfk.refTable}</span>
                    <span className="text-text-dim">.</span>
                    <span className="text-text-muted/60">{vfk.refColumns[0]}</span>
                  </span>
                </div>
                <button
                  onClick={() => handleRestore(tableName, vfk.id)}
                  className="px-3 py-1.5 text-[10px] font-black bg-panel border border-border text-text-muted rounded-lg hover:text-text hover:border-text-muted/50 transition-all active:scale-95 cursor-pointer shrink-0 ml-4"
                >
                  ↩ 復原
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
