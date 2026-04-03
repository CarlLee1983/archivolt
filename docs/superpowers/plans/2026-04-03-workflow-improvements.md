# 工作流改善實作計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 6 個工作流改善項目，從 Manifest→vFK 匯入到 PostgreSQL 支援

**Architecture:** 每個階段獨立成一個 commit，不互相依賴。後端遵循 DDD 分層（Domain→Application→Infrastructure→Presentation），前端使用 Zustand store + React 元件。

**Tech Stack:** Bun, TypeScript, Vitest, React 19, @xyflow/react 12, Zustand 5

---

## 階段 A：Manifest → vFK 匯入流程

### Task A1: applyInferredRelations 純函式

**Files:**
- Modify: `src/Modules/Schema/Application/Services/VirtualFKService.ts`
- Test: `test/unit/Application/VirtualFKService.test.ts`

- [ ] **Step 1: 寫失敗測試 — applyInferredRelations 基本套用**

```typescript
// test/unit/Application/VirtualFKService.test.ts — 在檔案尾端新增
import { applyInferredRelations } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

describe('applyInferredRelations', () => {
  const model: ERModel = {
    source: {
      system: 'mysql',
      database: 'shop',
      importedAt: new Date('2024-01-01'),
      dbcliVersion: '1.0.0',
    },
    tables: {
      orders: {
        name: 'orders',
        columns: [
          { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 100,
        engine: 'InnoDB',
        primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [],
      },
      users: {
        name: 'users',
        columns: [
          { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        ],
        rowCount: 50,
        engine: 'InnoDB',
        primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [],
      },
    },
    groups: {},
  }

  const relations: InferredRelation[] = [
    {
      sourceTable: 'orders',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'JOIN ON in chunk_1',
    },
  ]

  it('adds inferred relations as auto-suggested vFKs', () => {
    const { model: updated, added, skipped } = applyInferredRelations(model, relations, 'high')
    expect(added).toBe(1)
    expect(skipped).toBe(0)
    expect(updated.tables.orders.virtualForeignKeys).toHaveLength(1)
    expect(updated.tables.orders.virtualForeignKeys[0].columns).toEqual(['user_id'])
    expect(updated.tables.orders.virtualForeignKeys[0].refTable).toBe('users')
    expect(updated.tables.orders.virtualForeignKeys[0].confidence).toBe('auto-suggested')
  })

  it('skips duplicates when vFK already exists', () => {
    const modelWithVFK: ERModel = {
      ...model,
      tables: {
        ...model.tables,
        orders: {
          ...model.tables.orders,
          virtualForeignKeys: [{
            id: 'vfk_existing',
            columns: ['user_id'],
            refTable: 'users',
            refColumns: ['id'],
            confidence: 'manual',
            createdAt: new Date('2024-01-01'),
          }],
        },
      },
    }
    const { added, skipped } = applyInferredRelations(modelWithVFK, relations, 'high')
    expect(added).toBe(0)
    expect(skipped).toBe(1)
  })

  it('filters by minimum confidence', () => {
    const mixed: InferredRelation[] = [
      { ...relations[0], confidence: 'high' },
      { sourceTable: 'orders', sourceColumn: 'product_id', targetTable: 'products', targetColumn: 'id', confidence: 'low', evidence: 'co-occurring' },
    ]
    const { added } = applyInferredRelations(model, mixed, 'high')
    expect(added).toBe(1)
  })

  it('returns immutable model', () => {
    const { model: updated } = applyInferredRelations(model, relations, 'high')
    expect(updated).not.toBe(model)
    expect(model.tables.orders.virtualForeignKeys).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Application/VirtualFKService.test.ts`
Expected: FAIL — `applyInferredRelations` is not exported

- [ ] **Step 3: 實作 applyInferredRelations**

在 `src/Modules/Schema/Application/Services/VirtualFKService.ts` 尾端新增：

```typescript
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

export interface ApplyResult {
  readonly model: ERModel
  readonly added: number
  readonly skipped: number
}

export function applyInferredRelations(
  model: ERModel,
  relations: readonly InferredRelation[],
  minConfidence: 'high' | 'medium' | 'low',
): ApplyResult {
  const minRank = CONFIDENCE_RANK[minConfidence]
  let current = model
  let added = 0
  let skipped = 0

  for (const rel of relations) {
    if (CONFIDENCE_RANK[rel.confidence] < minRank) {
      skipped++
      continue
    }

    const table = current.tables[rel.sourceTable]
    if (!table) {
      skipped++
      continue
    }

    const isDuplicate = table.virtualForeignKeys.some(
      (v) =>
        v.columns.includes(rel.sourceColumn) &&
        v.refTable === rel.targetTable &&
        v.refColumns.includes(rel.targetColumn),
    ) || table.foreignKeys.some(
      (fk) =>
        fk.columns.includes(rel.sourceColumn) &&
        fk.refTable === rel.targetTable &&
        fk.refColumns.includes(rel.targetColumn),
    )

    if (isDuplicate) {
      skipped++
      continue
    }

    current = addVirtualFK(current, {
      tableName: rel.sourceTable,
      columns: [rel.sourceColumn],
      refTable: rel.targetTable,
      refColumns: [rel.targetColumn],
    })
    // Override confidence to auto-suggested
    const updatedTable = current.tables[rel.sourceTable]
    const lastVFK = updatedTable.virtualForeignKeys[updatedTable.virtualForeignKeys.length - 1]
    current = {
      ...current,
      tables: {
        ...current.tables,
        [rel.sourceTable]: {
          ...updatedTable,
          virtualForeignKeys: updatedTable.virtualForeignKeys.map((v) =>
            v.id === lastVFK.id ? { ...v, confidence: 'auto-suggested' as const } : v,
          ),
        },
      },
    }
    added++
  }

  return { model: current, added, skipped }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Application/VirtualFKService.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Application/Services/VirtualFKService.ts test/unit/Application/VirtualFKService.test.ts
git commit -m "$(cat <<'EOF'
feat: [schema] 新增 applyInferredRelations 純函式

從 Manifest 推斷關係批次匯入為 vFK，支援信心度過濾與去重

🤖 Generated with Claude Code
EOF
)"
```

---

### Task A2: ApplyCommand CLI

**Files:**
- Create: `src/CLI/ApplyCommand.ts`
- Modify: `src/index.ts:27` (新增 apply 子指令)
- Test: `test/unit/CLI/ApplyCommand.test.ts`

- [ ] **Step 1: 寫失敗測試 — parseApplyArgs**

```typescript
// test/unit/CLI/ApplyCommand.test.ts
import { describe, it, expect } from 'vitest'
import { parseApplyArgs } from '@/CLI/ApplyCommand'

describe('parseApplyArgs', () => {
  it('parses session-id from first positional arg', () => {
    const args = parseApplyArgs(['apply', 'rec_123'])
    expect(args.sessionId).toBe('rec_123')
    expect(args.minConfidence).toBe('high')
    expect(args.dryRun).toBe(false)
    expect(args.auto).toBe(false)
  })

  it('parses --min-confidence flag', () => {
    const args = parseApplyArgs(['apply', 'rec_123', '--min-confidence', 'medium'])
    expect(args.minConfidence).toBe('medium')
  })

  it('parses --dry-run flag', () => {
    const args = parseApplyArgs(['apply', 'rec_123', '--dry-run'])
    expect(args.dryRun).toBe(true)
  })

  it('parses --auto flag', () => {
    const args = parseApplyArgs(['apply', 'rec_123', '--auto'])
    expect(args.auto).toBe(true)
  })

  it('throws if session-id is missing', () => {
    expect(() => parseApplyArgs(['apply'])).toThrow()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/CLI/ApplyCommand.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 ApplyCommand**

```typescript
// src/CLI/ApplyCommand.ts
import path from 'node:path'
import { createInterface } from 'node:readline'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { applyInferredRelations } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

