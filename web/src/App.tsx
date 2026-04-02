import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSchemaStore, tableMatchesFilter } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'
import { schemaApi } from '@/api/schema'
import type { Table } from '@/types/er-model'

/* ─── SVG Icons (Lucide-style) ─── */

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

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
        <div className="text-center">
          <div className="text-4xl mb-3 text-red-500/30">!</div>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (loading || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface font-sans">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted">Loading schema...</p>
        </div>
      </div>
    )
  }

  const selected = selectedTable ? model.tables[selectedTable] : null
  const allTableNames = Object.keys(model.tables)
  const unlinked = selected ? getUnlinkedColumns(selected, allTableNames) : []

  return (
    <div className="flex h-screen bg-surface text-text font-sans">
      {/* ── Left: Group Panel ── */}
      <div className="w-64 bg-panel border-r border-border flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-1">
            <DatabaseIcon />
            <h1 className="text-sm font-semibold tracking-tight">Archivolt</h1>
          </div>
          <p className="text-xs text-muted">
            {allTableNames.length} tables &middot; {Object.keys(model.groups).length} groups
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="搜尋表名或欄位..."
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
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
          {keyword && (
            <p className="text-[10px] text-muted mt-1.5">
              {filteredGroups.length} / {Object.keys(model.groups).length} groups
            </p>
          )}
        </div>

        {/* Select All / None */}
        {filteredGroups.length > 0 && (
          <div className="px-4 pb-2 flex items-center gap-1">
            <button
              onClick={() => {
                const ids = filteredGroups.map(([id]) => id)
                const allVisible = ids.every((id) => visibleGroups.has(id))
                if (allVisible) {
                  // Deselect filtered groups
                  const next = new Set(visibleGroups)
                  for (const id of ids) next.delete(id)
                  setVisibleGroups(next)
                } else {
                  // Select filtered groups
                  const next = new Set(visibleGroups)
                  for (const id of ids) next.add(id)
                  setVisibleGroups(next)
                }
              }}
              className="text-[10px] text-muted hover:text-text cursor-pointer transition-colors"
            >
              {filteredGroups.every(([id]) => visibleGroups.has(id)) ? '全不選' : '全選'}
            </button>
            <span className="text-[10px] text-border">|</span>
            <button
              onClick={() => setVisibleGroups(new Set())}
              className="text-[10px] text-muted hover:text-text cursor-pointer transition-colors"
            >
              清空
            </button>
            <span className="text-[10px] text-border">|</span>
            <button
              onClick={() => {
                const only = new Set(filteredGroups.map(([id]) => id))
                setVisibleGroups(only)
              }}
              className="text-[10px] text-muted hover:text-text cursor-pointer transition-colors"
            >
              僅顯示
            </button>
          </div>
        )}

        {/* Group List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {filteredGroups.length === 0 && (
            <p className="text-xs text-muted text-center py-6">無符合的群組</p>
          )}
          {filteredGroups.map(([id, group]) => {
            const isVisible = visibleGroups.has(id)
            const matchedCount = keyword
              ? group.tables.filter((t) => tableMatchesFilter(t, keyword, model.tables)).length
              : group.tables.length
            return (
              <button
                key={id}
                onClick={() => toggleGroup(id)}
                className={`group w-full text-left rounded-lg px-3 py-2.5 mb-1 cursor-pointer transition-all duration-150 ${
                  isVisible
                    ? 'bg-primary/10 border border-primary/30 hover:bg-primary/15'
                    : 'bg-transparent border border-transparent hover:bg-surface/50 opacity-50 hover:opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isVisible ? 'text-text' : 'text-text-dim'}`}>
                    {group.name}
                  </span>
                  <span className={`text-[10px] font-mono tabular-nums ${isVisible ? 'text-primary' : 'text-muted'}`}>
                    {keyword ? `${matchedCount}/${group.tables.length}` : group.tables.length}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Center: ReactFlow Canvas ── */}
      <div className="flex-1">
        <ERCanvas />
      </div>

      {/* ── Right: Detail Panel ── */}
      <div className="w-72 bg-panel border-l border-border flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Details</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selected ? (
            <div>
              {/* Table Name */}
              <h3 className="text-sm font-semibold font-mono mb-1">{selected.name}</h3>
              <div className="flex items-center gap-2 text-[10px] text-muted mb-4">
                <span className="bg-surface px-1.5 py-0.5 rounded">{selected.engine}</span>
                <span>{selected.rowCount.toLocaleString()} rows</span>
              </div>

              {/* Columns */}
              <div className="mb-4">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Columns ({selected.columns.length})
                </div>
                <div className="space-y-0.5">
                  {selected.columns.map((col) => (
                    <div key={col.name} className="flex items-center justify-between py-1 px-2 rounded hover:bg-surface/50 transition-colors">
                      <span className="text-xs font-mono flex items-center gap-1.5">
                        {col.primaryKey === 1 && <span className="text-red-400"><KeyIcon /></span>}
                        <span className={col.primaryKey === 1 ? 'text-red-400' : 'text-text-dim'}>{col.name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-muted">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreign Keys */}
              {selected.foreignKeys.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <LinkIcon /> Foreign Keys ({selected.foreignKeys.length})
                  </div>
                  <div className="space-y-1">
                    {selected.foreignKeys.map((fk) => (
                      <div key={fk.name} className="text-xs font-mono text-text-dim px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                        {fk.columns[0]} <span className="text-muted">→</span> {fk.refTable}.{fk.refColumns[0]}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Virtual Foreign Keys */}
              {selected.virtualForeignKeys.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <LinkIcon /> Virtual FK ({selected.virtualForeignKeys.length})
                  </div>
                  <div className="space-y-1">
                    {selected.virtualForeignKeys.map((vfk) => (
                      <div key={vfk.id} className="text-xs font-mono text-text-dim px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10">
                        <div>
                          {vfk.columns[0]} <span className="text-muted">→</span> {vfk.refTable}.{vfk.refColumns[0]}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">{vfk.confidence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Unlinked Columns (VFK creation) ── */}
              {unlinked.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <PlusIcon /> 可建立關聯 ({unlinked.length})
                  </div>
                  <div className="space-y-1.5">
                    {unlinked.map(({ columnName, suggestedTable }) => {
                      const isActive = linkingColumn === columnName
                      return (
                        <div key={columnName} className="rounded bg-purple-500/5 border border-purple-500/10 px-2 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-purple-300">{columnName}</span>
                            {!isActive && (
                              <button
                                onClick={() => {
                                  setLinkingColumn(columnName)
                                  setLinkTarget(suggestedTable ?? '')
                                }}
                                className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer transition-colors"
                              >
                                建立關聯
                              </button>
                            )}
                          </div>
                          {suggestedTable && !isActive && (
                            <div className="text-[10px] text-muted mt-0.5">
                              建議目標：<span className="text-text-dim">{suggestedTable}</span>
                            </div>
                          )}
                          {isActive && (
                            <div className="mt-2 space-y-1.5">
                              <div>
                                <label className="text-[10px] text-muted block mb-1">目標資料表</label>
                                <input
                                  type="text"
                                  value={linkTarget}
                                  onChange={(e) => setLinkTarget(e.target.value)}
                                  list={`target-${columnName}`}
                                  placeholder="輸入資料表名稱..."
                                  className="w-full bg-surface border border-border rounded px-2 py-1 text-xs font-mono text-text placeholder-muted focus:outline-none focus:border-primary transition-colors"
                                />
                                <datalist id={`target-${columnName}`}>
                                  {allTableNames.map((t) => <option key={t} value={t} />)}
                                </datalist>
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={handleCreateVFK}
                                  disabled={linkLoading || !linkTarget.trim()}
                                  className="flex-1 text-[10px] bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded px-2 py-1 cursor-pointer transition-colors"
                                >
                                  {linkLoading ? '建立中...' : `→ ${linkTarget || '...'}.id`}
                                </button>
                                <button
                                  onClick={() => { setLinkingColumn(null); setLinkTarget('') }}
                                  className="text-[10px] text-muted hover:text-text cursor-pointer px-1.5 transition-colors"
                                >
                                  取消
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
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <DatabaseIcon />
              <p className="text-xs mt-2">點選表格查看詳情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
