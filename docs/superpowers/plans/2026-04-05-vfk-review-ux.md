# VFK Review UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立以「審查確認」為中心的 Review Tab，讓使用者能高效處理系統自動推算的 Virtual FK 建議。

**Architecture:** 擴充 `confidence` 型別加入 `'ignored'` 狀態；修改後端 `ignoreSuggestion` 從刪除改為標記；新增獨立 `ReviewPage`（含待審查 / 已確認 / 已忽略三個 sub-tab），透過 react-router-dom 掛在 `/review` 路由；CanvasPage 頂部 navbar 加入 Review Tab badge。

**Tech Stack:** React + TypeScript + Tailwind CSS + react-router-dom + Bun + bun:test + ReactFlow（用於「在畫布定位」互動）

---

## File Map

### 修改
- `src/Modules/Schema/Domain/ERModel.ts` — 擴充 `confidence` 型別
- `src/Modules/Schema/Application/Services/VirtualFKService.ts` — 修改 `ignoreSuggestion`，新增 `restoreIgnored`
- `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` — 新增 `restoreVirtualFK`
- `src/Modules/Schema/Presentation/Routes/Schema.routes.ts` — 新增 restore 路由
- `web/src/types/er-model.ts` — 擴充 `confidence` 型別
- `web/src/components/Canvas/edges.ts` — 跳過 `confidence === 'ignored'`
- `web/src/stores/schemaStore.ts` — 新增 `pendingVFKCount` selector
- `web/src/api/schema.ts` — 新增 `restoreVirtualFK`
- `web/src/main.tsx` — 新增 `/review` 路由
- `web/src/pages/CanvasPage.tsx` — navbar 加入 Review Tab badge

### 新增
- `src/Modules/Schema/Application/Services/VirtualFKService.test.ts` — 後端服務單元測試
- `web/src/pages/ReviewPage.tsx` — Review 主頁（含三個 sub-tab）
- `web/src/components/Review/SuggestionRow.tsx` — 單條待審查建議列

---

## Task 1: 擴充 confidence 型別（後端 + 前端）

**Files:**
- Modify: `src/Modules/Schema/Domain/ERModel.ts`
- Modify: `web/src/types/er-model.ts`

- [ ] **Step 1: 修改後端 `ERModel.ts` 的 `VirtualForeignKey` 型別**

```typescript
// src/Modules/Schema/Domain/ERModel.ts
export interface VirtualForeignKey {
  readonly id: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
  readonly confidence: 'manual' | 'auto-suggested' | 'ignored'  // 新增 'ignored'
  readonly createdAt: Date
}

// createVirtualFK 的 confidence 參數型別也需更新
export function createVirtualFK(
  columns: string[],
  refTable: string,
  refColumns: string[],
  confidence: 'manual' | 'auto-suggested' | 'ignored' = 'manual',
): VirtualForeignKey {
  const id = `vfk_${Date.now()}_${_counter++}`
  return {
    id,
    columns,
    refTable,
    refColumns,
    confidence,
    createdAt: new Date(),
  }
}
```

- [ ] **Step 2: 修改前端 `er-model.ts` 的 `VirtualForeignKey` 型別**

```typescript
// web/src/types/er-model.ts
export interface VirtualForeignKey {
  id: string
  columns: string[]
  refTable: string
  refColumns: string[]
  confidence: 'manual' | 'auto-suggested' | 'ignored'  // 新增 'ignored'
  createdAt: string
}
```

- [ ] **Step 3: 確認 TypeScript 型別檢查通過**

```bash
bun run check
```

預期：無型別錯誤（可能有短暫的 downstream 警告，Task 2 會修正）

- [ ] **Step 4: Commit**

```bash
git add src/Modules/Schema/Domain/ERModel.ts web/src/types/er-model.ts
git commit -m "feat: [vfk] 擴充 confidence 型別加入 'ignored' 狀態"
```

---

## Task 2: 修改 ignoreSuggestion + 新增 restoreIgnored（後端服務）

**Files:**
- Modify: `src/Modules/Schema/Application/Services/VirtualFKService.ts`
- Create: `src/Modules/Schema/Application/Services/VirtualFKService.test.ts`

- [ ] **Step 1: 寫失敗測試**

