import { create } from 'zustand'
import type { ERModel } from '@/types/er-model'
import { schemaApi } from '@/api/schema'

function countPending(model: ERModel): number {
  let count = 0
  for (const table of Object.values(model.tables)) {
    count += table.virtualForeignKeys.filter(v => v.confidence === 'auto-suggested').length
  }
  return count
}

interface SchemaState {
  model: ERModel | null
  selectedTable: string | null
  visibleGroups: Set<string>
  tableFilter: string
  tableNameFilter: string
  focusMode: boolean
  loading: boolean
  error: string | null
  pendingVFKCount: number
  fetchSchema: () => Promise<void>
  selectTable: (name: string | null) => void
  toggleGroup: (groupId: string) => void
  setVisibleGroups: (groupIds: Set<string>) => void
  setTableFilter: (filter: string) => void
  setTableNameFilter: (filter: string) => void
  setFocusMode: (focused: boolean) => void
  refreshModel: (model: ERModel) => void
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  model: null,
  selectedTable: null,
  visibleGroups: new Set<string>(),
  tableFilter: '',
  tableNameFilter: '',
  focusMode: false,
  loading: false,
  error: null,
  pendingVFKCount: 0,

  fetchSchema: async () => {
    set({ loading: true, error: null })
    try {
      const model = await schemaApi.getSchema()
      const allGroups = new Set(Object.keys(model.groups))
      set({ model, visibleGroups: allGroups, loading: false, pendingVFKCount: countPending(model) })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  selectTable: (name) => set({ selectedTable: name }),

  toggleGroup: (groupId) => {
    const { visibleGroups } = get()
    const next = new Set(visibleGroups)
    if (next.has(groupId)) {
      next.delete(groupId)
    } else {
      next.add(groupId)
    }
    set({ visibleGroups: next })
  },

  setVisibleGroups: (groupIds) => set({ visibleGroups: groupIds }),

  setTableFilter: (filter) => set({ tableFilter: filter }),

  setTableNameFilter: (filter) => set({ tableNameFilter: filter }),

  setFocusMode: (focused) => set({ focusMode: focused }),

  refreshModel: (model) => set({ model, pendingVFKCount: countPending(model) }),
}))

/** Check if a table matches the keyword by name or column names */
export function tableMatchesFilter(
  tableName: string,
  keyword: string,
  tables: ERModel['tables'],
): boolean {
  if (!keyword) return true
  if (tableName.toLowerCase().includes(keyword)) return true
  const table = tables[tableName]
  if (!table) return false
  return table.columns.some((col) => col.name.toLowerCase().includes(keyword))
}

/** Get tables directly related to the target table (FK or VFK, excluding ignored) */
export function getNeighborTables(tableName: string, model: ERModel): Set<string> {
  const neighbors = new Set<string>([tableName])
  const table = model.tables[tableName]
  if (!table) return neighbors

  // Outgoing relations
  table.foreignKeys.forEach(fk => neighbors.add(fk.refTable))
  table.virtualForeignKeys.forEach(vfk => {
    if (vfk.confidence !== 'ignored') neighbors.add(vfk.refTable)
  })

  // Incoming relations (scan all other tables)
  Object.entries(model.tables).forEach(([name, otherTable]) => {
    const isIncoming = otherTable.foreignKeys.some(fk => fk.refTable === tableName) ||
                      otherTable.virtualForeignKeys.some(vfk => vfk.confidence !== 'ignored' && vfk.refTable === tableName)
    if (isIncoming) neighbors.add(name)
  })

  return neighbors
}