export interface ApplyArgs {
  readonly sessionId: string
  readonly minConfidence: 'high' | 'medium' | 'low'
  readonly dryRun: boolean
  readonly auto: boolean
}

const VALID_CONFIDENCES = ['high', 'medium', 'low'] as const

export function parseApplyArgs(argv: string[]): ApplyArgs {
  const applyIdx = argv.indexOf('apply')
  const rest = argv.slice(applyIdx + 1)

  const sessionId = rest[0]
  if (!sessionId || sessionId.startsWith('--')) {
    throw new Error('Usage: archivolt apply <session-id> [--min-confidence high|medium|low] [--dry-run] [--auto]')
  }

  const confIdx = rest.indexOf('--min-confidence')
  const minConfidence = confIdx !== -1
    ? (rest[confIdx + 1] as ApplyArgs['minConfidence'])
    : 'high'

  if (!VALID_CONFIDENCES.includes(minConfidence)) {
    throw new Error(`Invalid confidence: "${minConfidence}". Available: ${VALID_CONFIDENCES.join(', ')}`)
  }

  const dryRun = rest.includes('--dry-run')
  const auto = rest.includes('--auto')

  return { sessionId, minConfidence, dryRun, auto }
}

function formatRelation(rel: InferredRelation, index: number, total: number): string {
  return `[${index + 1}/${total}] ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn}  (${rel.confidence}, ${rel.evidence})`
}

async function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

export async function runApplyCommand(argv: string[]): Promise<void> {
  const args = parseApplyArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')

  const recordingRepo = new RecordingRepository(recordingsDir)
  const schemaRepo = new JsonFileRepository(archivoltPath)

  const session = await recordingRepo.loadSession(args.sessionId)
  if (!session) {
    console.error(`Session not found: ${args.sessionId}`)
    process.exit(1)
  }

  const model = await schemaRepo.load()
  if (!model) {
    console.error('No schema loaded. Run import first.')
    process.exit(1)
  }

  const queries = await recordingRepo.loadQueries(args.sessionId)
  const markers = await recordingRepo.loadMarkers(args.sessionId)
  const analyzer = new ChunkAnalyzerService()
  const manifest = analyzer.analyze(session, queries, markers)

  const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }
  const minRank = CONFIDENCE_RANK[args.minConfidence]
  const eligible = manifest.inferredRelations.filter(
    (r) => CONFIDENCE_RANK[r.confidence] >= minRank,
  )

  if (eligible.length === 0) {
    console.log(`No inferred relations found (≥ ${args.minConfidence} confidence).`)
    return
  }

  console.log(`Found ${eligible.length} inferred relations (≥ ${args.minConfidence} confidence):\n`)

  if (args.dryRun) {
    for (let i = 0; i < eligible.length; i++) {
      console.log(`  ${formatRelation(eligible[i], i, eligible.length)}`)
    }
    console.log('\n(dry-run: no changes written)')
    return
  }

  if (args.auto) {
    const result = applyInferredRelations(model, eligible, args.minConfidence)
    await schemaRepo.save(result.model)
    console.log(`\nSummary: ${result.added} added, ${result.skipped} skipped/duplicates`)
    return
  }

  // Interactive mode
  const accepted: InferredRelation[] = []
  for (let i = 0; i < eligible.length; i++) {
    const rel = eligible[i]
    console.log(`\n  ${formatRelation(rel, i, eligible.length)}`)
    const answer = await askUser('      Accept? [Y/n/q] ')
    if (answer === 'q') {
      console.log('  Quit.')
      break
    }
    if (answer === '' || answer === 'y') {
      accepted.push(rel)
      console.log('      ✅ Added')
    } else {
      console.log('      ⏭ Skipped')
    }
  }

  if (accepted.length > 0) {
    const result = applyInferredRelations(model, accepted, 'low')
    await schemaRepo.save(result.model)
  }

  console.log(`\nSummary: ${accepted.length} added, ${eligible.length - accepted.length} skipped`)
}
```

- [ ] **Step 4: 在 index.ts 註冊 apply 子指令**

在 `src/index.ts` 第 27 行（`if (args[0] === 'analyze')` 之後）新增：

```typescript
  if (args[0] === 'apply') {
    const { runApplyCommand } = await import('@/CLI/ApplyCommand')
    await runApplyCommand(['apply', ...args.slice(1)])
    process.exit(0)
  }
```

- [ ] **Step 5: 執行測試確認通過**

Run: `bun run test -- test/unit/CLI/ApplyCommand.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/CLI/ApplyCommand.ts src/index.ts test/unit/CLI/ApplyCommand.test.ts
git commit -m "$(cat <<'EOF'
feat: [cli] 新增 archivolt apply 指令

支援從 Manifest 推斷關係匯入 vFK，含互動模式、--dry-run、--auto

🤖 Generated with Claude Code
EOF
)"
```

---

## 階段 B：vFK 建立時的 Column 選擇器

### Task B1: VFKDialog 元件

**Files:**
- Create: `web/src/components/Canvas/VFKDialog.tsx`
- Modify: `web/src/components/Canvas/ERCanvas.tsx:118-141`

- [ ] **Step 1: 建立 VFKDialog 元件**

```tsx
// web/src/components/Canvas/VFKDialog.tsx
import { useState, useMemo } from 'react'
import type { Table } from '@/types/er-model'

interface VFKDialogProps {
  sourceTable: Table
  targetTable: Table
  onConfirm: (sourceColumn: string, targetColumn: string) => void
  onCancel: () => void
}

function guessSourceColumn(source: Table, targetName: string): string | undefined {
  // Priority 1: target_name + _id
  const byName = source.columns.find(
    (c) => c.name === `${targetName}_id` || c.name === `${targetName.replace(/s$/, '')}_id`,
  )
  if (byName) return byName.name

  // Priority 2: any *_id not already an FK
  const fkColumns = new Set(source.foreignKeys.flatMap((fk) => fk.columns))
  const anyId = source.columns.find(
    (c) => c.name.endsWith('_id') && !fkColumns.has(c.name),
  )
  return anyId?.name
}