新增 `src/Modules/Schema/Application/Services/VirtualFKService.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test'
import {
  ignoreSuggestion,
  restoreIgnored,
  confirmSuggestion,
} from './VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(confidence: 'manual' | 'auto-suggested' | 'ignored'): ERModel {
  return {
    source: { system: 'mysql', database: 'test', importedAt: new Date(), dbcliVersion: '1.0' },
    tables: {
      orders: {
        name: 'orders',
        columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
        rowCount: 0,
        engine: 'InnoDB',
        primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence, createdAt: new Date() },
        ],
      },
      users: {
        name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [],
      },
    },
    groups: {},
  }
}

describe('ignoreSuggestion', () => {
  it('should mark VFK as ignored, not delete it', () => {
    const model = makeModel('auto-suggested')
    const result = ignoreSuggestion(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('ignored')
  })
})

describe('restoreIgnored', () => {
  it('should restore ignored VFK back to auto-suggested', () => {
    const model = makeModel('ignored')
    const result = restoreIgnored(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('auto-suggested')
  })
})

describe('confirmSuggestion', () => {
  it('should mark VFK as manual', () => {
    const model = makeModel('auto-suggested')
    const result = confirmSuggestion(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('manual')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
bun test src/Modules/Schema/Application/Services/VirtualFKService.test.ts
```

預期：`restoreIgnored` 失敗（函式不存在），`ignoreSuggestion` 失敗（目前刪除而非標記）

- [ ] **Step 3: 修改 `VirtualFKService.ts`**

```typescript
// src/Modules/Schema/Application/Services/VirtualFKService.ts
// 修改 ignoreSuggestion — 從刪除改為標記 'ignored'
export function ignoreSuggestion(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((v) =>
          v.id === vfkId ? { ...v, confidence: 'ignored' as const } : v,
        ),
      },
    },
  }
}

// 新增 restoreIgnored — 從 'ignored' 恢復為 'auto-suggested'
export function restoreIgnored(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((v) =>
          v.id === vfkId ? { ...v, confidence: 'auto-suggested' as const } : v,
        ),
      },
    },
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
bun test src/Modules/Schema/Application/Services/VirtualFKService.test.ts
```

預期：3 個測試全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Application/Services/VirtualFKService.ts src/Modules/Schema/Application/Services/VirtualFKService.test.ts
git commit -m "feat: [vfk] ignoreSuggestion 改為標記 ignored，新增 restoreIgnored"
```

---

## Task 3: 新增後端 restoreVirtualFK 端點

**Files:**
- Modify: `src/Modules/Schema/Presentation/Controllers/SchemaController.ts`
- Modify: `src/Modules/Schema/Presentation/Routes/Schema.routes.ts`

- [ ] **Step 1: 在 `SchemaController.ts` 加入 `restoreVirtualFK` 方法**

在現有 `ignoreVirtualFK` 方法之後新增：

```typescript
// src/Modules/Schema/Presentation/Controllers/SchemaController.ts
// 在 import 中加入 restoreIgnored
import { addVirtualFK, removeVirtualFK, confirmSuggestion, ignoreSuggestion, restoreIgnored } from '@/Modules/Schema/Application/Services/VirtualFKService'

