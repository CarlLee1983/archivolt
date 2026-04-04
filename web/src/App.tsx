import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSchemaStore, tableMatchesFilter } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'
import { TimelinePanel } from '@/components/Timeline/TimelinePanel'
import { useRecordingStore } from '@/stores/recordingStore'
import { schemaApi } from '@/api/schema'
import type { Table } from '@/types/er-model'

/* ─── SVG Icons (Lucide-style) ─── */

const Icon = ({ children, className = '', size = 16, strokeWidth = 2 }: { children: React.ReactNode, className?: string, size?: number, strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
)

const SearchIcon = () => (
  <Icon size={14}>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Icon>
)

const ClearIcon = () => (
  <Icon size={12}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
)

const KeyIcon = ({ className = "" }) => (
  <Icon size={10} className={className}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </Icon>
)

const LinkIcon = ({ className = "" }) => (
  <Icon size={10} className={className}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
)

const PlusIcon = () => (
  <Icon size={12} strokeWidth={2.5}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
)

const DatabaseIcon = () => (
  <Icon size={14}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </Icon>
)

const LayersIcon = ({ className = "" }) => (
  <Icon size={14} className={className}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </Icon>
)

const TargetIcon = () => (
  <Icon size={14}>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </Icon>
)

/* ─── Unlinked Column Detection ─── */

interface UnlinkedColumn {
  columnName: string
  suggestedTable: string | null
}

function getUnlinkedColumns(table: Table, allTableNames: string[]): UnlinkedColumn[] {
  const linkedColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return table.columns
    .filter((col) => col.name.endsWith('_id') && !linkedColumns.has(col.name))
    .map((col) => {
      const stem = col.name.replace(/_id$/, '')
      const candidates = [`${stem}s`, stem, `${stem}es`]
      const suggestedTable = candidates.find((c) => allTableNames.includes(c)) ?? null
      return { columnName: col.name, suggestedTable }
    })
}

/* ─── App ─── */

export default function App() {
  const {
    model, loading, error, fetchSchema,
    visibleGroups, toggleGroup, setVisibleGroups,
    selectedTable, selectTable,
    tableFilter, setTableFilter,
    refreshModel,
    focusMode, setFocusMode,
  } = useSchemaStore()

  const hasSessions = useRecordingStore((s) => s.sessions.length > 0)

  const [linkingColumn, setLinkingColumn] = useState<string | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  const keyword = tableFilter.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!model) return []
    const entries = Object.entries(model.groups)
    if (!keyword) return entries

    return entries.filter(([, group]) => {
      if (group.name.toLowerCase().includes(keyword)) return true
      return group.tables.some((t) => tableMatchesFilter(t, keyword, model.tables))
    })
  }, [model, keyword])

  // Reset link form when selected table changes
  useEffect(() => {
    setLinkingColumn(null)
    setLinkTarget('')
  }, [selectedTable])

  const handleCreateVFK = useCallback(async () => {
    if (!model || !selectedTable || !linkingColumn || !linkTarget.trim()) return
    setLinkLoading(true)
    try {
      await schemaApi.addVirtualFK({
        tableName: selectedTable,
        columns: [linkingColumn],
        refTable: linkTarget.trim(),
        refColumns: ['id'],
      })
      const updated = await schemaApi.getSchema()
      refreshModel(updated)
      setLinkingColumn(null)
      setLinkTarget('')
    } catch (e: any) {
      console.error('Failed to add virtual FK:', e)
    } finally {
      setLinkLoading(false)
    }
  }, [model, selectedTable, linkingColumn, linkTarget, refreshModel])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface text-red-400 font-sans">
        <div className="text-center p-8 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl">
          <div className="text-4xl mb-4 text-red-500/50">!</div>
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => fetchSchema()} className="mt-4 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg transition-colors">
            重試
          </button>
        </div>
      </div>
    )
  }

  if (loading || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted font-medium tracking-wide">Loading Database Schema...</p>
        </div>
      </div>
    )
  }

  const selected = selectedTable ? model.tables[selectedTable] : null
  const allTableNames = Object.keys(model.tables)
  const unlinked = selected ? getUnlinkedColumns(selected, allTableNames) : []

  return (
    <div className="flex h-screen bg-surface bg-mesh text-text font-sans overflow-hidden">
      {/* ── Navbar ── */}
      <div className="fixed top-4 left-4 right-4 h-14 depth-card z-50 px-6 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 transition-transform hover:rotate-3">
            <DatabaseIcon />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest uppercase text-white">Archivolt</h1>
            <p className="text-[10px] text-primary/80 font-bold leading-tight">
              {allTableNames.length} TABLES &middot; {Object.keys(model.groups).length} GROUPS
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pointer-events-auto">
          {/* Focus Mode Toggle */}
          <button 
            onClick={() => setFocusMode(!focusMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 cursor-pointer active:scale-95 ${
              focusMode 
                ? 'bg-primary/20 border-primary/40 text-primary shadow-[0_0_20px_rgba(59,130,246,0.25)]' 
                : 'bg-white/5 border-white/5 text-muted hover:text-text-dim hover:bg-white/10'
            }`}
            title={focusMode ? '關閉焦點模式' : '開啟焦點模式：僅顯示選中表及其關聯表'}
          >
            <TargetIcon />
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Focus Mode</span>
            <div className={`w-1.5 h-1.5 rounded-full ${focusMode ? 'bg-primary animate-pulse' : 'bg-white/10'}`} />
          </button>

          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Search tables..."
              className="bg-black/20 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-xs text-text placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/20 w-48 md:w-64 transition-all"
            />
            {tableFilter && (
              <button
                onClick={() => setTableFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer transition-colors"
              >
                <ClearIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Left: Group Panel ── */}
      <div className="fixed top-24 left-4 bottom-6 w-64 depth-card flex flex-col z-40 overflow-hidden animate-in slide-in-from-left-4 duration-500">
        <div className="px-5 py-4 border-b border-white/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
              <LayersIcon className="text-primary" />
              Groups
            </div>
            <button
              onClick={() => {
                const ids = filteredGroups.map(([id]) => id)
                const allVisible = ids.every((id) => visibleGroups.has(id))
                const next = new Set(visibleGroups)
                for (const id of ids) allVisible ? next.delete(id) : next.add(id)
                setVisibleGroups(next)
              }}
              className="text-[9px] font-black text-primary/60 hover:text-primary transition-colors uppercase tracking-widest"
            >
              {filteredGroups.every(([id]) => visibleGroups.has(id)) ? 'Deselect' : 'Select All'}
            </button>
          </div>
          {focusMode && selectedTable && (
            <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 rounded-xl border border-primary/20 animate-in fade-in slide-in-from-left-2 shadow-inner">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="text-[10px] text-primary font-black uppercase tracking-tight truncate">
                Focused: {selectedTable}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scroll-smooth">
          {filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 opacity-20">
              <SearchIcon size={24} />
              <p className="text-[10px] font-black uppercase tracking-widest mt-3">No Results</p>
            </div>
          ) : (
            filteredGroups.map(([id, group]) => {
              const isVisible = visibleGroups.has(id)
              const matchedCount = keyword
                ? group.tables.filter((t) => tableMatchesFilter(t, keyword, model.tables)).length
                : group.tables.length
              return (
                <button
                  key={id}
                  onClick={() => toggleGroup(id)}
                  className={`group w-full text-left rounded-xl px-4 py-3 cursor-pointer transition-all duration-300 active:scale-95 ${
                    isVisible
                      ? focusMode && selectedTable 
                        ? 'bg-purple-500/15 text-purple-200 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                        : 'bg-primary/15 text-white border border-primary/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                      : 'hover:bg-white/5 text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold truncate pr-2 tracking-tight">
                      {group.name}
                    </span>
                    <span className={`text-[10px] font-mono font-bold tabular-nums px-2 py-0.5 rounded-lg ${
                      isVisible 
                        ? focusMode && selectedTable ? 'bg-purple-500/30 text-purple-200' : 'bg-primary/30 text-white' 
                        : 'bg-white/5 text-slate-600'
                    }`}>
                      {keyword ? matchedCount : group.tables.length}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Center: ReactFlow Canvas ── */}
      <div className="flex-1 relative">
        <ERCanvas />
      </div>

      {/* ── Right: Timeline Panel ── */}
      <TimelinePanel />

      {/* ── Right: Detail Panel ── */}
      <div className={`fixed top-24 bottom-6 w-85 depth-card flex flex-col z-40 overflow-hidden transition-all duration-500 shadow-heavy ${
        hasSessions ? 'right-[22.5rem]' : 'right-4'
      } ${
        selected ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'
      }`}>
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Table Details</h2>
          <button 
            onClick={() => selectTable(null)} 
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 text-muted hover:text-white transition-all active:scale-90"
          >
            <ClearIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scroll-smooth">
          {selected && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              {/* Table Header Section */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-black font-mono text-white break-all leading-tight tracking-tighter">
                    {selected.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg text-[10px] font-black font-mono text-primary uppercase tracking-widest">{selected.engine}</span>
                    <span className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-400 font-bold">{selected.rowCount.toLocaleString()} ROWS</span>
                  </div>
                </div>
              </div>

              {/* Columns Card */}
              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  Fields ({selected.columns.length})
                </div>
                <div className="bento-inner space-y-1 shadow-2xl">
                  {selected.columns.map((col) => (
                    <div key={col.name} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-[12px] flex shrink-0 items-center justify-center">
                          {col.primaryKey === 1 && <span className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]"><KeyIcon /></span>}
                        </div>
                        <span className={`text-xs font-mono truncate tracking-tight ${col.primaryKey === 1 ? 'text-red-300 font-black' : 'text-slate-300 group-hover:text-white'}`}>
                          {col.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-black font-mono text-slate-500 uppercase tracking-widest ml-2 opacity-60 group-hover:opacity-100">{col.type.replace(/\(.*\)/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreign Keys Card */}
              {selected.foreignKeys.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-3">
                    <div className="h-px flex-1 bg-emerald-500/10" />
                    Relations
                  </div>
                  <div className="space-y-2">
                    {selected.foreignKeys.map((fk) => (
                      <div key={fk.name} className="text-[11px] font-mono p-4 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10 hover:border-emerald-500/30 transition-all group shadow-inner">
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"><LinkIcon /></span>
                          <span className="font-black text-emerald-200 uppercase tracking-tight">{fk.columns[0]}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 ml-5">
                          <span className="font-bold text-emerald-500/50">REFERENCES</span>
                          <span className="text-emerald-400/80 font-black hover:underline underline-offset-4 cursor-pointer" onClick={() => selectTable(fk.refTable)}>{fk.refTable}</span>
                          <span className="opacity-30">({fk.refColumns[0]})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Virtual Foreign Keys Card */}
              {selected.virtualForeignKeys.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] flex items-center gap-3">
                    <div className="h-px flex-1 bg-amber-500/10" />
                    Inferred
                  </div>
                  <div className="space-y-2">
                    {selected.virtualForeignKeys.map((vfk) => (
                      <div key={vfk.id} className="text-[11px] font-mono p-4 rounded-2xl bg-amber-500/[0.03] border border-amber-500/10 hover:border-amber-500/30 transition-all group shadow-inner">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]"><LinkIcon /></span>
                            <span className="font-black text-amber-200 uppercase tracking-tight">{vfk.columns[0]}</span>
                          </div>
                          <span className="text-[9px] px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 font-black uppercase tracking-widest border border-amber-500/20">{vfk.confidence}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 ml-5">
                          <span className="font-bold text-amber-500/50">LINKS TO</span>
                          <span className="text-amber-400/80 font-black hover:underline underline-offset-4 cursor-pointer" onClick={() => selectTable(vfk.refTable)}>{vfk.refTable}</span>
                          <span className="opacity-30">({vfk.refColumns[0]})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Suggestions Section ── */}
              {unlinked.length > 0 && (
                <div className="space-y-4 pt-4">
                  <div className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-3">
                    <div className="h-px flex-1 bg-purple-500/10" />
                    AI Insights
                  </div>
                  <div className="space-y-3">
                    {unlinked.map(({ columnName, suggestedTable }) => {
                      const isActive = linkingColumn === columnName
                      return (
                        <div key={columnName} className={`rounded-2xl transition-all duration-500 shadow-xl ${
                          isActive ? 'bg-purple-600/10 border-purple-500/40 shadow-purple-900/10' : 'bg-purple-500/[0.03] border-purple-500/10 hover:border-purple-500/30'
                        } border p-4`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-purple-400"><PlusIcon /></span>
                              <span className="text-xs font-mono font-black text-purple-200 uppercase tracking-tight">{columnName}</span>
                            </div>
                            {!isActive && (
                              <button
                                onClick={() => {
                                  setLinkingColumn(columnName)
                                  setLinkTarget(suggestedTable ?? '')
                                }}
                                className="text-[10px] font-black bg-purple-500 text-white px-3 py-1.5 rounded-xl transition-all active:scale-90 shadow-lg shadow-purple-900/40 cursor-pointer"
                              >
                                SUGGEST LINK
                              </button>
                            )}
                          </div>
                          {suggestedTable && !isActive && (
                            <div className="text-[10px] text-slate-500 ml-7 font-bold">
                              Suggest linking to <span className="text-purple-400 underline underline-offset-4 decoration-purple-500/30">{suggestedTable}</span>
                            </div>
                          )}
                          {isActive && (
                            <div className="mt-4 space-y-4 ml-7 animate-in slide-in-from-top-4 duration-500">
                              <div className="space-y-2">
                                <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest block">Target Table</label>
                                <input
                                  type="text"
                                  value={linkTarget}
                                  onChange={(e) => setLinkTarget(e.target.value)}
                                  list={`target-${columnName}`}
                                  placeholder="Select table..."
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 transition-all shadow-inner"
                                />
                                <datalist id={`target-${columnName}`}>
                                  {allTableNames.map((t) => <option key={t} value={t} />)}
                                </datalist>
                              </div>
                              <div className="flex gap-3">
                                <button
                                  onClick={handleCreateVFK}
                                  disabled={linkLoading || !linkTarget.trim()}
                                  className="flex-1 text-[10px] font-black bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl py-2.5 cursor-pointer transition-all shadow-xl shadow-purple-900/40 active:scale-95"
                                >
                                  {linkLoading ? 'PROcessing...' : `CONFIRM LINK`}
                                </button>
                                <button
                                  onClick={() => { setLinkingColumn(null); setLinkTarget('') }}
                                  className="text-[10px] font-black text-slate-500 hover:text-white transition-colors px-3 uppercase tracking-widest"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Empty State Overlay */}
      {!selectedTable && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 backdrop-blur-md border border-white/10 shadow-glass px-4 py-2 rounded-full pointer-events-none animate-bounce">
          <p className="text-[10px] font-medium text-primary uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            點選資料表查看詳情
          </p>
        </div>
      )}
    </div>
  )
}