export function VFKDialog({ sourceTable, targetTable, onConfirm, onCancel }: VFKDialogProps) {
  const defaultSource = guessSourceColumn(sourceTable, targetTable.name)
  const [sourceCol, setSourceCol] = useState(defaultSource ?? '')
  const [targetCol, setTargetCol] = useState('id')

  const sourceOptions = useMemo(
    () => sourceTable.columns.map((c) => c.name),
    [sourceTable],
  )
  const targetOptions = useMemo(
    () => targetTable.columns.map((c) => c.name),
    [targetTable],
  )

  const isValid = sourceCol !== '' && targetCol !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-2xl shadow-glass p-6 w-96">
        <h3 className="text-sm font-semibold text-text mb-4">建立虛擬外鍵 (vFK)</h3>

        {/* Source */}
        <div className="mb-3">
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">
            {sourceTable.name}
          </label>
          <select
            value={sourceCol}
            onChange={(e) => setSourceCol(e.target.value)}
            className="w-full bg-surface/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-colors"
          >
            <option value="">選擇欄位...</option>
            {sourceOptions.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Arrow */}
        <div className="text-center text-muted text-lg mb-3">↓</div>

        {/* Target */}
        <div className="mb-5">
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">
            {targetTable.name}
          </label>
          <select
            value={targetCol}
            onChange={(e) => setTargetCol(e.target.value)}
            className="w-full bg-surface/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary transition-colors"
          >
            <option value="">選擇欄位...</option>
            {targetOptions.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-xs text-muted hover:text-text hover:bg-white/5 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={() => isValid && onConfirm(sourceCol, targetCol)}
            disabled={!isValid}
            className="px-4 py-1.5 rounded-lg text-xs bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 修改 ERCanvas.tsx 使用 VFKDialog**

替換 `web/src/components/Canvas/ERCanvas.tsx` 中的 `onConnect` 和相關邏輯。

在 `ERCanvasInner` 函式中：

1. 在 imports 新增：
```typescript
import { VFKDialog } from './VFKDialog'
```

2. 在 `const keyword = ...` 之後新增 state：
```typescript
  const [pendingConnection, setPendingConnection] = useState<{
    source: string
    target: string
  } | null>(null)
```

3. 替換 `onConnect` callback（第 118-141 行）：
```typescript
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setPendingConnection({ source: connection.source, target: connection.target })
  }, [])

  const handleVFKConfirm = useCallback(async (sourceColumn: string, targetColumn: string) => {
    if (!pendingConnection) return
    try {
      await schemaApi.addVirtualFK({
        tableName: pendingConnection.source,
        columns: [sourceColumn],
        refTable: pendingConnection.target,
        refColumns: [targetColumn],
      })
      const updated = await schemaApi.getSchema()
      refreshModel(updated)
    } catch (e) {
      console.error('Failed to add virtual FK:', e)
    }
    setPendingConnection(null)
  }, [pendingConnection, refreshModel])

  const handleVFKCancel = useCallback(() => {
    setPendingConnection(null)
  }, [])
```

4. 在 `<ReactFlow>` 元件之後、`</ReactFlowProvider>` 之前新增：
```tsx
      {pendingConnection && model && (
        <VFKDialog
          sourceTable={model.tables[pendingConnection.source]}
          targetTable={model.tables[pendingConnection.target]}
          onConfirm={handleVFKConfirm}
          onCancel={handleVFKCancel}
        />
      )}
```

5. 在 imports 加入 `useState`：
```typescript
import { useCallback, useEffect, useMemo, useState } from 'react'
```

- [ ] **Step 3: 手動測試**

Run: `bun run dev:all`
在畫布上從一個 table 拉線到另一個 table，應彈出 VFKDialog 而非直接建立 vFK。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Canvas/VFKDialog.tsx web/src/components/Canvas/ERCanvas.tsx
git commit -m "$(cat <<'EOF'
feat: [web] vFK 建立時彈出 Column 選擇器

取代自動猜測，讓使用者可手動選擇 source/target column

🤖 Generated with Claude Code
EOF
)"
```

---

## 階段 C：回放時畫布自動聚焦

### Task C1: recordingStore 新增 autoFocus state

**Files:**
- Modify: `web/src/stores/recordingStore.ts`

- [ ] **Step 1: 在 RecordingState interface 新增 autoFocus**

在 `web/src/stores/recordingStore.ts` 的 `RecordingState` interface（`playbackTimerId` 之後）新增：

```typescript
  autoFocus: boolean
  toggleAutoFocus: () => void
```

- [ ] **Step 2: 在 store 實作中新增 autoFocus**

在 `create<RecordingState>` 的 `playbackTimerId: null,` 之後新增：

```typescript
  autoFocus: true,
  toggleAutoFocus: () => set((s) => ({ autoFocus: !s.autoFocus })),
```

- [ ] **Step 3: Commit**

```bash
git add web/src/stores/recordingStore.ts
git commit -m "$(cat <<'EOF'
feat: [web] recordingStore 新增 autoFocus state

🤖 Generated with Claude Code
EOF
)"
```

---

### Task C2: PlaybackControls 新增 autoFocus toggle

**Files:**
- Modify: `web/src/components/Timeline/PlaybackControls.tsx`

- [ ] **Step 1: 新增 toggle 按鈕**

在 `web/src/components/Timeline/PlaybackControls.tsx` 的解構中加入 `autoFocus, toggleAutoFocus`：

```typescript
  const {
    chunks,
    activeChunkId,
    playing,
    playbackSpeed,
    autoFocus,
    play,
    pause,
    stepPrev,
    stepNext,
    setPlaybackSpeed,
    toggleAutoFocus,
  } = useRecordingStore()
```

在 `{/* Spacer */}` div 之後、`{/* Position indicator */}` 之前新增：

```tsx
      {/* Auto-focus toggle */}
      <button
        onClick={toggleAutoFocus}
        className={`p-1 rounded transition-colors cursor-pointer ${
          autoFocus ? 'text-primary' : 'text-muted hover:text-text-dim'
        }`}
        title={autoFocus ? '自動聚焦：開' : '自動聚焦：關'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      </button>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Timeline/PlaybackControls.tsx
git commit -m "$(cat <<'EOF'
feat: [web] PlaybackControls 新增自動聚焦 toggle 按鈕

🤖 Generated with Claude Code
EOF
)"
```

---

### Task C3: ERCanvas 回放時 fitBounds + edge R/W 標籤

**Files:**
- Modify: `web/src/components/Canvas/ERCanvas.tsx`
- Modify: `web/src/components/Canvas/edges.ts`

- [ ] **Step 1: edges.ts 新增回放模式 edge 標籤**

替換 `web/src/components/Canvas/edges.ts` 的完整內容：

```typescript
import type { Edge } from '@xyflow/react'
import type { ERModel } from '@/types/er-model'

type ChunkPattern = 'read' | 'write' | 'mixed' | null

const PATTERN_LABEL: Record<string, { text: string; color: string }> = {
  read: { text: 'R', color: '#22c55e' },
  write: { text: 'W', color: '#f59e0b' },
  mixed: { text: 'R/W', color: '#a855f7' },
}

export function buildEdges(
  model: ERModel,
  playbackPattern?: ChunkPattern,
  highlightTables?: Set<string> | null,
): Edge[] {
  const edges: Edge[] = []

  for (const table of Object.values(model.tables)) {
    for (const fk of table.foreignKeys) {
      const bothHighlighted = highlightTables
        ? highlightTables.has(table.name) && highlightTables.has(fk.refTable)
        : false
      const dimmed = highlightTables ? !bothHighlighted : false

      const patternInfo = bothHighlighted && playbackPattern
        ? PATTERN_LABEL[playbackPattern]
        : null

      edges.push({
        id: `fk-${table.name}-${fk.name}`,
        source: table.name,
        target: fk.refTable,
        label: patternInfo ? `${fk.columns[0]} [${patternInfo.text}]` : fk.columns[0],
        style: {
          stroke: bothHighlighted && patternInfo ? patternInfo.color : '#22c55e',
          strokeWidth: bothHighlighted ? 3 : dimmed ? 1.5 : 2,
          opacity: dimmed ? 0.15 : 1,
        },
        labelStyle: {
          fill: bothHighlighted && patternInfo ? patternInfo.color : '#22c55e',
          fontSize: 10,
        },
        type: 'default',
      })
    }

    for (const vfk of table.virtualForeignKeys) {
      const isManual = vfk.confidence === 'manual'
      const bothHighlighted = highlightTables
        ? highlightTables.has(table.name) && highlightTables.has(vfk.refTable)
        : false
      const dimmed = highlightTables ? !bothHighlighted : false

      const patternInfo = bothHighlighted && playbackPattern
        ? PATTERN_LABEL[playbackPattern]
        : null

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
  }

  return edges
}
```

- [ ] **Step 2: ERCanvas 使用新 buildEdges 參數 + fitBounds**

在 `web/src/components/Canvas/ERCanvas.tsx` 中：

1. 取得 activeChunk 的 pattern：

在 `const highlightTables = ...` 之後新增：

```typescript
  const activeChunk = useRecordingStore((s) => {
    if (!s.activeChunkId) return null
    return s.chunks.find((c) => c.id === s.activeChunkId) ?? null
  })
  const autoFocus = useRecordingStore((s) => s.autoFocus)
```

2. 更新 `layoutEdges` 的 `useMemo`，替換 `buildEdges` 呼叫和後續 edge 樣式邏輯：

將現有的 `const { layoutNodes, layoutEdges } = useMemo(...)` 替換為：

```typescript
  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!model) return { layoutNodes: [], layoutEdges: [] }
    const nodes: Node[] = visibleTables.map((name) => ({
      id: name,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: {
        table: model.tables[name],
        isLowDetail,
        isHighlighted: highlightTables ? highlightTables.has(name) : null,
        isDimmed: highlightTables ? !highlightTables.has(name) : false,
      } satisfies TableNodeData,
    }))
    const playbackPattern = activeChunk?.pattern ?? null
    const allEdges = buildEdges(model, playbackPattern, highlightTables).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target),
    )
    return { layoutNodes: autoLayout(nodes, allEdges), layoutEdges: allEdges }
  }, [model, visibleTables, isLowDetail, highlightTables, activeChunk?.pattern])