// 在 ignoreVirtualFK 方法之後新增
async restoreVirtualFK(ctx: IHttpContext): Promise<Response> {
  const model = await this.repo.load()
  if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
  const body = await ctx.getBody<{ tableName: string; vfkId: string }>()
  try {
    const updated = restoreIgnored(model, body.tableName, body.vfkId)
    await this.repo.save(updated)
    return ctx.json(ApiResponse.success({ restored: body.vfkId }))
  } catch (error: any) {
    return ctx.json(ApiResponse.error('INVALID', error.message), 400)
  }
}
```

- [ ] **Step 2: 在 `Schema.routes.ts` 新增 restore 路由**

```typescript
// src/Modules/Schema/Presentation/Routes/Schema.routes.ts
export function registerSchemaRoutes(router: IModuleRouter, controller: SchemaController): void {
  router.group('/api', (r) => {
    r.get('/schema', (ctx) => controller.getSchema(ctx))
    r.put('/virtual-fk', (ctx) => controller.addVirtualFK(ctx))
    r.delete('/virtual-fk/:id', (ctx) => controller.deleteVirtualFK(ctx))
    r.post('/virtual-fk/confirm', (ctx) => controller.confirmVirtualFK(ctx))
    r.post('/virtual-fk/ignore', (ctx) => controller.ignoreVirtualFK(ctx))
    r.post('/virtual-fk/restore', (ctx) => controller.restoreVirtualFK(ctx))  // 新增
    r.put('/groups', (ctx) => controller.updateGroups(ctx))
    r.post('/groups/regroup', (ctx) => controller.regroup(ctx))
    r.get('/suggestions', (ctx) => controller.getSuggestions(ctx))
    r.post('/export', (ctx) => controller.exportSchema(ctx))
    r.get('/export/formats', (ctx) => controller.listExportFormats(ctx))
  })
}
```

- [ ] **Step 3: 執行型別檢查**

```bash
bun run check
```

預期：無錯誤

- [ ] **Step 4: Commit**

```bash
git add src/Modules/Schema/Presentation/Controllers/SchemaController.ts src/Modules/Schema/Presentation/Routes/Schema.routes.ts
git commit -m "feat: [api] 新增 POST /api/virtual-fk/restore 端點"
```

---

## Task 4: 前端 edges.ts 跳過 ignored + schemaStore 加 pendingVFKCount

**Files:**
- Modify: `web/src/components/Canvas/edges.ts`
- Modify: `web/src/stores/schemaStore.ts`

- [ ] **Step 1: 修改 `edges.ts`，在 VFK loop 中跳過 `'ignored'`**

```typescript
// web/src/components/Canvas/edges.ts
// 在 for (const vfk of table.virtualForeignKeys) 迴圈內開頭加入：
for (const vfk of table.virtualForeignKeys) {
  if (vfk.confidence === 'ignored') continue  // ← 新增這行
  const isManual = vfk.confidence === 'manual'
  // ... 其餘邏輯不變
}
```

完整修改後的 VFK 段落如下：

```typescript
for (const vfk of table.virtualForeignKeys) {
  if (vfk.confidence === 'ignored') continue
  const isManual = vfk.confidence === 'manual'
  const bothHighlighted = highlightTables
    ? highlightTables.has(table.name) && highlightTables.has(vfk.refTable)
    : false
  const dimmed = highlightTables ? !bothHighlighted : false
  const patternInfo = bothHighlighted && playbackPattern ? PATTERN_LABEL[playbackPattern] : null
  const baseColor = isManual ? '#a855f7' : '#f59e0b'

  edges.push({
    id: `vfk-${table.name}-${vfk.id}`,
    source: table.name,
    target: vfk.refTable,
    label: patternInfo
      ? `${vfk.columns[0]} [${patternInfo.text}]`
      : `${vfk.columns[0]}${isManual ? '' : ' ⚡'}`,
    style: {
      stroke: bothHighlighted && patternInfo ? patternInfo.color : baseColor,
      strokeWidth: bothHighlighted ? 3 : dimmed ? 1.5 : 2,
      strokeDasharray: isManual ? 'none' : '6 4',
      opacity: dimmed ? 0.15 : 1,
    },
    labelStyle: {
      fill: bothHighlighted && patternInfo ? patternInfo.color : baseColor,
      fontSize: 10,
    },
    type: 'default',
  })
}
```

- [ ] **Step 2: 在 `schemaStore.ts` 新增 `pendingVFKCount` selector**

在 `SchemaState` 介面新增欄位，並在 `create()` 中加入計算：

```typescript
// web/src/stores/schemaStore.ts
// 在 SchemaState 介面新增
pendingVFKCount: number

// 在 create() 初始值新增
pendingVFKCount: 0,

// 修改 fetchSchema 和 refreshModel，在更新 model 時同步計算
function countPending(model: ERModel): number {
  let count = 0
  for (const table of Object.values(model.tables)) {
    count += table.virtualForeignKeys.filter(v => v.confidence === 'auto-suggested').length
  }
  return count
}

// fetchSchema 成功時：
set({ model, visibleGroups: allGroups, loading: false, pendingVFKCount: countPending(model) })

// refreshModel：
refreshModel: (model) => set({ model, pendingVFKCount: countPending(model) }),
```

完整修改後的 `schemaStore.ts`：

```typescript
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

/** Get tables directly related to the target table (FK or VFK) */
export function getNeighborTables(tableName: string, model: ERModel): Set<string> {
  const neighbors = new Set<string>([tableName])
  const table = model.tables[tableName]
  if (!table) return neighbors

  table.foreignKeys.forEach(fk => neighbors.add(fk.refTable))
  table.virtualForeignKeys.forEach(vfk => {
    if (vfk.confidence !== 'ignored') neighbors.add(vfk.refTable)
  })

  Object.entries(model.tables).forEach(([name, otherTable]) => {
    const isIncoming = otherTable.foreignKeys.some(fk => fk.refTable === tableName) ||
                      otherTable.virtualForeignKeys.some(vfk => vfk.confidence !== 'ignored' && vfk.refTable === tableName)
    if (isIncoming) neighbors.add(name)
  })

  return neighbors
}
```

- [ ] **Step 3: 型別檢查**

```bash
bun run check
```

預期：無錯誤

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Canvas/edges.ts web/src/stores/schemaStore.ts
git commit -m "feat: [canvas] 跳過 ignored VFK 邊線，schemaStore 加入 pendingVFKCount"
```

---

## Task 5: 前端 API 客戶端新增 restoreVirtualFK

**Files:**
- Modify: `web/src/api/schema.ts`

- [ ] **Step 1: 在 `schema.ts` 加入 `restoreVirtualFK` 方法**

```typescript
// web/src/api/schema.ts — 在 ignoreVirtualFK 之後新增
restoreVirtualFK: (tableName: string, vfkId: string) =>
  request<{ restored: string }>('/api/virtual-fk/restore', {
    method: 'POST',
    body: JSON.stringify({ tableName, vfkId }),
  }),
```

