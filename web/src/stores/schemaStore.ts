import { create } from 'zustand'
import type { ERModel } from '@/types/er-model'
import { schemaApi } from '@/api/schema'

interface SchemaState {
  model: ERModel | null
  selectedTable: string | null
  visibleGroups: Set<string>
  tableFilter: string
  focusMode: boolean
  loading: boolean
  error: string | null
  fetchSchema: () => Promise<void>
  selectTable: (name: string | null) => void
  toggleGroup: (groupId: string) => void
  setVisibleGroups: (groupIds: Set<string>) => void
  setTableFilter: (filter: string) => void
  setFocusMode: (focused: boolean) => void
  refreshModel: (model: ERModel) => void
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  model: null,
  selectedTable: null,
  visibleGroups: new Set<string>(),
  tableFilter: '',
  focusMode: false,
  loading: false,
  error: null,

  fetchSchema: async () => {
    set({ loading: true, error: null })
    try {
      const model = await schemaApi.getSchema()
      const allGroups = new Set(Object.keys(model.groups))
      set({ model, visibleGroups: allGroups, loading: false })
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

  setFocusMode: (focused) => set({ focusMode: focused }),

  refreshModel: (model) => set({ model }),
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

/** Get tables directly related to the target table (FK or VFK) */
export function getNeighborTables(tableName: string, model: ERModel): Set<string> {
  const neighbors = new Set<string>([tableName])
  const table = model.tables[tableName]
  if (!table) return neighbors

  // Outgoing relations
  table.foreignKeys.forEach(fk => neighbors.add(fk.refTable))
  table.virtualForeignKeys.forEach(vfk => neighbors.add(vfk.refTable))

  // Incoming relations (scan all other tables)
  Object.entries(model.tables).forEach(([name, otherTable]) => {
    const isIncoming = otherTable.foreignKeys.some(fk => fk.refTable === tableName) ||
                      otherTable.virtualForeignKeys.some(vfk => vfk.refTable === tableName)
    if (isIncoming) neighbors.add(name)
  })

  return neighbors
}
