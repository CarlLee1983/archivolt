import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useSchemaStore, tableMatchesFilter } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'
import { TimelinePanel } from '@/components/Timeline/TimelinePanel'
import { useRecordingStore } from '@/stores/recordingStore'
import { schemaApi } from '@/api/schema'
import type { Table } from '@/types/er-model'
import { useNavigate } from 'react-router-dom'

/* ─── SVG Icons ─── */

const Icon = ({ children, className = '', size = 16, strokeWidth = 2.5 }: { children: React.ReactNode, className?: string, size?: number, strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
)

const SearchIcon = () => (
  <Icon size={14}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
)

const ClearIcon = () => (
  <Icon size={14}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
)

const KeyIcon = () => (
  <Icon size={12} className="text-warning"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></Icon>
)

const LinkIcon = () => (
  <Icon size={12} className="text-primary"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Icon>
)

const PlusIcon = () => (
  <Icon size={14}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
)

const TerminalIcon = () => (
  <Icon size={14} className="text-primary"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></Icon>
)

/* ─── Helpers ─── */

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

/* ─── Page ─── */

function CanvasToolbar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  
  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-md px-1 py-1">
      <button onClick={() => zoomIn()} className="p-1.5 hover:bg-panel rounded text-text-dim hover:text-primary transition-colors cursor-pointer" title="Zoom In">
        <Icon size={14}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
      </button>
      <button onClick={() => zoomOut()} className="p-1.5 hover:bg-panel rounded text-text-dim hover:text-primary transition-colors cursor-pointer" title="Zoom Out">
        <Icon size={14}><line x1="5" y1="12" x2="19" y2="12" /></Icon>
      </button>
      <div className="w-px h-4 bg-border mx-1" />
      <button onClick={() => fitView({ padding: 0.2, duration: 800 })} className="p-1.5 hover:bg-panel rounded text-text-dim hover:text-primary transition-colors cursor-pointer" title="Fit View">
        <Icon size={14}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 12h10M12 7v10" /></Icon>
      </button>
    </div>
  )
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasPageInner />
    </ReactFlowProvider>
  )
}