完整的 `schemaApi` 物件應包含：

```typescript
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

  restoreVirtualFK: (tableName: string, vfkId: string) =>
    request<{ restored: string }>('/api/virtual-fk/restore', {
      method: 'POST',
      body: JSON.stringify({ tableName, vfkId }),
    }),

  updateGroups: (groups: ERModel['groups']) =>
    request<ERModel['groups']>('/api/groups', {
      method: 'PUT',
      body: JSON.stringify({ groups }),
    }),

  regroup: () =>
    request<ERModel['groups']>('/api/groups/regroup', {
      method: 'POST',
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
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/schema.ts
git commit -m "feat: [api] 前端 schemaApi 新增 restoreVirtualFK"
```

---

## Task 6: 建立 SuggestionRow 元件

**Files:**
- Create: `web/src/components/Review/SuggestionRow.tsx`

- [ ] **Step 1: 建立目錄**

```bash
mkdir -p web/src/components/Review
```

- [ ] **Step 2: 建立 `SuggestionRow.tsx`**

```tsx
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
```

- [ ] **Step 3: 型別檢查**

```bash
bun run check
```

預期：無錯誤

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Review/SuggestionRow.tsx
git commit -m "feat: [review] 新增 SuggestionRow 元件（待審查建議列）"
```

---

## Task 7: 建立 ReviewPage

**Files:**
- Create: `web/src/pages/ReviewPage.tsx`

- [ ] **Step 1: 建立 `ReviewPage.tsx`**

```tsx
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
    // If column mapping changed from original, delete old VFK and add new one, then confirm
    const original = model?.tables[tableName]?.virtualForeignKeys.find(v => v.id === vfkId)
    if (!original) return

    const columnChanged = original.columns[0] !== sourceColumn ||
                          original.refTable !== refTable ||
                          original.refColumns[0] !== refColumn

    if (columnChanged) {
      // Delete old VFK, add new manual VFK with updated columns
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
```

- [ ] **Step 2: 型別檢查**

```bash
bun run check
```

預期：無錯誤

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/ReviewPage.tsx
git commit -m "feat: [review] 新增 ReviewPage（待審查 / 已確認 / 已忽略三個 sub-tab）"
```

---

## Task 8: 串接路由 + CanvasPage 加入 Review Tab badge

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/pages/CanvasPage.tsx`

- [ ] **Step 1: 在 `main.tsx` 新增 `/review` 路由**

```tsx
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'
import ReviewPage from './pages/ReviewPage'  // 新增

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/review" element={<ReviewPage />} />  {/* 新增 */}
        <Route path="/report/:sessionId" element={<ReportViewer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 2: 在 `CanvasPage.tsx` navbar 新增 Review Tab badge**

在 CanvasPage.tsx 的 navbar 中，找到 `Focus_Mode` 按鈕所在的 `flex items-center gap-4` 區塊，在其前方加入 Tab 切換按鈕：

```tsx
// web/src/pages/CanvasPage.tsx
// 在 component 頂部加入
const pendingVFKCount = useSchemaStore((s) => s.pendingVFKCount)

// 在 navbar 的 "flex items-center gap-4" 中（Focus_Mode 之前）加入：
<div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
  <button
    className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-primary/15 text-primary border border-primary/30 cursor-pointer"
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
```

確保 `CanvasPage.tsx` 頂部已有 `import { useNavigate } from 'react-router-dom'`（已存在）。

- [ ] **Step 3: 執行完整型別檢查與測試**

```bash
bun run check && bun test
```

預期：無錯誤，所有測試通過

- [ ] **Step 4: 啟動開發伺服器手動驗證**

```bash
bun run dev:all
```

手動驗證清單：
- [ ] 開啟 http://localhost:5173/canvas，右上角出現「Canvas / Review」Tab
- [ ] Review badge 顯示待審查數量
- [ ] 點 Review Tab 跳轉到 `/review`
- [ ] 「待審查」Tab 列出所有 `auto-suggested` VFK
- [ ] 「✓ 確認」後該列移到「已確認」Tab，畫布橙色虛線變紫色實線
- [ ] 「✗ 忽略」後該列移到「已忽略」Tab，畫布橙色虛線消失
- [ ] 「↩ 復原」後已忽略項目回到「待審查」Tab
- [ ] 展開 `▶` 可修改欄位對應再確認
- [ ] `→ ?`（目標表不存在）強制展開
- [ ] 「⊞ 定位」點擊後跳到 Canvas，該表被選中並 highlight

- [ ] **Step 5: Commit**

```bash
git add web/src/main.tsx web/src/pages/CanvasPage.tsx
git commit -m "feat: [review] 串接路由 /review 並在 CanvasPage navbar 加入 Review Tab badge"
```
