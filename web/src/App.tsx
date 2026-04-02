import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSchemaStore, tableMatchesFilter } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'
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
    <div className="flex h-screen bg-surface text-text font-sans overflow-hidden">
      {/* ── Navbar ── */}
      <div className="fixed top-4 left-4 right-4 h-12 backdrop-blur-md border border-white/10 shadow-glass rounded-xl z-50 px-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <DatabaseIcon />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Archivolt</h1>
            <p className="text-[10px] text-muted leading-tight">
              {allTableNames.length} tables &middot; {Object.keys(model.groups).length} groups
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pointer-events-auto">
          {/* Focus Mode Toggle */}
          <button 
            onClick={() => setFocusMode(!focusMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
              focusMode 
                ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                : 'bg-white/5 border-white/5 text-muted hover:text-text-dim'
            }`}
            title={focusMode ? '關閉焦點模式' : '開啟焦點模式：僅顯示選中表及其關聯表'}
          >
            <TargetIcon />
            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">焦點模式</span>
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
              placeholder="搜尋..."
              className="bg-panel border border-white/5 rounded-lg pl-9 pr-8 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 w-48 md:w-64 transition-all"
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
      <div className="fixed top-20 left-4 bottom-4 w-64 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl flex flex-col z-40 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-dim uppercase tracking-wider">
              <LayersIcon />
              資料表群組
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const ids = filteredGroups.map(([id]) => id)
                  const allVisible = ids.every((id) => visibleGroups.has(id))
                  if (allVisible) {
                    const next = new Set(visibleGroups)
                    for (const id of ids) next.delete(id)
                    setVisibleGroups(next)
                  } else {
                    const next = new Set(visibleGroups)
                    for (const id of ids) next.add(id)
                    setVisibleGroups(next)
                  }
                }}
                className="text-[9px] font-bold text-muted hover:text-primary transition-colors uppercase"
              >
                {filteredGroups.every(([id]) => visibleGroups.has(id)) ? '全不選' : '全選'}
              </button>
            </div>
          </div>
          {focusMode && selectedTable && (
            <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded border border-primary/20 animate-in fade-in slide-in-from-left-2">
              <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
              <span className="text-[9px] text-primary font-bold uppercase truncate">
                聚焦於: {selectedTable}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
          {filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 opacity-30">
              <SearchIcon />
              <p className="text-[11px] mt-2">無符合結果</p>
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
                  className={`group w-full text-left rounded-xl px-3 py-2.5 mb-1 cursor-pointer transition-all duration-200 ${
                    isVisible
                      ? focusMode && selectedTable ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30' : 'bg-primary/20 text-white shadow-sm'
                      : 'hover:bg-white/5 text-text-dim opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate pr-2">
                      {group.name}
                    </span>
                    <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full ${
                      isVisible 
                        ? focusMode && selectedTable ? 'bg-purple-500/30 text-purple-200' : 'bg-primary/30 text-white' 
                        : 'bg-white/5 text-muted'
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

      {/* ── Right: Detail Panel ── */}
      <div className={`fixed top-20 right-4 bottom-4 w-80 backdrop-blur-md border border-white/10 shadow-glass rounded-2xl flex flex-col z-40 overflow-hidden transition-all duration-300 ${
        selected ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 pointer-events-none'
      }`}>
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/2">
          <h2 className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">Table Details</h2>
          <button onClick={() => selectTable(null)} className="text-muted hover:text-white transition-colors">
            <ClearIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {selected && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Table Name */}
              <div className="mb-6">
                <h3 className="text-lg font-bold font-mono text-white mb-1.5 break-all leading-tight">{selected.name}</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-muted uppercase tracking-wider">{selected.engine}</span>
                  <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-muted">{selected.rowCount.toLocaleString()} rows</span>
                </div>
              </div>

              {/* Columns */}
              <div className="mb-6">
                <div className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/5" />
                  Columns ({selected.columns.length})
                </div>
                <div className="space-y-1">
                  {selected.columns.map((col) => (
                    <div key={col.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {col.primaryKey === 1 ? (
                          <div className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]"><KeyIcon /></div>
                        ) : (
                          <div className="w-[10px]" />
                        )}
                        <span className={`text-xs font-mono truncate ${col.primaryKey === 1 ? 'text-red-400 font-semibold' : 'text-text-dim group-hover:text-text'}`}>
                          {col.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted whitespace-nowrap ml-2 opacity-60 group-hover:opacity-100">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreign Keys */}
              {selected.foreignKeys.length > 0 && (
                <div className="mb-6">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-emerald-500/10" />
                    Foreign Keys
                  </div>
                  <div className="space-y-1.5">
                    {selected.foreignKeys.map((fk) => (
                      <div key={fk.name} className="text-[11px] font-mono text-emerald-300/80 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 group cursor-default">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-emerald-500"><LinkIcon /></span>
                          <span className="font-semibold">{fk.columns[0]}</span>
                        </div>
                        <div className="text-[10px] text-muted flex items-center gap-1 ml-4">
                          <span>→</span>
                          <span className="text-text-dim group-hover:underline cursor-pointer" onClick={() => selectTable(fk.refTable)}>{fk.refTable}</span>
                          <span className="opacity-50">.{fk.refColumns[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Virtual Foreign Keys */}
              {selected.virtualForeignKeys.length > 0 && (
                <div className="mb-6">
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-amber-500/10" />
                    Virtual FK
                  </div>
                  <div className="space-y-1.5">
                    {selected.virtualForeignKeys.map((vfk) => (
                      <div key={vfk.id} className="text-[11px] font-mono text-amber-300/80 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10 group">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-500"><LinkIcon /></span>
                            <span className="font-semibold">{vfk.columns[0]}</span>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase">{vfk.confidence}</span>
                        </div>
                        <div className="text-[10px] text-muted flex items-center gap-1 ml-4">
                          <span>→</span>
                          <span className="text-text-dim group-hover:underline cursor-pointer" onClick={() => selectTable(vfk.refTable)}>{vfk.refTable}</span>
                          <span className="opacity-50">.{vfk.refColumns[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Unlinked Columns (VFK creation) ── */}
              {unlinked.length > 0 && (
                <div className="mt-8">
                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-purple-500/10" />
                    Suggestions
                  </div>
                  <div className="space-y-2">
                    {unlinked.map(({ columnName, suggestedTable }) => {
                      const isActive = linkingColumn === columnName
                      return (
                        <div key={columnName} className={`rounded-xl transition-all duration-300 ${
                          isActive ? 'bg-purple-600/10 border-purple-500/30' : 'bg-purple-500/5 border-purple-500/10 hover:border-purple-500/20'
                        } border p-3`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-purple-400"><PlusIcon /></span>
                              <span className="text-xs font-mono font-semibold text-purple-300">{columnName}</span>
                            </div>
                            {!isActive && (
                              <button
                                onClick={() => {
                                  setLinkingColumn(columnName)
                                  setLinkTarget(suggestedTable ?? '')
                                }}
                                className="text-[10px] bg-purple-500/10 hover:bg-purple-500 text-purple-400 hover:text-white px-2 py-0.5 rounded transition-all cursor-pointer"
                              >
                                建立
                              </button>
                            )}
                          </div>
                          {suggestedTable && !isActive && (
                            <div className="text-[10px] text-muted ml-5">
                              建議連結至 <span className="text-purple-400/80 underline decoration-purple-500/30 underline-offset-2">{suggestedTable}</span>
                            </div>
                          )}
                          {isActive && (
                            <div className="mt-3 space-y-2 ml-5 animate-in slide-in-from-top-2 duration-300">
                              <div>
                                <label className="text-[9px] text-muted uppercase font-bold tracking-wider block mb-1">Target Table</label>
                                <input
                                  type="text"
                                  value={linkTarget}
                                  onChange={(e) => setLinkTarget(e.target.value)}
                                  list={`target-${columnName}`}
                                  placeholder="Type table name..."
                                  className="w-full bg-surface/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-text placeholder-white/20 focus:outline-none focus:border-purple-500 transition-colors"
                                />
                                <datalist id={`target-${columnName}`}>
                                  {allTableNames.map((t) => <option key={t} value={t} />)}
                                </datalist>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateVFK}
                                  disabled={linkLoading || !linkTarget.trim()}
                                  className="flex-1 text-[10px] font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg px-2 py-2 cursor-pointer transition-all shadow-lg shadow-purple-900/20"
                                >
                                  {linkLoading ? 'Creating...' : `Link to ${linkTarget || '...'}`}
                                </button>
                                <button
                                  onClick={() => { setLinkingColumn(null); setLinkTarget('') }}
                                  className="text-[10px] text-muted hover:text-white transition-colors px-2"
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