function CanvasPageInner() {
  const navigate = useNavigate()
  const {
    model, loading, error, fetchSchema,
    visibleGroups, toggleGroup, setVisibleGroups,
    selectedTable, selectTable,
    tableFilter, setTableFilter,
    tableNameFilter, setTableNameFilter,
    refreshModel,
    focusMode, setFocusMode,
  } = useSchemaStore()

  const pendingVFKCount = useSchemaStore((s) => s.pendingVFKCount)
  const [isLeftOpen, setIsLeftOpen] = useState(true)
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

  const filteredTables = useMemo(() => {
    if (!model || !tableNameFilter.trim()) return []
    const kw = tableNameFilter.trim().toLowerCase()
    return Object.keys(model.tables)
      .filter((t) => t.toLowerCase().includes(kw))
      .sort()
  }, [model, tableNameFilter])

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

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-surface font-mono">
      <div className="terminal-window p-12 text-center space-y-6">
        <div className="text-warning text-4xl font-black tracking-widest">! CRITICAL_ERROR</div>
        <p className="text-text max-w-sm">{error}</p>
        <button onClick={() => fetchSchema()} className="px-8 py-3 bg-panel border border-border text-primary font-bold rounded-lg hover:border-primary transition-all">RETRY_PROTOCOL</button>
      </div>
    </div>
  )

  if (loading || !model) return (
    <div className="flex items-center justify-center h-screen bg-surface font-mono">
      <div className="space-y-4 text-center">
        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-primary animate-[scanning_1s_linear_infinite]" />
        </div>
        <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.4em]">Initializing_Data_Model...</p>
      </div>
    </div>
  )

  const selected = selectedTable ? model.tables[selectedTable] : null
  const allTableNames = Object.keys(model.tables)
  const unlinked = selected ? getUnlinkedColumns(selected, allTableNames) : []

  return (
    <div className="w-screen h-screen bg-surface bg-console-grid text-text font-sans overflow-hidden relative">
      {/* ── Center Canvas: Full Real Estate ── */}
      <div className="full-canvas-container">
        <ERCanvas />
      </div>

      {/* ── Navbar ── */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-panel border-b border-border z-50 px-8 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-8">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
            <span className="text-lg font-black tracking-tighter text-text-bright">ARCHIVOLT</span>
            <span className="text-text-muted">/</span>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Canvas</span>
          </button>
          
          <div className="h-6 w-px bg-border" />
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
              <button
                className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-primary/15 text-primary border border-primary/30 cursor-default"
              >
                Canvas
              </button>
              <button
                onClick={() => navigate('/review')}
                className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md text-text-muted hover:text-text transition-all cursor-pointer flex items-center gap-2"
              >
                Review
                {pendingVFKCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] bg-warning/20 text-warning border border-warning/30 rounded-full font-black">
                    {pendingVFKCount}
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={() => setFocusMode(!focusMode)}
              className={`flex items-center gap-3 px-4 py-1.5 rounded-md border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                focusMode ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(83,155,245,0.2)]' : 'bg-transparent border-border text-text-dim hover:border-text-muted'
              }`}
            >
              Focus_Mode
              <div className={`w-1.5 h-1.5 rounded-full ${focusMode ? 'bg-primary animate-pulse' : 'bg-slate-800'}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <CanvasToolbar />
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Search details..."
              className="bg-card border border-border rounded-md pl-10 pr-8 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-all w-48 lg:w-64"
            />
          </div>
        </div>
      </div>

      {/* ── Left Sidebar: Floating Drawer ── */}
      <div className={`floating-panel floating-panel-left w-72 flex flex-col z-[45] pointer-events-auto ${
        isLeftOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%-16px)] opacity-90'
      }`}>
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0 bg-panel/50">
          <div className="flex items-center gap-3">
            <TerminalIcon />
            <span className="text-[10px] font-black text-text-bright uppercase tracking-widest text-primary">Objects_Tree</span>
          </div>
          <button
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className="p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-primary transition-all active:scale-90 cursor-pointer"
          >
            <Icon size={18}>
              {isLeftOpen ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
            </Icon>
          </button>
        </div>

        {/* Table Name Filter */}
        {isLeftOpen && (
          <div className="px-4 py-3 border-b border-border bg-card/20 shrink-0">
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors pointer-events-none">
                <SearchIcon />
              </div>
              <input
                type="text"
                value={tableNameFilter}
                onChange={(e) => setTableNameFilter(e.target.value)}
                placeholder="Filter table name..."
                className="w-full bg-surface/50 border border-border rounded-md pl-10 pr-8 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-all shadow-inner"
              />
              {tableNameFilter && (
                <button 
                  onClick={() => setTableNameFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text cursor-pointer"
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Global Controls for Groups */}
        {isLeftOpen && (
          <div className="px-6 py-2 border-b border-border bg-card/30 flex items-center justify-between shrink-0">
            <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Visibility</span>
            <button
              onClick={() => {
                const ids = filteredGroups.map(([id]) => id)
                const allVisible = ids.every((id) => visibleGroups.has(id))
                const next = new Set(visibleGroups)
                for (const id of ids) allVisible ? next.delete(id) : next.add(id)
                setVisibleGroups(next)
              }}
              className="text-[9px] font-black text-primary hover:text-white transition-colors uppercase tracking-widest cursor-pointer"
            >
              {filteredGroups.every(([id]) => visibleGroups.has(id)) ? 'Hide_All' : 'Show_All'}
            </button>
          </div>
        )}

        {/* 捲動容器 - 加入 min-h-0 確保 overflow 生效 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar min-h-0 overscroll-contain">
          {tableNameFilter.trim() && (
            <div className="mb-4 space-y-1">
              <div className="px-2 mb-2 flex items-center justify-between">
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Matched_Tables</span>
                <span className="text-[9px] font-black text-text-muted">{filteredTables.length}</span>
              </div>
              {filteredTables.length > 0 ? (
                filteredTables.map((t) => (
                  <button
                    key={t}
                    onClick={() => selectTable(t)}
                    className={`w-full text-left rounded-lg px-4 py-2.5 transition-all font-mono border ${
                      selectedTable === t
                        ? 'bg-primary/10 border-primary text-primary shadow-[0_0_10px_rgba(83,155,245,0.1)]'
                        : 'text-text-dim hover:text-text hover:bg-white/[0.02] border-transparent'
                    }`}
                  >
                    <span className="text-[11px] font-bold truncate block">{t}</span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-4 text-center">
                  <span className="text-[10px] text-text-muted font-black uppercase tracking-widest">No_Results</span>
                </div>
              )}
              <div className="px-2 pt-4">
                <div className="h-px bg-border opacity-50" />
              </div>
              <div className="px-2 py-4 pb-2">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Groups</span>
              </div>
            </div>
          )}

          {filteredGroups.map(([id, group]) => {
            const isVisible = visibleGroups.has(id)
            return (
              <button
                key={id}
                onClick={() => toggleGroup(id)}
                className={`w-full text-left rounded-lg px-4 py-3 transition-all duration-300 font-mono flex-shrink-0 ${
                  isVisible
                    ? 'bg-card border border-border text-primary shadow-sm'
                    : 'text-text-dim hover:text-text hover:bg-white/[0.02] border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between pointer-events-none">
                  <span className="text-[12px] font-bold truncate pr-4">{group.name}</span>
                  <span className={`text-[10px] font-bold ${isVisible ? 'text-primary' : 'text-text-muted'}`}>{group.tables.length}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <TimelinePanel />

      {/* ── Right: Floating Detail Panel ── */}
      <div className={`floating-panel floating-panel-right w-96 flex flex-col ${
        selected ? 'translate-x-0' : 'translate-x-[calc(100%+24px)]'
      }`}>
        <div className="px-8 py-6 border-b border-border flex items-center justify-between shrink-0 bg-card/30">
          <div className="space-y-1 min-w-0">
            <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Inspection</h2>
            <div className="text-lg font-black font-mono text-text-bright tracking-tighter truncate">{selected?.name}</div>
          </div>
          <button onClick={() => selectTable(null)} className="p-2 text-text-muted hover:text-text-bright transition-colors cursor-pointer shrink-0">
            <ClearIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar font-mono">
          {selected && (
            <>
              {/* Properties */}
              <section className="space-y-4">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-4">
                  <span>METRICS</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border p-4 rounded-lg">
                    <div className="text-[9px] text-text-muted uppercase mb-1">Engine</div>
                    <div className="text-xs font-black text-text-bright">{selected.engine}</div>
                  </div>
                  <div className="bg-card border border-border p-4 rounded-lg">
                    <div className="text-[9px] text-text-muted uppercase mb-1">Rows</div>
                    <div className="text-xs font-black text-text-bright">{selected.rowCount.toLocaleString()}</div>
                  </div>
                </div>
              </section>

              {/* Fields */}
              <section className="space-y-4">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-4">
                  <span>SCHEMA</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {selected.columns.map((col) => (
                    <div key={col.name} className="flex items-center justify-between p-3 px-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">
                          {col.primaryKey === 1 && <KeyIcon />}
                        </div>
                        <span className={`text-[12px] truncate ${col.primaryKey === 1 ? 'text-warning font-bold' : 'text-text'}`}>{col.name}</span>
                      </div>
                      <span className="text-[10px] text-text-dim font-black uppercase tracking-tight shrink-0 opacity-80">{col.type.replace(/\(.*\)/, '')}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Relations */}
              {selected.foreignKeys.length > 0 && (
                <section className="space-y-4">
                  <div className="text-[10px] font-black text-success uppercase tracking-widest flex items-center gap-4">
                    <span>RELATIONS</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    {selected.foreignKeys.map((fk) => (
                      <div key={fk.name} className="p-4 bg-panel border border-border rounded-lg group hover:border-success/40 transition-all shadow-sm">
                        <div className="flex items-center gap-3 mb-2 font-black text-text-bright">
                          <LinkIcon /> {fk.columns[0]}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          REF <span onClick={() => selectTable(fk.refTable)} className="text-success hover:underline cursor-pointer font-bold">{fk.refTable}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Virtual Foreign Keys */}
              {selected.virtualForeignKeys.length > 0 && (
                <section className="space-y-4">
                  <div className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-4">
                    <span>VIRTUAL</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    {selected.virtualForeignKeys.map((vfk) => (
                      <div key={vfk.id} className="p-4 bg-primary/5 border border-primary/20 rounded-lg group hover:border-primary/40 transition-all shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 font-black text-text-bright">
                            <LinkIcon /> {vfk.columns[0]}
                          </div>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-primary/20 text-primary font-black border border-primary/20">{vfk.confidence}</span>
                        </div>
                        <div className="text-[11px] text-text-muted">
                          LINK <span onClick={() => selectTable(vfk.refTable)} className="text-primary hover:underline cursor-pointer font-bold">{vfk.refTable}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* AI Suggestions */}
              {unlinked.length > 0 && (
                <section className="space-y-4 pt-4 pb-12">
                  <div className="text-[10px] font-black text-warning uppercase tracking-widest flex items-center gap-4">
                    <span>INSIGHTS</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-4">
                    {unlinked.map(({ columnName, suggestedTable }) => {
                      const isActive = linkingColumn === columnName
                      return (
                        <div key={columnName} className={`rounded-xl transition-all duration-500 border p-5 ${
                          isActive ? 'bg-panel border-primary shadow-2xl scale-[1.02]' : 'bg-card/50 border-border hover:border-warning/30'
                        }`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <PlusIcon className="text-warning" />
                              <span className="text-xs font-black font-mono text-text-bright uppercase">{columnName}</span>
                            </div>
                            {!isActive && (
                              <button
                                onClick={() => {
                                  setLinkingColumn(columnName)
                                  setLinkTarget(suggestedTable ?? '')
                                }}
                                className="text-[9px] font-black bg-panel border border-border text-text hover:text-primary px-2 py-1 rounded transition-all active:scale-90"
                              >
                                CREATE
                              </button>
                            )}
                          </div>
                          
                          {isActive && (
                            <div className="mt-6 space-y-5 animate-in slide-in-from-top-4 duration-500">
                              <div className="space-y-2">
                                <label className="text-[9px] text-text-muted uppercase font-black block">Target</label>
                                <input
                                  type="text"
                                  value={linkTarget}
                                  onChange={(e) => setLinkTarget(e.target.value)}
                                  list={`target-${columnName}`}
                                  placeholder="Type..."
                                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text-bright focus:outline-none focus:border-primary transition-all"
                                />
                                <datalist id={`target-${columnName}`}>
                                  {allTableNames.map((t) => <option key={t} value={t} />)}
                                </datalist>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateVFK}
                                  disabled={linkLoading || !linkTarget.trim()}
                                  className="flex-1 text-[9px] font-black bg-primary hover:bg-blue-400 disabled:opacity-30 text-surface rounded py-2 active:scale-95 uppercase"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => { setLinkingColumn(null); setLinkTarget('') }}
                                  className="text-[9px] font-black text-text-dim hover:text-text-bright px-2"
                                >
                                  ESC
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