```

3. 新增 fitBounds effect（在現有的 selectedTable useEffect 之後）：

```typescript
  // Auto-focus: fit bounds to active chunk tables during playback
  useEffect(() => {
    if (!autoFocus || !highlightTables || highlightTables.size === 0) return
    const targetNodes = nodes.filter((n) => highlightTables.has(n.id))
    if (targetNodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of targetNodes) {
      const w = n.measured?.width ?? 200
      const h = n.measured?.height ?? 100
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }

    const padding = 80
    fitBounds(
      { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
      { duration: 600 },
    )
  }, [highlightTables, autoFocus, nodes, fitBounds])
```

4. 從 `useReactFlow()` 解構出 `fitBounds`：

```typescript
  const { setCenter, fitBounds } = useReactFlow()
```

- [ ] **Step 3: 手動測試**

Run: `bun run dev:all`
選擇一個 recording session，播放回放，確認：
- 畫布自動平移到活躍表群
- 高亮 edge 顯示 R/W 標籤
- toggle 按鈕可關閉自動聚焦

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Canvas/edges.ts web/src/components/Canvas/ERCanvas.tsx
git commit -m "$(cat <<'EOF'
feat: [web] 回放時畫布自動聚焦 + edge 讀寫標籤

自動 fitBounds 到活躍表群，edge 顯示 R/W 方向，可透過 toggle 關閉

🤖 Generated with Claude Code
EOF
)"
```

---

## 階段 D：分組鎖定機制

### Task D1: reimport 合併邏輯 — 保留 auto:false 分組

**Files:**
- Modify: `src/index.ts:56-74`
- Test: 新增整合測試邏輯於既有測試

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Domain/GroupingStrategy.test.ts — 在檔案尾端新增
import { mergeGroupsForReimport } from '@/Modules/Schema/Domain/GroupingStrategy'
import type { Group, Table } from '@/Modules/Schema/Domain/ERModel'

describe('mergeGroupsForReimport', () => {
  const tables: Record<string, Table> = {
    orders: { name: 'orders', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    users: { name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    products: { name: 'products', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    logs: { name: 'logs', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
  }

  it('preserves locked groups (auto: false) and recomputes the rest', () => {
    const existingGroups: Record<string, Group> = {
      '訂單': { name: '訂單', tables: ['orders'], auto: false },
      'Auto Group': { name: 'Auto Group', tables: ['users', 'products'], auto: true },
    }
    const result = mergeGroupsForReimport(tables, existingGroups, [])
    expect(result['訂單']).toBeDefined()
    expect(result['訂單'].tables).toContain('orders')
    expect(result['訂單'].auto).toBe(false)
    // orders should NOT appear in any auto group
    const autoGroups = Object.values(result).filter((g) => g.auto)
    for (const g of autoGroups) {
      expect(g.tables).not.toContain('orders')
    }
  })

  it('does not put locked tables in auto groups', () => {
    const existingGroups: Record<string, Group> = {
      '手動': { name: '手動', tables: ['orders', 'users'], auto: false },
    }
    const result = mergeGroupsForReimport(tables, existingGroups, [])
    const allAutoTables = Object.values(result)
      .filter((g) => g.auto)
      .flatMap((g) => [...g.tables])
    expect(allAutoTables).not.toContain('orders')
    expect(allAutoTables).not.toContain('users')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Domain/GroupingStrategy.test.ts`
Expected: FAIL — `mergeGroupsForReimport` not exported

- [ ] **Step 3: 實作 mergeGroupsForReimport**

在 `src/Modules/Schema/Domain/GroupingStrategy.ts` 尾端新增：

```typescript
export function mergeGroupsForReimport(
  tables: Record<string, Table>,
  existingGroups: Record<string, Group>,
  suggestions: readonly SuggestedRelation[],
): Record<string, Group> {
  // 1. Preserve locked groups
  const locked: Record<string, Group> = {}
  const lockedTables = new Set<string>()

  for (const [name, group] of Object.entries(existingGroups)) {
    if (!group.auto) {
      // Only keep tables that still exist
      const validTables = group.tables.filter((t) => t in tables)
      if (validTables.length > 0) {
        locked[name] = { ...group, tables: validTables }
        for (const t of validTables) lockedTables.add(t)
      }
    }
  }

  // 2. Compute auto groups for remaining tables
  const remainingTables: Record<string, Table> = {}
  for (const [name, table] of Object.entries(tables)) {
    if (!lockedTables.has(name)) {
      remainingTables[name] = table
    }
  }

  const autoGroups = computeGroups(remainingTables, suggestions)

  // 3. Merge
  return { ...locked, ...autoGroups }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Domain/GroupingStrategy.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 更新 index.ts reimport 邏輯**

替換 `src/index.ts` 中的 reimport 區塊（`} else if (existingModel && reimport) {` 到對應的 `}`）：

```typescript
    } else if (existingModel && reimport) {
      const { mergeGroupsForReimport } = await import('@/Modules/Schema/Domain/GroupingStrategy')
      const { inferRelations } = await import('@/Modules/Schema/Domain/RelationInferrer')

      const freshModel = importSchema(dbcliJson)
      const mergedTables: Record<string, any> = {}
      for (const [name, freshTable] of Object.entries(freshModel.tables)) {
        const existing = existingModel.tables[name]
        mergedTables[name] = {
          ...freshTable,
          virtualForeignKeys: existing ? existing.virtualForeignKeys : freshTable.virtualForeignKeys,
        }
      }

      const suggestions = inferRelations(mergedTables)
      const mergedGroups = mergeGroupsForReimport(mergedTables, existingModel.groups, suggestions)

      const lockedCount = Object.values(mergedGroups).filter((g) => !g.auto).length
      const autoCount = Object.values(mergedGroups).filter((g) => g.auto).length

      await repo.save({
        ...freshModel,
        tables: mergedTables,
        groups: mergedGroups,
      })
      console.log(`✅ Schema reimported from ${inputPath} (annotations preserved)`)
      if (lockedCount > 0) {
        const lockedNames = Object.values(mergedGroups)
          .filter((g) => !g.auto)
          .map((g) => g.name)
          .join(', ')
        console.log(`🔒 Preserved ${lockedCount} locked groups: ${lockedNames}`)
      }
      console.log(`🔄 Re-computed ${autoCount} auto groups`)
    } else {
```

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Schema/Domain/GroupingStrategy.ts src/index.ts test/unit/Domain/GroupingStrategy.test.ts
git commit -m "$(cat <<'EOF'
feat: [schema] 分組鎖定機制 — reimport 保留 auto:false 分組

手動編輯的分組不被重新匯入覆蓋，只對未鎖定的表重新計算分組

🤖 Generated with Claude Code
EOF
)"
```

---

### Task D2: SchemaController updateGroups 設定 auto:false

**Files:**
- Modify: `src/Modules/Schema/Presentation/Controllers/SchemaController.ts:77-84`

- [ ] **Step 1: 修改 updateGroups 方法**

替換 `SchemaController.updateGroups` 方法：

```typescript
  async updateGroups(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    const body = await ctx.getBody<{ groups: ERModel['groups'] }>()

    // Mark all user-submitted groups as manually edited (auto: false)
    const markedGroups: ERModel['groups'] = {}
    for (const [key, group] of Object.entries(body.groups)) {
      markedGroups[key] = { ...group, auto: false }
    }

    const updated: ERModel = { ...model, groups: markedGroups }
    await this.repo.save(updated)
    return ctx.json(ApiResponse.success(updated.groups))
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/Modules/Schema/Presentation/Controllers/SchemaController.ts
git commit -m "$(cat <<'EOF'
feat: [schema] updateGroups API 自動標記 auto:false

使用者透過 API 編輯的分組標記為手動，reimport 時不覆蓋

🤖 Generated with Claude Code
EOF
)"
```

---

## 階段 E：Session 比較

### Task E1: SessionDiffService 核心邏輯

**Files:**
- Create: `src/Modules/Recording/Application/Services/SessionDiffService.ts`
- Test: `test/unit/Recording/Application/SessionDiffService.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Recording/Application/SessionDiffService.test.ts
import { describe, it, expect } from 'vitest'
import { diffManifests, type SessionDiff } from '@/Modules/Recording/Application/Services/SessionDiffService'
import type { OperationManifest } from '@/Modules/Recording/Domain/OperationManifest'

const baseManifest: OperationManifest = {
  sessionId: 'a',
  recordedAt: { start: 1000, end: 2000 },
  operations: [],
  tableMatrix: [
    { table: 'orders', readCount: 10, writeCount: 3, operationIndices: [0, 1] },
    { table: 'users', readCount: 5, writeCount: 0, operationIndices: [0] },
  ],
  inferredRelations: [
    { sourceTable: 'orders', sourceColumn: 'user_id', targetTable: 'users', targetColumn: 'id', confidence: 'high', evidence: 'JOIN' },
  ],
  stats: { totalChunks: 5, readOps: 3, writeOps: 1, mixedOps: 1, silenceSplit: 0 },
}

const comparedManifest: OperationManifest = {
  sessionId: 'b',
  recordedAt: { start: 3000, end: 4000 },
  operations: [],
  tableMatrix: [
    { table: 'orders', readCount: 8, writeCount: 3, operationIndices: [0] },
    { table: 'payments', readCount: 5, writeCount: 2, operationIndices: [1] },
  ],
  inferredRelations: [
    { sourceTable: 'orders', sourceColumn: 'user_id', targetTable: 'users', targetColumn: 'id', confidence: 'high', evidence: 'JOIN' },
    { sourceTable: 'payments', sourceColumn: 'order_id', targetTable: 'orders', targetColumn: 'id', confidence: 'high', evidence: 'JOIN' },
  ],
  stats: { totalChunks: 4, readOps: 2, writeOps: 1, mixedOps: 1, silenceSplit: 0 },
}

describe('diffManifests', () => {
  it('identifies added and removed tables', () => {
    const diff = diffManifests(baseManifest, comparedManifest)
    expect(diff.tables.added.map((t) => t.table)).toContain('payments')
    expect(diff.tables.removed.map((t) => t.table)).toContain('users')
  })

  it('identifies changed tables', () => {
    const diff = diffManifests(baseManifest, comparedManifest)
    const orders = diff.tables.changed.find((t) => t.table === 'orders')
    expect(orders).toBeDefined()
    expect(orders!.readDelta).toBe(-2)
    expect(orders!.writeDelta).toBe(0)
  })

  it('reports stats delta', () => {
    const diff = diffManifests(baseManifest, comparedManifest)
    expect(diff.stats.chunksDelta).toBe(-1)
  })

  it('identifies added and removed relations', () => {
    const diff = diffManifests(baseManifest, comparedManifest)
    expect(diff.relations.added).toHaveLength(1)
    expect(diff.relations.added[0].sourceTable).toBe('payments')
    expect(diff.relations.removed).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Recording/Application/SessionDiffService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 SessionDiffService**

```typescript
// src/Modules/Recording/Application/Services/SessionDiffService.ts
import type { OperationManifest, TableInvolvement, InferredRelation } from '@/Modules/Recording/Domain/OperationManifest'

export interface TableDiff {
  readonly table: string
  readonly readDelta: number
  readonly writeDelta: number
  readonly readA: number
  readonly writeA: number
  readonly readB: number
  readonly writeB: number
}

export interface SessionDiff {
  readonly sessionA: string
  readonly sessionB: string
  readonly tables: {
    readonly added: readonly TableInvolvement[]
    readonly removed: readonly TableInvolvement[]
    readonly changed: readonly TableDiff[]
  }
  readonly relations: {
    readonly added: readonly InferredRelation[]
    readonly removed: readonly InferredRelation[]
  }
  readonly stats: {
    readonly chunksA: number
    readonly chunksB: number
    readonly chunksDelta: number
    readonly queriesA: number
    readonly queriesB: number
    readonly queriesDelta: number
    readonly tablesA: number
    readonly tablesB: number
    readonly tablesDelta: number
  }
}

function relationKey(r: InferredRelation): string {
  return `${r.sourceTable}.${r.sourceColumn}->${r.targetTable}.${r.targetColumn}`
}

export function diffManifests(a: OperationManifest, b: OperationManifest): SessionDiff {
  const aTableMap = new Map(a.tableMatrix.map((t) => [t.table, t]))
  const bTableMap = new Map(b.tableMatrix.map((t) => [t.table, t]))

  const added: TableInvolvement[] = []
  const removed: TableInvolvement[] = []
  const changed: TableDiff[] = []

  for (const [table, involvement] of bTableMap) {
    if (!aTableMap.has(table)) {
      added.push(involvement)
    }
  }

  for (const [table, involvement] of aTableMap) {
    if (!bTableMap.has(table)) {
      removed.push(involvement)
    } else {
      const bInv = bTableMap.get(table)!
      if (involvement.readCount !== bInv.readCount || involvement.writeCount !== bInv.writeCount) {
        changed.push({
          table,
          readA: involvement.readCount,
          writeA: involvement.writeCount,
          readB: bInv.readCount,
          writeB: bInv.writeCount,
          readDelta: bInv.readCount - involvement.readCount,
          writeDelta: bInv.writeCount - involvement.writeCount,
        })
      }
    }
  }

  // Relations diff
  const aRelKeys = new Set(a.inferredRelations.map(relationKey))
  const bRelKeys = new Set(b.inferredRelations.map(relationKey))

  const addedRelations = b.inferredRelations.filter((r) => !aRelKeys.has(relationKey(r)))
  const removedRelations = a.inferredRelations.filter((r) => !bRelKeys.has(relationKey(r)))

  const totalQueriesA = a.stats.readOps + a.stats.writeOps + a.stats.mixedOps
  const totalQueriesB = b.stats.readOps + b.stats.writeOps + b.stats.mixedOps

  return {
    sessionA: a.sessionId,
    sessionB: b.sessionId,
    tables: { added, removed, changed },
    relations: { added: addedRelations, removed: removedRelations },
    stats: {
      chunksA: a.stats.totalChunks,
      chunksB: b.stats.totalChunks,
      chunksDelta: b.stats.totalChunks - a.stats.totalChunks,
      queriesA: totalQueriesA,
      queriesB: totalQueriesB,
      queriesDelta: totalQueriesB - totalQueriesA,
      tablesA: a.tableMatrix.length,
      tablesB: b.tableMatrix.length,
      tablesDelta: b.tableMatrix.length - a.tableMatrix.length,
    },
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Recording/Application/SessionDiffService.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/SessionDiffService.ts test/unit/Recording/Application/SessionDiffService.test.ts
git commit -m "$(cat <<'EOF'
feat: [recording] 新增 SessionDiffService — Session 比較核心邏輯

比較兩個 Manifest 的 table 存取差異、關係推斷差異、統計變化

🤖 Generated with Claude Code
EOF
)"
```

---

### Task E2: DiffMarkdownRenderer + DiffCommand

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer.ts`
- Create: `src/CLI/DiffCommand.ts`
- Modify: `src/index.ts`
- Test: `test/unit/CLI/DiffCommand.test.ts`

- [ ] **Step 1: 寫 DiffCommand 參數解析測試**

```typescript
// test/unit/CLI/DiffCommand.test.ts
import { describe, it, expect } from 'vitest'
import { parseDiffArgs } from '@/CLI/DiffCommand'

describe('parseDiffArgs', () => {
  it('parses two session ids', () => {
    const args = parseDiffArgs(['diff', 'rec_a', 'rec_b'])
    expect(args.sessionA).toBe('rec_a')
    expect(args.sessionB).toBe('rec_b')
    expect(args.format).toBe('md')
  })

  it('parses --format json', () => {
    const args = parseDiffArgs(['diff', 'rec_a', 'rec_b', '--format', 'json'])
    expect(args.format).toBe('json')
  })

  it('parses --stdout flag', () => {
    const args = parseDiffArgs(['diff', 'rec_a', 'rec_b', '--stdout'])
    expect(args.stdout).toBe(true)
  })

  it('throws if less than 2 session ids', () => {
    expect(() => parseDiffArgs(['diff', 'rec_a'])).toThrow()
    expect(() => parseDiffArgs(['diff'])).toThrow()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/CLI/DiffCommand.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 DiffMarkdownRenderer**

```typescript
// src/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer.ts
import type { SessionDiff } from '@/Modules/Recording/Application/Services/SessionDiffService'

function delta(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '0'
}

export function renderDiff(diff: SessionDiff): string {
  const lines: string[] = []

  lines.push(`## Session Diff: ${diff.sessionA} vs ${diff.sessionB}`)
  lines.push('')

  // Table access diff
  lines.push('### Table 存取差異')
  lines.push('')
  lines.push('| Table | A (read/write) | B (read/write) | 變化 |')
  lines.push('|-------|----------------|----------------|------|')

  for (const t of diff.tables.removed) {
    lines.push(`| ${t.table} | ${t.readCount} / ${t.writeCount} | — | 🗑 消失 |`)
  }
  for (const t of diff.tables.changed) {
    const changes: string[] = []
    if (t.readDelta !== 0) changes.push(`read ${delta(t.readDelta)}`)
    if (t.writeDelta !== 0) changes.push(`write ${delta(t.writeDelta)}`)
    lines.push(`| ${t.table} | ${t.readA} / ${t.writeA} | ${t.readB} / ${t.writeB} | ${changes.join(', ')} |`)
  }
  for (const t of diff.tables.added) {
    lines.push(`| ${t.table} | — | ${t.readCount} / ${t.writeCount} | 🆕 新增 |`)
  }
  lines.push('')

  // Relations diff
  if (diff.relations.added.length > 0 || diff.relations.removed.length > 0) {
    lines.push('### 關係推斷差異')
    lines.push('')
    for (const r of diff.relations.added) {
      lines.push(`- 🆕 ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.confidence})`)
    }
    for (const r of diff.relations.removed) {
      lines.push(`- 🗑 ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.confidence})`)
    }
    lines.push('')
  }

  // Stats
  lines.push('### 統計摘要')
  lines.push('')
  lines.push(`- Chunks: ${diff.stats.chunksA} → ${diff.stats.chunksB} (${delta(diff.stats.chunksDelta)})`)
  lines.push(`- Queries: ${diff.stats.queriesA} → ${diff.stats.queriesB} (${delta(diff.stats.queriesDelta)})`)
  lines.push(`- Tables: ${diff.stats.tablesA} → ${diff.stats.tablesB} (${delta(diff.stats.tablesDelta)})`)
  lines.push('')

  return lines.join('\n')
}
```

- [ ] **Step 4: 實作 DiffCommand**

```typescript
// src/CLI/DiffCommand.ts
import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { ChunkAnalyzerService } from '@/Modules/Recording/Application/Services/ChunkAnalyzerService'
import { diffManifests } from '@/Modules/Recording/Application/Services/SessionDiffService'
import { renderDiff } from '@/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer'

export interface DiffArgs {
  readonly sessionA: string
  readonly sessionB: string
  readonly format: 'md' | 'json'
  readonly output?: string
  readonly stdout: boolean
}

export function parseDiffArgs(argv: string[]): DiffArgs {
  const diffIdx = argv.indexOf('diff')
  const rest = argv.slice(diffIdx + 1)

  const positional = rest.filter((a) => !a.startsWith('--'))
  if (positional.length < 2) {
    throw new Error('Usage: archivolt diff <session-a> <session-b> [--format md|json] [--output path] [--stdout]')
  }

  const formatIdx = rest.indexOf('--format')
  const format = formatIdx !== -1 ? (rest[formatIdx + 1] as 'md' | 'json') : 'md'

  const outputIdx = rest.indexOf('--output')
  const altOutputIdx = rest.indexOf('-o')
  const output = outputIdx !== -1
    ? rest[outputIdx + 1]
    : altOutputIdx !== -1
      ? rest[altOutputIdx + 1]
      : undefined

  const stdout = rest.includes('--stdout')

  return { sessionA: positional[0], sessionB: positional[1], format, output, stdout }
}

export async function runDiffCommand(argv: string[]): Promise<void> {
  const args = parseDiffArgs(argv)

  const recordingsDir =
    process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
  const repo = new RecordingRepository(recordingsDir)
  const analyzer = new ChunkAnalyzerService()

  // Load both sessions
  const [sessionA, sessionB] = await Promise.all([
    repo.loadSession(args.sessionA),
    repo.loadSession(args.sessionB),
  ])
  if (!sessionA) { console.error(`Session not found: ${args.sessionA}`); process.exit(1) }
  if (!sessionB) { console.error(`Session not found: ${args.sessionB}`); process.exit(1) }

  const [queriesA, queriesB, markersA, markersB] = await Promise.all([
    repo.loadQueries(args.sessionA),
    repo.loadQueries(args.sessionB),
    repo.loadMarkers(args.sessionA),
    repo.loadMarkers(args.sessionB),
  ])

  const manifestA = analyzer.analyze(sessionA, queriesA, markersA)
  const manifestB = analyzer.analyze(sessionB, queriesB, markersB)
  const diff = diffManifests(manifestA, manifestB)

  if (args.format === 'json' || args.stdout) {
    const json = JSON.stringify(diff, null, 2)
    if (args.stdout) {
      console.log(json)
      return
    }
    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/diff-${args.sessionA}-${args.sessionB}.json`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(outPath, json, 'utf-8')
    console.log(`Diff (JSON) written to: ${outPath}`)
    return
  }

  const md = renderDiff(diff)
  if (args.output) {
    const dir = path.dirname(args.output)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await writeFile(args.output, md, 'utf-8')
    console.log(`Diff written to: ${args.output}`)
  } else {
    console.log(md)
  }
}
```

- [ ] **Step 5: 在 index.ts 註冊 diff 子指令**

在 `src/index.ts` 的 `apply` 子指令之後新增：

```typescript
  if (args[0] === 'diff') {
    const { runDiffCommand } = await import('@/CLI/DiffCommand')
    await runDiffCommand(['diff', ...args.slice(1)])
    process.exit(0)
  }
```

- [ ] **Step 6: 執行測試確認通過**

Run: `bun run test -- test/unit/CLI/DiffCommand.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer.ts src/CLI/DiffCommand.ts src/index.ts test/unit/CLI/DiffCommand.test.ts
git commit -m "$(cat <<'EOF'
feat: [cli] 新增 archivolt diff 指令

比較兩個 Session 的 table 存取、關係推斷、統計差異，支援 md/json 輸出

🤖 Generated with Claude Code
EOF
)"
```

---

## 階段 F：PostgreSQL 支援

### Task F1: PostgresProtocolParser

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser.ts`
- Test: `test/unit/Recording/Infrastructure/PostgresProtocolParser.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Recording/Infrastructure/PostgresProtocolParser.test.ts
import { describe, it, expect } from 'vitest'
import { PostgresProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser'

describe('PostgresProtocolParser', () => {
  const parser = new PostgresProtocolParser()

  describe('extractQuery', () => {
    it('extracts SQL from Query message (type Q)', () => {
      // PostgreSQL Query message: 'Q' (1 byte) + length (4 bytes BE) + sql + \0
      const sql = 'SELECT * FROM users'
      const sqlBuf = Buffer.from(sql + '\0', 'utf-8')
      const lengthBuf = Buffer.alloc(4)
      lengthBuf.writeUInt32BE(4 + sqlBuf.length, 0)
      const packet = Buffer.concat([Buffer.from('Q'), lengthBuf, sqlBuf])

      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe(sql)
    })

    it('extracts SQL from Parse message (type P)', () => {
      // Parse message: 'P' + length + stmt_name\0 + query\0 + param_count(2 bytes)
      const stmtName = '\0'
      const sql = 'SELECT * FROM orders WHERE id = $1'
      const body = Buffer.from(stmtName + sql + '\0', 'utf-8')
      const paramCount = Buffer.alloc(2)
      paramCount.writeUInt16BE(0, 0)
      const payload = Buffer.concat([body, paramCount])
      const lengthBuf = Buffer.alloc(4)
      lengthBuf.writeUInt32BE(4 + payload.length, 0)
      const packet = Buffer.concat([Buffer.from('P'), lengthBuf, payload])

      const result = parser.extractQuery(packet)
      expect(result).not.toBeNull()
      expect(result!.sql).toBe(sql)
    })

    it('returns null for non-query messages', () => {
      // Bind message: 'B'
      const packet = Buffer.from([0x42, 0, 0, 0, 4])
      expect(parser.extractQuery(packet)).toBeNull()
    })
  })

  describe('parseResponse', () => {
    it('parses CommandComplete message', () => {
      // CommandComplete: 'C' + length + tag\0
      const tag = 'SELECT 5\0'
      const tagBuf = Buffer.from(tag, 'utf-8')
      const lengthBuf = Buffer.alloc(4)
      lengthBuf.writeUInt32BE(4 + tagBuf.length, 0)
      const packet = Buffer.concat([Buffer.from('C'), lengthBuf, tagBuf])

      const result = parser.parseResponse(packet)
      expect(result.type).toBe('ok')
    })

    it('parses ErrorResponse message', () => {
      // ErrorResponse: 'E' + length + fields
      // Field: type(1 byte) + value\0, terminated by \0
      const fields = Buffer.from('SERROR\0MTEST error\0\0', 'utf-8')
      const lengthBuf = Buffer.alloc(4)
      lengthBuf.writeUInt32BE(4 + fields.length, 0)
      const packet = Buffer.concat([Buffer.from('E'), lengthBuf, fields])

      const result = parser.parseResponse(packet)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.data.message).toBe('TEST error')
      }
    })

    it('parses RowDescription as resultSet', () => {
      // RowDescription: 'T' + length + field_count(2 bytes) + ...
      const lengthBuf = Buffer.alloc(4)
      const fieldCount = Buffer.alloc(2)
      fieldCount.writeUInt16BE(3, 0)
      const payload = fieldCount
      lengthBuf.writeUInt32BE(4 + payload.length, 0)
      const packet = Buffer.concat([Buffer.from('T'), lengthBuf, payload])

      const result = parser.parseResponse(packet)
      expect(result.type).toBe('resultSet')
      if (result.type === 'resultSet') {
        expect(result.data.columnCount).toBe(3)
      }
    })
  })

  describe('isHandshakePhase', () => {
    it('detects AuthenticationOk (R message with 0 status)', () => {
      // AuthenticationOk: 'R' + length(8) + 0(4 bytes)
      const packet = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      expect(parser.isHandshakePhase(packet, true)).toBe(true)
    })

    it('returns false for client-side data', () => {
      const packet = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])
      expect(parser.isHandshakePhase(packet, false)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Recording/Infrastructure/PostgresProtocolParser.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 PostgresProtocolParser**

```typescript
// src/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser.ts
import type {
  IProtocolParser,
  ParsedQuery,
  ParsedServerResponse,
} from '@/Modules/Recording/Domain/ProtocolParser'

// PostgreSQL Frontend message types (client → server)
const MSG_QUERY = 0x51         // 'Q'
const MSG_PARSE = 0x50         // 'P'

// PostgreSQL Backend message types (server → client)
const MSG_COMMAND_COMPLETE = 0x43  // 'C'
const MSG_ERROR_RESPONSE = 0x45   // 'E'
const MSG_ROW_DESCRIPTION = 0x54  // 'T'
const MSG_AUTH = 0x52              // 'R'

export class PostgresProtocolParser implements IProtocolParser {
  extractQuery(data: Buffer): ParsedQuery | null {
    if (data.length < 5) return null
    const type = data[0]

    if (type === MSG_QUERY) {
      // Query: 'Q' + int32 length + string\0
      const length = data.readUInt32BE(1)
      const payload = data.subarray(5, 1 + length)
      const sql = payload.toString('utf-8').replace(/\0$/, '')
      return { sql }
    }

    if (type === MSG_PARSE) {
      // Parse: 'P' + int32 length + stmt_name\0 + query\0 + int16 param_count + ...
      const payload = data.subarray(5)
      // Find end of statement name (first \0)
      const nameEnd = payload.indexOf(0)
      if (nameEnd === -1) return null
      // Query starts after statement name \0
      const queryStart = nameEnd + 1
      const queryEnd = payload.indexOf(0, queryStart)
      if (queryEnd === -1) return null
      const sql = payload.subarray(queryStart, queryEnd).toString('utf-8')
      return { sql }
    }

    return null
  }

  parseResponse(data: Buffer): ParsedServerResponse {
    if (data.length < 5) return { type: 'unknown' }
    const type = data[0]

    if (type === MSG_COMMAND_COMPLETE) {
      // CommandComplete: 'C' + int32 length + tag\0
      const length = data.readUInt32BE(1)
      const tag = data.subarray(5, 1 + length).toString('utf-8').replace(/\0$/, '')
      const rowMatch = tag.match(/\d+$/)
      const affectedRows = rowMatch ? Number.parseInt(rowMatch[0], 10) : 0
      return { type: 'ok', affectedRows }
    }

    if (type === MSG_ERROR_RESPONSE) {
      // ErrorResponse: 'E' + int32 length + fields (type byte + string\0)* + \0
      const length = data.readUInt32BE(1)
      const payload = data.subarray(5, 1 + length)
      let message = 'Unknown error'
      let code = 0

      let offset = 0
      while (offset < payload.length) {
        const fieldType = payload[offset]
        if (fieldType === 0) break
        offset++
        const valueEnd = payload.indexOf(0, offset)
        if (valueEnd === -1) break
        const value = payload.subarray(offset, valueEnd).toString('utf-8')
        if (fieldType === 0x4d) message = value    // 'M' — Message
        if (fieldType === 0x43) {                   // 'C' — Code
          code = Number.parseInt(value, 10) || 0
        }
        offset = valueEnd + 1
      }

      return { type: 'error', data: { code, message } }
    }

    if (type === MSG_ROW_DESCRIPTION) {
      // RowDescription: 'T' + int32 length + int16 field_count + ...
      const fieldCount = data.readUInt16BE(5)
      return {
        type: 'resultSet',
        data: {
          columnCount: fieldCount,
          columns: [],
          rowCount: 0,
          rows: [],
        },
      }
    }

    return { type: 'unknown' }
  }

  isHandshakePhase(data: Buffer, fromServer: boolean): boolean {
    if (!fromServer) return false
    if (data.length < 9) return false
    // AuthenticationOk: 'R'(0x52) + int32(8) + int32(0)
    return data[0] === MSG_AUTH && data.readUInt32BE(5) === 0
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Recording/Infrastructure/PostgresProtocolParser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser.ts test/unit/Recording/Infrastructure/PostgresProtocolParser.test.ts
git commit -m "$(cat <<'EOF'
feat: [recording] 新增 PostgresProtocolParser

實作 IProtocolParser 介面，支援 PostgreSQL Query/Parse/CommandComplete/ErrorResponse

🤖 Generated with Claude Code
EOF
)"
```

---

### Task F2: ProtocolDetector + RecordCommand 整合

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Proxy/ProtocolDetector.ts`
- Modify: `src/CLI/RecordCommand.ts`
- Test: `test/unit/Recording/Infrastructure/ProtocolDetector.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Recording/Infrastructure/ProtocolDetector.test.ts
import { describe, it, expect } from 'vitest'
import { detectProtocol, resolveParser } from '@/Modules/Recording/Infrastructure/Proxy/ProtocolDetector'

describe('detectProtocol', () => {
  it('detects mysql from port 3306', () => {
    expect(detectProtocol({ targetPort: 3306 })).toBe('mysql')
  })

  it('detects postgres from port 5432', () => {
    expect(detectProtocol({ targetPort: 5432 })).toBe('postgres')
  })

  it('defaults to mysql for unknown ports', () => {
    expect(detectProtocol({ targetPort: 9999 })).toBe('mysql')
  })

  it('respects explicit override', () => {
    expect(detectProtocol({ targetPort: 3306, explicit: 'postgres' })).toBe('postgres')
  })

  it('detects from env driver', () => {
    expect(detectProtocol({ targetPort: 9999, envDriver: 'pgsql' })).toBe('postgres')
    expect(detectProtocol({ targetPort: 9999, envDriver: 'mysql' })).toBe('mysql')
  })
})

describe('resolveParser', () => {
  it('returns MysqlProtocolParser for mysql', () => {
    const parser = resolveParser('mysql')
    expect(parser.constructor.name).toBe('MysqlProtocolParser')
  })

  it('returns PostgresProtocolParser for postgres', () => {
    const parser = resolveParser('postgres')
    expect(parser.constructor.name).toBe('PostgresProtocolParser')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Recording/Infrastructure/ProtocolDetector.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 ProtocolDetector**

```typescript
// src/Modules/Recording/Infrastructure/Proxy/ProtocolDetector.ts
import type { IProtocolParser } from '@/Modules/Recording/Domain/ProtocolParser'
import { MysqlProtocolParser } from './MysqlProtocolParser'
import { PostgresProtocolParser } from './PostgresProtocolParser'

export type ProtocolType = 'mysql' | 'postgres'

const PORT_MAP: Record<number, ProtocolType> = {
  3306: 'mysql',
  5432: 'postgres',
}

const DRIVER_MAP: Record<string, ProtocolType> = {
  mysql: 'mysql',
  mariadb: 'mysql',
  pgsql: 'postgres',
  postgres: 'postgres',
  postgresql: 'postgres',
}

export function detectProtocol(params: {
  targetPort: number
  explicit?: ProtocolType
  envDriver?: string
}): ProtocolType {
  if (params.explicit) return params.explicit

  if (params.envDriver) {
    const mapped = DRIVER_MAP[params.envDriver.toLowerCase()]
    if (mapped) return mapped
  }

  return PORT_MAP[params.targetPort] ?? 'mysql'
}

export function resolveParser(protocol: ProtocolType): IProtocolParser {
  switch (protocol) {
    case 'postgres':
      return new PostgresProtocolParser()
    case 'mysql':
    default:
      return new MysqlProtocolParser()
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Recording/Infrastructure/ProtocolDetector.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 修改 RecordCommand 整合 ProtocolDetector**

在 `src/CLI/RecordCommand.ts` 中：

1. 在 `RecordArgs` interface 新增欄位：

```typescript
  readonly protocol?: 'mysql' | 'postgres'
```

2. 在 `parseRecordArgs` 中新增 `--protocol` 解析（在 `sessionId` 之前）：

```typescript
  const protocolIdx = rest.indexOf('--protocol')
  const protocol = protocolIdx !== -1
    ? (rest[protocolIdx + 1] as 'mysql' | 'postgres')
    : undefined

  return { subcommand, targetHost, targetPort, listenPort, fromEnv, sessionId, protocol }
```

3. 在 `runRecordCommand` 的 `case 'start'` 中，替換 parser 建立邏輯：

```typescript
    case 'start': {
      let targetHost = args.targetHost ?? 'localhost'
      let targetPort = args.targetPort ?? 3306
      let envDriver: string | undefined

      if (args.fromEnv) {
        const envConfig = parseEnvFile(args.fromEnv)
        targetHost = envConfig.host
        targetPort = envConfig.port
        envDriver = envConfig.driver
      }

      const { detectProtocol, resolveParser } = await import(
        '@/Modules/Recording/Infrastructure/Proxy/ProtocolDetector'
      )
      const protocol = detectProtocol({
        targetPort,
        explicit: args.protocol,
        envDriver,
      })
      const parser = resolveParser(protocol)

      const repo = new RecordingRepository(recordingsDir)
      const service = new RecordingService(repo, parser)

      const session = await service.start({
        listenPort: args.listenPort,
        targetHost,
        targetPort,
      })

      console.log(`
Recording Started (${protocol.toUpperCase()})

Session:  ${session.id}
Proxy:    127.0.0.1:${service.proxyPort}
Target:   ${targetHost}:${targetPort}
Protocol: ${protocol}

Point your application's DB connection to 127.0.0.1:${service.proxyPort}
Press Ctrl+C to stop recording.
`)
```

4. 更新 `parseEnvFile` 回傳型別，加入 `driver`：

```typescript
function parseEnvFile(envPath: string): { host: string; port: number; driver?: string } {
  // ... existing code ...
  const driver = env.DB_CONNECTION ?? env.DB_DRIVER
  return { host, port, driver }
}
```

5. 把函式頂部的 `const repo = ...` 和 `const service = ...` 移到各 case 內部（`start` 已處理，其他 case 保持用 MySQL parser）。

- [ ] **Step 6: 執行所有測試確認無破壞**

Run: `bun run test -- test/unit/Recording/CLI/RecordCommand.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Proxy/ProtocolDetector.ts src/CLI/RecordCommand.ts test/unit/Recording/Infrastructure/ProtocolDetector.test.ts
git commit -m "$(cat <<'EOF'
feat: [recording] 自動偵測 MySQL/PostgreSQL 協議

新增 ProtocolDetector（port 慣例 + env driver），RecordCommand 支援 --protocol 手動指定

🤖 Generated with Claude Code
EOF
)"
```

---

### Task F3: 最終驗證

- [ ] **Step 1: 執行完整測試套件**

Run: `bun run check`
Expected: typecheck + lint + ALL tests PASS

- [ ] **Step 2: 更新工作流文件**

在 `docs/WORKFLOW.zh-TW.md` 的「啟動錄製代理」區塊新增 PostgreSQL 說明，以及「CLI 指令速查」新增 `apply` 和 `diff` 指令。

- [ ] **Step 3: Final commit**

```bash
git add docs/WORKFLOW.zh-TW.md
git commit -m "$(cat <<'EOF'
docs: 更新工作流文件 — 新增 apply/diff 指令與 PostgreSQL 支援

🤖 Generated with Claude Code
EOF
)"
```
