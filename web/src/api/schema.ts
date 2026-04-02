import type { ERModel, VirtualForeignKey } from '@/types/er-model'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json: ApiResponse<T> = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message ?? 'Unknown error')
  }
  return json.data!
}

export const schemaApi = {
  getSchema: () => request<ERModel>('/api/schema'),

  addVirtualFK: (params: {
    tableName: string
    columns: string[]
    refTable: string
    refColumns: string[]
  }) => request<VirtualForeignKey[]>('/api/virtual-fk', {
    method: 'PUT',
    body: JSON.stringify(params),
  }),

  deleteVirtualFK: (id: string, tableName: string) =>
    request<{ deleted: string }>(`/api/virtual-fk/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ tableName }),
    }),

  confirmVirtualFK: (tableName: string, vfkId: string) =>
    request<{ confirmed: string }>('/api/virtual-fk/confirm', {
      method: 'POST',
      body: JSON.stringify({ tableName, vfkId }),
    }),

  ignoreVirtualFK: (tableName: string, vfkId: string) =>
    request<{ ignored: string }>('/api/virtual-fk/ignore', {
      method: 'POST',
      body: JSON.stringify({ tableName, vfkId }),
    }),

  updateGroups: (groups: ERModel['groups']) =>
    request<ERModel['groups']>('/api/groups', {
      method: 'PUT',
      body: JSON.stringify({ groups }),
    }),

  getSuggestions: () =>
    request<Array<{ tableName: string; vfk: VirtualForeignKey }>>('/api/suggestions'),

  exportSchema: (format: string) =>
    request<{ format: string; content: string }>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ format }),
    }),

  listExportFormats: () =>
    request<Array<{ name: string; label: string }>>('/api/export/formats'),
}
