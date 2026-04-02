import { create } from 'zustand'
import type { ERModel } from '@/types/er-model'
import { schemaApi } from '@/api/schema'

interface SchemaState {
  model: ERModel | null
  selectedTable: string | null
  visibleGroups: Set<string>
  loading: boolean
  error: string | null
  fetchSchema: () => Promise<void>
  selectTable: (name: string | null) => void
  toggleGroup: (groupId: string) => void
  refreshModel: (model: ERModel) => void
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  model: null,
  selectedTable: null,
  visibleGroups: new Set<string>(),
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

  refreshModel: (model) => set({ model }),
}))
