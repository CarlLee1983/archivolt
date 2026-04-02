# Archivolt ER Model 視覺化標註工具 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個本地 Web 工具，匯入 dbcli JSON → 智慧分組 + 關聯推測 → ReactFlow 畫布視覺化標註 → 輸出 ORM/ER 圖格式

**Architecture:** Gravito PlanetCore (只用 Photon Orbit) 作為後端 HTTP shell，單一 `archivolt.json` 作為真相來源（無 DB）。React + ReactFlow + shadcn/ui 前端透過 API 讀寫 ER Model。Export 層以 pluggable interface 支援多種輸出格式。

**Tech Stack:** Bun, Gravito PlanetCore, Photon Orbit, React 19, ReactFlow, Tailwind CSS, shadcn/ui, Vite, Vitest

---

## File Structure

### 後端 (`src/`)

| File | Responsibility |
|------|---------------|
| `config/app.ts` | 應用配置（name, port, env） |
| `config/index.ts` | 組裝 defineConfig 物件 |
| `config/orbits.ts` | 只註冊 Photon Orbit |
| `src/index.ts` | entry-server，啟動 + 歡迎訊息 |
| `src/app.ts` | `createApp()` 封裝 bootstrap |
| `src/bootstrap.ts` | PlanetCore 初始化、ServiceProvider 註冊 |
| `src/routes.ts` | 全域路由註冊入口 |
| `src/wiring/index.ts` | 接線層：組裝 Controller + Routes |
| `src/Modules/Schema/Domain/ERModel.ts` | 核心型別定義（Table, Column, FK, VirtualFK, Group, ERModel） |
| `src/Modules/Schema/Domain/GroupingStrategy.ts` | 分組演算法（connected components, prefix, column name） |
| `src/Modules/Schema/Domain/RelationInferrer.ts` | 關聯推測邏輯（`_id` 後綴匹配） |
| `src/Modules/Schema/Application/Services/ImportSchemaService.ts` | 匯入 dbcli JSON 並轉換為 ERModel |
| `src/Modules/Schema/Application/Services/VirtualFKService.ts` | virtual FK CRUD |
| `src/Modules/Schema/Application/Services/GroupService.ts` | 分組管理（重命名、移動表） |
| `src/Modules/Schema/Application/Services/ExportService.ts` | 觸發 exporter |
| `src/Modules/Schema/Infrastructure/Providers/SchemaServiceProvider.ts` | Gravito ServiceProvider |
| `src/Modules/Schema/Infrastructure/Persistence/JsonFileRepository.ts` | archivolt.json 讀寫 |
| `src/Modules/Schema/Infrastructure/Exporters/IExporter.ts` | Exporter 介面 |
| `src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts` | Laravel Eloquent Model 輸出 |
| `src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts` | Prisma schema 輸出 |
| `src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts` | DBML 格式輸出 |
| `src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts` | Mermaid ER 語法輸出 |
| `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` | HTTP 控制器 |
| `src/Modules/Schema/Presentation/Routes/Schema.routes.ts` | 路由定義 |
| `src/Shared/Infrastructure/Framework/GravitoModuleRouter.ts` | 框架路由適配器（從 starter 複製） |
| `src/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter.ts` | ServiceProvider 適配器（從 starter 複製） |
| `src/Shared/Infrastructure/IServiceProvider.ts` | 框架無關 ServiceProvider 介面（從 starter 複製） |
| `src/Shared/Presentation/IModuleRouter.ts` | 框架無關路由介面（從 starter 複製） |
| `src/Shared/Presentation/IHttpContext.ts` | HTTP Context 介面（從 starter 複製） |
| `src/Shared/Presentation/ApiResponse.ts` | 統一回應格式 |

### 前端 (`web/`)

| File | Responsibility |
|------|---------------|
| `web/src/App.tsx` | 根元件，三欄式佈局 |
| `web/src/api/schema.ts` | API client（fetch wrapper） |
| `web/src/stores/schemaStore.ts` | Zustand store：ER Model 狀態管理 |
| `web/src/types/er-model.ts` | 前後端共享型別 |
| `web/src/components/Canvas/ERCanvas.tsx` | ReactFlow 畫布容器 |
| `web/src/components/Canvas/TableNode.tsx` | 自定義表節點元件 |
| `web/src/components/Canvas/edges.ts` | 邊的樣式定義（實線 FK / 虛線建議 / 紫色手動） |
| `web/src/components/Canvas/layoutEngine.ts` | 自動排列演算法（dagre） |
| `web/src/components/GroupPanel/GroupPanel.tsx` | 左側群組列表 |
| `web/src/components/GroupPanel/GroupItem.tsx` | 單一群組項目 |
| `web/src/components/DetailPanel/DetailPanel.tsx` | 右側詳情面板容器 |
| `web/src/components/DetailPanel/TableDetail.tsx` | 表詳情：欄位列表、FK、建議 |
| `web/src/components/DetailPanel/VirtualFKForm.tsx` | 手動新增 vFK 表單 |
| `web/src/components/DetailPanel/ExportPanel.tsx` | Export 操作區 |
| `web/src/components/Toolbar/Toolbar.tsx` | 搜尋、排列、篩選工具列 |

### 測試 (`test/`)

| File | Responsibility |
|------|---------------|
| `test/unit/Domain/ERModel.test.ts` | 型別驗證 |
| `test/unit/Domain/GroupingStrategy.test.ts` | 分組演算法 |
| `test/unit/Domain/RelationInferrer.test.ts` | 關聯推測 |
| `test/unit/Application/ImportSchemaService.test.ts` | 匯入邏輯 |
| `test/unit/Application/VirtualFKService.test.ts` | vFK CRUD |
| `test/unit/Application/ExportService.test.ts` | Export 邏輯 |
| `test/unit/Infrastructure/Exporters/EloquentExporter.test.ts` | Eloquent 輸出 |
| `test/unit/Infrastructure/Exporters/PrismaExporter.test.ts` | Prisma 輸出 |
| `test/unit/Infrastructure/Exporters/DbmlExporter.test.ts` | DBML 輸出 |
| `test/unit/Infrastructure/Exporters/MermaidExporter.test.ts` | Mermaid 輸出 |
| `test/unit/Infrastructure/JsonFileRepository.test.ts` | JSON 讀寫 |
| `test/integration/api.test.ts` | 完整 API 端點測試 |

### Root config files

| File | Responsibility |
|------|---------------|
| `package.json` | 後端依賴 + scripts |
| `tsconfig.json` | TypeScript 配置（`@/*` 路徑別名） |
| `biome.json` | Linter + Formatter |
| `.gitignore` | 忽略 node_modules, dist, .superpowers 等 |

---

## Task 1: 專案骨架 — Bun + Gravito + TypeScript 初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Modify: `.gitignore`

- [ ] **Step 1: 初始化 package.json**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bun init -y
```

- [ ] **Step 2: 替換 package.json 內容**

```json
{
  "name": "archivolt",
  "version": "0.1.0",
  "description": "ER Model 視覺化標註工具 — 協助老舊專案建構資料關聯",
  "type": "module",
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist --format esm",
    "start": "bun dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "biome lint src test",
    "lint:fix": "biome lint src test --fix",
    "format": "biome format src test --write",
    "check": "bun run typecheck && bun run lint && bun run test"
  },
  "dependencies": {
    "@gravito/core": "^2.0.0"
  },
  "overrides": {
    "@gravito/photon": "1.0.1"
  },
  "devDependencies": {
    "@types/bun": "^1.3.10",
    "biome": "latest",
    "bun-types": "latest",
    "typescript": "^5.3.0",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 3: 建立 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "esnext",
    "lib": ["ES2020"],
    "moduleResolution": "bundler",
    "rootDir": ".",
    "outDir": "dist",
    "resolveJsonModule": true,
    "allowJs": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "test", "config"],
  "exclude": ["node_modules", "dist", "web"]
}
```

- [ ] **Step 4: 建立 biome.json**

```json
{
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noConsoleLog": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentSize": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single"
    }
  }
}
```

- [ ] **Step 5: 更新 .gitignore**

```
node_modules/
dist/
.superpowers/
archivolt.json
*.log
.env
.env.local
```

- [ ] **Step 6: 安裝依賴**

```bash
bun install
```

Expected: `bun install` 成功，`node_modules/` 出現

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json biome.json .gitignore bun.lock
git commit -m "chore: [archivolt] 初始化 Bun + Gravito + TypeScript 專案骨架"
```

---

## Task 2: Gravito 啟動骨架 — config + bootstrap + liftoff

**Files:**
- Create: `config/app.ts`
- Create: `config/index.ts`
- Create: `config/orbits.ts`
- Create: `src/index.ts`
- Create: `src/app.ts`
- Create: `src/bootstrap.ts`
- Create: `src/routes.ts`

- [ ] **Step 1: 建立 config/app.ts**

```typescript
export default {
  name: process.env.APP_NAME ?? 'archivolt',
  env: process.env.APP_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3100', 10),
  debug: process.env.APP_DEBUG === 'true',
  url: process.env.APP_URL ?? 'http://localhost:3100',
} as const
```

- [ ] **Step 2: 建立 config/orbits.ts**

```typescript
import type { GravitoOrbit } from '@gravito/core'

export function getOrbits(): GravitoOrbit[] {
  return []
}
```

- [ ] **Step 3: 建立 config/index.ts**

```typescript
import appConfig from './app'

export { default as app } from './app'
export { getOrbits } from './orbits'

export function buildConfig(portOverride?: number) {
  const port = portOverride ?? appConfig.port
  return {
    ...appConfig,
    PORT: port,
  }
}
```

- [ ] **Step 4: 建立 src/bootstrap.ts**

```typescript
import { PlanetCore, defineConfig } from '@gravito/core'
import { buildConfig } from '../config/index'
import { registerRoutes } from './routes'

export async function bootstrap(port = 3100): Promise<PlanetCore> {
  const configObj = buildConfig(port)

  const config = defineConfig({
    config: configObj,
  })

  const core = new PlanetCore(config)

  await core.bootstrap()

  await registerRoutes(core)

  core.registerGlobalErrorHandlers()

  return core
}

export default bootstrap
```

- [ ] **Step 5: 建立 src/app.ts**

```typescript
import bootstrap from './bootstrap'

export async function createApp() {
  const port = (process.env.PORT as unknown as number) || 3100
  const core = await bootstrap(port)
  return core
}
```

- [ ] **Step 6: 建立 src/routes.ts**

```typescript
import type { PlanetCore } from '@gravito/core'

export async function registerRoutes(core: PlanetCore) {
  core.router.get('/api', async (ctx) => {
    return ctx.json({
      success: true,
      message: 'Archivolt API',
      version: '0.1.0',
    })
  })
}
```

- [ ] **Step 7: 建立 src/index.ts**

```typescript
import { createApp } from './app'

async function start() {
  const core = await createApp()

  const port = (core.config.get<number>('PORT') ?? 3100) as number
  const server = core.liftoff(port)

  console.log(`
╔══════════════════════════════════════════╗
║        🏛️  Archivolt — Running            ║
╚══════════════════════════════════════════╝

📍 URL: http://localhost:${port}
📌 API: http://localhost:${port}/api
`)

  return server
}

const server = await start().catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})

export default server
```

- [ ] **Step 8: 驗證啟動**

```bash
bun run dev
```

Expected: Server 啟動，`curl http://localhost:3100/api` 回傳 `{ success: true, message: "Archivolt API" }`

按 Ctrl+C 停止 server。

- [ ] **Step 9: Commit**

```bash
git add config/ src/
git commit -m "feat: [archivolt] Gravito 啟動骨架 — config + bootstrap + liftoff"
```

---

## Task 3: Shared 層 — 從 gravito-ddd-starter 移植框架適配器

**Files:**
- Create: `src/Shared/Infrastructure/IServiceProvider.ts`
- Create: `src/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter.ts`
- Create: `src/Shared/Infrastructure/Framework/GravitoModuleRouter.ts`
- Create: `src/Shared/Presentation/IModuleRouter.ts`
- Create: `src/Shared/Presentation/IHttpContext.ts`
- Create: `src/Shared/Presentation/ApiResponse.ts`

- [ ] **Step 1: 建立 src/Shared/Infrastructure/IServiceProvider.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Infrastructure/IServiceProvider.ts` 完整複製。此檔定義 `IContainer` 介面和 `ModuleServiceProvider` 抽象類。

- [ ] **Step 2: 建立 src/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter.ts` 完整複製。此檔定義 `GravitoContainerAdapter` 和 `createGravitoServiceProvider` 工廠函式。

- [ ] **Step 3: 建立 src/Shared/Presentation/IHttpContext.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Presentation/IHttpContext.ts` 完整複製。此檔定義 `IHttpContext` 介面和 `fromGravitoContext` 適配函式。

- [ ] **Step 4: 建立 src/Shared/Presentation/IModuleRouter.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Presentation/IModuleRouter.ts` 完整複製。此檔定義 `RouteHandler`、`Middleware`、`IModuleRouter` 型別。

- [ ] **Step 5: 建立 src/Shared/Infrastructure/Framework/GravitoModuleRouter.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Infrastructure/Framework/GravitoModuleRouter.ts` 完整複製。此檔定義 `createGravitoModuleRouter` 工廠函式。

- [ ] **Step 6: 建立 src/Shared/Presentation/ApiResponse.ts**

從 `/Users/carl/Dev/CMG/gravito-ddd-starter/src/Shared/Presentation/ApiResponse.ts` 完整複製。此檔定義統一的 `ApiResponse.success()` / `.error()` 格式。

- [ ] **Step 7: 驗證 typecheck**

```bash
bun run typecheck
```

Expected: 無錯誤

- [ ] **Step 8: Commit**

```bash
git add src/Shared/
git commit -m "chore: [archivolt] 移植 Gravito Shared 層框架適配器"
```

---

## Task 4: Domain 層 — ER Model 型別定義

**Files:**
- Create: `src/Modules/Schema/Domain/ERModel.ts`
- Test: `test/unit/Domain/ERModel.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Domain/ERModel.test.ts
import { describe, it, expect } from 'vitest'
import {
  type Column,
  type ForeignKey,
  type VirtualForeignKey,
  type Table,
  type Group,
  type ERModel,
  createVirtualFK,
} from '@/Modules/Schema/Domain/ERModel'

describe('ERModel types', () => {
  it('createVirtualFK 產生正確的 VirtualForeignKey', () => {
    const vfk = createVirtualFK({
      columns: ['user_id'],
      refTable: 'users',
      refColumns: ['id'],
      confidence: 'manual',
    })

    expect(vfk.id).toMatch(/^vfk_/)
    expect(vfk.columns).toEqual(['user_id'])
    expect(vfk.refTable).toBe('users')
    expect(vfk.refColumns).toEqual(['id'])
    expect(vfk.confidence).toBe('manual')
    expect(vfk.createdAt).toBeDefined()
  })

  it('createVirtualFK 每次產生唯一 id', () => {
    const a = createVirtualFK({ columns: ['a'], refTable: 'b', refColumns: ['c'], confidence: 'manual' })
    const b = createVirtualFK({ columns: ['a'], refTable: 'b', refColumns: ['c'], confidence: 'manual' })
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Domain/ERModel.test.ts
```

Expected: FAIL — 模組不存在

- [ ] **Step 3: 實作 ERModel.ts**

```typescript
// src/Modules/Schema/Domain/ERModel.ts

export interface Column {
  readonly name: string
  readonly type: string
  readonly nullable: 0 | 1
  readonly default?: string
  readonly primaryKey: 0 | 1
}

export interface ForeignKey {
  readonly name: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
}

export interface VirtualForeignKey {
  readonly id: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
  readonly confidence: 'manual' | 'auto-suggested'
  readonly createdAt: string
}

export interface Table {
  readonly name: string
  readonly columns: readonly Column[]
  readonly rowCount: number
  readonly engine: string
  readonly primaryKey: readonly string[]
  readonly foreignKeys: readonly ForeignKey[]
  readonly virtualForeignKeys: readonly VirtualForeignKey[]
}

export interface Group {
  readonly name: string
  readonly tables: readonly string[]
  readonly auto: boolean
}

export interface ERModelSource {
  readonly system: string
  readonly database: string
  readonly importedAt: string
  readonly dbcliVersion: string
}

export interface ERModel {
  readonly source: ERModelSource
  readonly tables: Readonly<Record<string, Table>>
  readonly groups: Readonly<Record<string, Group>>
}

let counter = 0

export function createVirtualFK(params: {
  columns: string[]
  refTable: string
  refColumns: string[]
  confidence: 'manual' | 'auto-suggested'
}): VirtualForeignKey {
  counter++
  return {
    id: `vfk_${Date.now()}_${counter}`,
    columns: params.columns,
    refTable: params.refTable,
    refColumns: params.refColumns,
    confidence: params.confidence,
    createdAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: 加入 vitest 路徑別名配置**

建立 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
  },
})
```

- [ ] **Step 5: 執行測試**

```bash
bun run test -- test/unit/Domain/ERModel.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Schema/Domain/ERModel.ts test/unit/Domain/ERModel.test.ts vitest.config.ts
git commit -m "feat: [schema] ER Model 核心型別定義 + createVirtualFK"
```

---

## Task 5: Domain 層 — 關聯推測器 (RelationInferrer)

**Files:**
- Create: `src/Modules/Schema/Domain/RelationInferrer.ts`
- Test: `test/unit/Domain/RelationInferrer.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Domain/RelationInferrer.test.ts
import { describe, it, expect } from 'vitest'
import { inferRelations } from '@/Modules/Schema/Domain/RelationInferrer'
import type { Table } from '@/Modules/Schema/Domain/ERModel'

function makeTable(name: string, columnNames: string[], fks: { columns: string[]; refTable: string }[] = []): Table {
  return {
    name,
    columns: columnNames.map((n) => ({ name: n, type: 'bigint(20)', nullable: 1, primaryKey: n === 'id' ? 1 : 0 })),
    rowCount: 100,
    engine: 'InnoDB',
    primaryKey: ['id'],
    foreignKeys: fks.map((fk, i) => ({
      name: `${name}_fk_${i}`,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: ['id'],
    })),
    virtualForeignKeys: [],
  }
}

describe('inferRelations', () => {
  it('推測 _id 後綴欄位為 virtual FK', () => {
    const tables: Record<string, Table> = {
      users: makeTable('users', ['id', 'name', 'email']),
      orders: makeTable('orders', ['id', 'user_id', 'total']),
    }

    const suggestions = inferRelations(tables)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].sourceTable).toBe('orders')
    expect(suggestions[0].columns).toEqual(['user_id'])
    expect(suggestions[0].refTable).toBe('users')
    expect(suggestions[0].refColumns).toEqual(['id'])
  })

  it('已有實際 FK 的欄位不重複建議', () => {
    const tables: Record<string, Table> = {
      users: makeTable('users', ['id', 'name']),
      orders: makeTable('orders', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
    }

    const suggestions = inferRelations(tables)

    expect(suggestions).toHaveLength(0)
  })

  it('目標表不存在時不建議', () => {
    const tables: Record<string, Table> = {
      orders: makeTable('orders', ['id', 'ghost_id']),
    }

    const suggestions = inferRelations(tables)

    expect(suggestions).toHaveLength(0)
  })

  it('複數表名匹配（user_id → users）', () => {
    const tables: Record<string, Table> = {
      users: makeTable('users', ['id', 'name']),
      posts: makeTable('posts', ['id', 'user_id', 'category_id']),
      categories: makeTable('categories', ['id', 'name']),
    }

    const suggestions = inferRelations(tables)

    expect(suggestions).toHaveLength(2)
    expect(suggestions.find((s) => s.refTable === 'users')).toBeDefined()
    expect(suggestions.find((s) => s.refTable === 'categories')).toBeDefined()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Domain/RelationInferrer.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 RelationInferrer.ts**

```typescript
// src/Modules/Schema/Domain/RelationInferrer.ts
import type { Table } from './ERModel'

export interface SuggestedRelation {
  readonly sourceTable: string
  readonly columns: readonly string[]
  readonly refTable: string
  readonly refColumns: readonly string[]
}

export function inferRelations(tables: Readonly<Record<string, Table>>): SuggestedRelation[] {
  const tableNames = new Set(Object.keys(tables))
  const suggestions: SuggestedRelation[] = []

  for (const [tableName, table] of Object.entries(tables)) {
    const existingFKColumns = new Set(
      table.foreignKeys.flatMap((fk) => fk.columns)
    )

    for (const column of table.columns) {
      if (!column.name.endsWith('_id')) continue
      if (column.primaryKey === 1) continue
      if (existingFKColumns.has(column.name)) continue

      const prefix = column.name.slice(0, -3) // remove '_id'
      const candidates = [
        `${prefix}s`,      // user_id → users
        `${prefix}es`,     // status_id → statuses
        prefix,            // platform_id → platform
        `${prefix}ies`.replace(/yies$/, 'ies'), // category_id → categories
      ]

      // Handle special plural: category_id → categories (strip trailing y, add ies)
      if (prefix.endsWith('y')) {
        candidates.push(`${prefix.slice(0, -1)}ies`)
      }

      const refTable = candidates.find((c) => tableNames.has(c))
      if (!refTable) continue
      if (refTable === tableName) continue // self-reference skip

      suggestions.push({
        sourceTable: tableName,
        columns: [column.name],
        refTable,
        refColumns: ['id'],
      })
    }
  }

  return suggestions
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Domain/RelationInferrer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Domain/RelationInferrer.ts test/unit/Domain/RelationInferrer.test.ts
git commit -m "feat: [schema] 關聯推測器 — _id 後綴匹配 + 複數表名解析"
```

---

## Task 6: Domain 層 — 分組策略 (GroupingStrategy)

**Files:**
- Create: `src/Modules/Schema/Domain/GroupingStrategy.ts`
- Test: `test/unit/Domain/GroupingStrategy.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Domain/GroupingStrategy.test.ts
import { describe, it, expect } from 'vitest'
import { computeGroups } from '@/Modules/Schema/Domain/GroupingStrategy'
import type { Table, Group } from '@/Modules/Schema/Domain/ERModel'
import type { SuggestedRelation } from '@/Modules/Schema/Domain/RelationInferrer'

function makeTable(name: string, columnNames: string[], fks: { columns: string[]; refTable: string }[] = []): Table {
  return {
    name,
    columns: columnNames.map((n) => ({ name: n, type: 'bigint(20)', nullable: 1, primaryKey: n === 'id' ? 1 : 0 })),
    rowCount: 100,
    engine: 'InnoDB',
    primaryKey: ['id'],
    foreignKeys: fks.map((fk, i) => ({
      name: `${name}_fk_${i}`,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: ['id'],
    })),
    virtualForeignKeys: [],
  }
}

describe('computeGroups', () => {
  it('FK 連結的表歸同一組', () => {
    const tables: Record<string, Table> = {
      users: makeTable('users', ['id', 'name']),
      orders: makeTable('orders', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
    }

    const groups = computeGroups(tables, [])

    const group = Object.values(groups).find((g) => g.tables.includes('users'))!
    expect(group.tables).toContain('orders')
  })

  it('共同前綴的表歸同一組', () => {
    const tables: Record<string, Table> = {
      chat_room_messages: makeTable('chat_room_messages', ['id', 'content']),
      chat_room_announcements: makeTable('chat_room_announcements', ['id', 'title']),
      chat_room_privates: makeTable('chat_room_privates', ['id', 'sender_id']),
    }

    const groups = computeGroups(tables, [])

    const group = Object.values(groups).find((g) => g.tables.includes('chat_room_messages'))!
    expect(group.tables).toHaveLength(3)
    expect(group.name).toContain('Chat Room')
  })

  it('建議關聯也用於分組', () => {
    const tables: Record<string, Table> = {
      users: makeTable('users', ['id', 'name']),
      deposits: makeTable('deposits', ['id', 'user_id', 'amount']),
    }
    const suggestions: SuggestedRelation[] = [
      { sourceTable: 'deposits', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
    ]

    const groups = computeGroups(tables, suggestions)

    const group = Object.values(groups).find((g) => g.tables.includes('users'))!
    expect(group.tables).toContain('deposits')
  })

  it('孤立表歸入未分類', () => {
    const tables: Record<string, Table> = {
      settings: makeTable('settings', ['id', 'key', 'value']),
    }

    const groups = computeGroups(tables, [])

    const uncategorized = Object.values(groups).find((g) => g.tables.includes('settings'))!
    expect(uncategorized.name).toBe('未分類')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Domain/GroupingStrategy.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 GroupingStrategy.ts**

```typescript
// src/Modules/Schema/Domain/GroupingStrategy.ts
import type { Table, Group } from './ERModel'
import type { SuggestedRelation } from './RelationInferrer'

class UnionFind {
  private parent: Map<string, string> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
    }
    let root = x
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!
    }
    // Path compression
    let current = x
    while (current !== root) {
      const next = this.parent.get(current)!
      this.parent.set(current, root)
      current = next
    }
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB)
    }
  }

  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    for (const key of this.parent.keys()) {
      const root = this.find(key)
      if (!groups.has(root)) {
        groups.set(root, [])
      }
      groups.get(root)!.push(key)
    }
    return groups
  }
}

function findCommonPrefix(names: string[]): string {
  if (names.length === 0) return ''
  const parts = names.map((n) => n.split('_'))
  const minLen = Math.min(...parts.map((p) => p.length))
  const common: string[] = []
  for (let i = 0; i < minLen - 1; i++) {
    if (parts.every((p) => p[i] === parts[0][i])) {
      common.push(parts[0][i])
    } else {
      break
    }
  }
  return common.join('_')
}

function toTitleCase(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function computeGroups(
  tables: Readonly<Record<string, Table>>,
  suggestions: readonly SuggestedRelation[],
): Record<string, Group> {
  const uf = new UnionFind()
  const tableNames = Object.keys(tables)

  // Initialize all tables
  for (const name of tableNames) {
    uf.find(name)
  }

  // Step 1: Union by explicit FK
  for (const table of Object.values(tables)) {
    for (const fk of table.foreignKeys) {
      if (tableNames.includes(fk.refTable)) {
        uf.union(table.name, fk.refTable)
      }
    }
  }

  // Step 2: Union by suggested relations
  for (const s of suggestions) {
    uf.union(s.sourceTable, s.refTable)
  }

  // Step 3: Union by common prefix (for tables still isolated)
  const afterRelations = uf.getGroups()
  const singletons = new Set<string>()
  for (const [, members] of afterRelations) {
    if (members.length === 1) {
      singletons.add(members[0])
    }
  }

  // Group singletons by prefix
  const prefixMap = new Map<string, string[]>()
  for (const name of singletons) {
    const parts = name.split('_')
    if (parts.length >= 2) {
      // Try longest prefix first (2+ segments)
      const prefix = parts.slice(0, -1).join('_')
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, [])
      }
      prefixMap.get(prefix)!.push(name)
    }
  }

  for (const [, members] of prefixMap) {
    if (members.length >= 2) {
      for (let i = 1; i < members.length; i++) {
        uf.union(members[0], members[i])
      }
    }
  }

  // Build final groups
  const finalGroups = uf.getGroups()
  const result: Record<string, Group> = {}

  for (const [root, members] of finalGroups) {
    members.sort()

    let name: string
    if (members.length === 1 && singletons.has(members[0])) {
      // Still a singleton after prefix merging — goes to uncategorized
      continue
    }

    const prefix = findCommonPrefix(members)
    name = prefix ? toTitleCase(prefix) : toTitleCase(root)

    const groupId = prefix || root
    result[groupId] = {
      name,
      tables: members,
      auto: true,
    }
  }

  // Collect uncategorized
  const categorized = new Set(Object.values(result).flatMap((g) => g.tables))
  const uncategorizedTables = tableNames.filter((t) => !categorized.has(t))
  if (uncategorizedTables.length > 0) {
    result['uncategorized'] = {
      name: '未分類',
      tables: uncategorizedTables.sort(),
      auto: true,
    }
  }

  return result
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Domain/GroupingStrategy.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Domain/GroupingStrategy.ts test/unit/Domain/GroupingStrategy.test.ts
git commit -m "feat: [schema] 分組策略 — FK 連通分量 + 前綴合併 + 未分類收集"
```

---

## Task 7: Infrastructure 層 — JSON 檔案讀寫 (JsonFileRepository)

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Persistence/JsonFileRepository.ts`
- Test: `test/unit/Infrastructure/JsonFileRepository.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Infrastructure/JsonFileRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { existsSync, unlinkSync } from 'fs'
import path from 'path'

const TEST_FILE = path.join(import.meta.dirname, '__test_archivolt.json')

describe('JsonFileRepository', () => {
  let repo: JsonFileRepository

  beforeEach(() => {
    repo = new JsonFileRepository(TEST_FILE)
  })

  afterEach(() => {
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE)
    }
  })

  it('save 寫入 JSON 檔並 load 讀回', async () => {
    const model: ERModel = {
      source: { system: 'mariadb', database: 'test', importedAt: '2026-01-01T00:00:00Z', dbcliVersion: '1.0.0' },
      tables: {
        users: {
          name: 'users',
          columns: [{ name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 }],
          rowCount: 10,
          engine: 'InnoDB',
          primaryKey: ['id'],
          foreignKeys: [],
          virtualForeignKeys: [],
        },
      },
      groups: {},
    }

    await repo.save(model)

    expect(existsSync(TEST_FILE)).toBe(true)

    const loaded = await repo.load()
    expect(loaded).toBeDefined()
    expect(loaded!.source.database).toBe('test')
    expect(loaded!.tables.users.name).toBe('users')
  })

  it('load 檔案不存在時回傳 null', async () => {
    const result = await repo.load()
    expect(result).toBeNull()
  })

  it('exists 回傳正確值', async () => {
    expect(await repo.exists()).toBe(false)

    const model: ERModel = {
      source: { system: 'mariadb', database: 'test', importedAt: '2026-01-01T00:00:00Z', dbcliVersion: '1.0.0' },
      tables: {},
      groups: {},
    }

    await repo.save(model)

    expect(await repo.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Infrastructure/JsonFileRepository.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 JsonFileRepository.ts**

```typescript
// src/Modules/Schema/Infrastructure/Persistence/JsonFileRepository.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { existsSync } from 'fs'

export class JsonFileRepository {
  constructor(private readonly filePath: string) {}

  async save(model: ERModel): Promise<void> {
    await Bun.write(this.filePath, JSON.stringify(model, null, 2))
  }

  async load(): Promise<ERModel | null> {
    if (!existsSync(this.filePath)) {
      return null
    }
    const file = Bun.file(this.filePath)
    const text = await file.text()
    return JSON.parse(text) as ERModel
  }

  async exists(): Promise<boolean> {
    return existsSync(this.filePath)
  }
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Infrastructure/JsonFileRepository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Persistence/JsonFileRepository.ts test/unit/Infrastructure/JsonFileRepository.test.ts
git commit -m "feat: [schema] JsonFileRepository — archivolt.json 讀寫"
```

---

## Task 8: Application 層 — ImportSchemaService（匯入 dbcli JSON）

**Files:**
- Create: `src/Modules/Schema/Application/Services/ImportSchemaService.ts`
- Test: `test/unit/Application/ImportSchemaService.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Application/ImportSchemaService.test.ts
import { describe, it, expect } from 'vitest'
import { importSchema } from '@/Modules/Schema/Application/Services/ImportSchemaService'

describe('importSchema', () => {
  it('將 dbcli JSON 轉換為 ERModel', () => {
    const dbcliJson = {
      connection: { system: 'mariadb', host: '127.0.0.1', port: 3306, user: 'root', database: 'testing' },
      schema: {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
            { name: 'name', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
          ],
          rowCount: 100,
          engine: 'InnoDB',
          primaryKey: ['id'],
          foreignKeys: [],
        },
        orders: {
          name: 'orders',
          columns: [
            { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
            { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
            { name: 'total', type: 'decimal(10,2)', nullable: 0, primaryKey: 0 },
          ],
          rowCount: 50,
          engine: 'InnoDB',
          primaryKey: ['id'],
          foreignKeys: [],
        },
      },
    }

    const model = importSchema(dbcliJson)

    // Source metadata
    expect(model.source.system).toBe('mariadb')
    expect(model.source.database).toBe('testing')
    expect(model.source.importedAt).toBeDefined()

    // Tables
    expect(Object.keys(model.tables)).toHaveLength(2)
    expect(model.tables.users.virtualForeignKeys).toEqual([])
    expect(model.tables.orders.virtualForeignKeys).toHaveLength(1)
    expect(model.tables.orders.virtualForeignKeys[0].refTable).toBe('users')
    expect(model.tables.orders.virtualForeignKeys[0].confidence).toBe('auto-suggested')

    // Groups
    expect(Object.keys(model.groups).length).toBeGreaterThan(0)
  })

  it('保留原始 foreignKeys 不修改', () => {
    const dbcliJson = {
      connection: { system: 'mariadb', host: '127.0.0.1', port: 3306, user: 'root', database: 'test' },
      schema: {
        users: {
          name: 'users',
          columns: [{ name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 }],
          rowCount: 10,
          engine: 'InnoDB',
          primaryKey: ['id'],
          foreignKeys: [],
        },
        orders: {
          name: 'orders',
          columns: [
            { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
            { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
          ],
          rowCount: 5,
          engine: 'InnoDB',
          primaryKey: ['id'],
          foreignKeys: [{ name: 'orders_fk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'] }],
        },
      },
    }

    const model = importSchema(dbcliJson)

    expect(model.tables.orders.foreignKeys).toHaveLength(1)
    expect(model.tables.orders.foreignKeys[0].name).toBe('orders_fk_1')
    // 已有 FK 的欄位不重複建議
    expect(model.tables.orders.virtualForeignKeys).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Application/ImportSchemaService.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 ImportSchemaService.ts**

```typescript
// src/Modules/Schema/Application/Services/ImportSchemaService.ts
import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'
import { inferRelations } from '@/Modules/Schema/Domain/RelationInferrer'
import { computeGroups } from '@/Modules/Schema/Domain/GroupingStrategy'

interface DbcliSchema {
  connection: {
    system: string
    database: string
    [key: string]: unknown
  }
  schema: Record<string, {
    name: string
    columns: Array<{
      name: string
      type: string
      nullable: number
      default?: string
      primaryKey: number
    }>
    rowCount: number
    engine: string
    primaryKey: string[]
    foreignKeys: Array<{
      name: string
      columns: string[]
      refTable: string
      refColumns: string[]
    }>
  }>
}

export function importSchema(dbcliJson: DbcliSchema): ERModel {
  // Step 1: Convert tables (add empty virtualForeignKeys)
  const tables: Record<string, Table> = {}

  for (const [name, raw] of Object.entries(dbcliJson.schema)) {
    tables[name] = {
      name: raw.name,
      columns: raw.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable as 0 | 1,
        ...(c.default !== undefined ? { default: c.default } : {}),
        primaryKey: c.primaryKey as 0 | 1,
      })),
      rowCount: raw.rowCount,
      engine: raw.engine,
      primaryKey: raw.primaryKey,
      foreignKeys: raw.foreignKeys.map((fk) => ({
        name: fk.name,
        columns: fk.columns,
        refTable: fk.refTable,
        refColumns: fk.refColumns,
      })),
      virtualForeignKeys: [],
    }
  }

  // Step 2: Infer relations
  const suggestions = inferRelations(tables)

  // Step 3: Add auto-suggested virtualForeignKeys
  for (const s of suggestions) {
    const table = tables[s.sourceTable]
    const vfk = createVirtualFK({
      columns: [...s.columns],
      refTable: s.refTable,
      refColumns: [...s.refColumns],
      confidence: 'auto-suggested',
    })
    tables[s.sourceTable] = {
      ...table,
      virtualForeignKeys: [...table.virtualForeignKeys, vfk],
    }
  }

  // Step 4: Compute groups
  const groups = computeGroups(tables, suggestions)

  return {
    source: {
      system: dbcliJson.connection.system,
      database: dbcliJson.connection.database,
      importedAt: new Date().toISOString(),
      dbcliVersion: '1.0.0',
    },
    tables,
    groups,
  }
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Application/ImportSchemaService.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Application/Services/ImportSchemaService.ts test/unit/Application/ImportSchemaService.test.ts
git commit -m "feat: [schema] ImportSchemaService — dbcli JSON 轉 ERModel + 自動推測 + 分組"
```

---

## Task 9: Application 層 — VirtualFKService（CRUD）

**Files:**
- Create: `src/Modules/Schema/Application/Services/VirtualFKService.ts`
- Test: `test/unit/Application/VirtualFKService.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Application/VirtualFKService.test.ts
import { describe, it, expect } from 'vitest'
import { addVirtualFK, removeVirtualFK, confirmSuggestion, ignoreSuggestion } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(): ERModel {
  return {
    source: { system: 'mariadb', database: 'test', importedAt: '2026-01-01T00:00:00Z', dbcliVersion: '1.0.0' },
    tables: {
      users: {
        name: 'users',
        columns: [{ name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 }],
        rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
      orders: {
        name: 'orders',
        columns: [
          { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint', nullable: 1, primaryKey: 0 },
        ],
        rowCount: 5, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence: 'auto-suggested', createdAt: '2026-01-01T00:00:00Z' },
        ],
      },
    },
    groups: {},
  }
}

describe('VirtualFKService', () => {
  it('addVirtualFK 新增手動標註', () => {
    const model = makeModel()
    const updated = addVirtualFK(model, {
      tableName: 'users',
      columns: ['team_id'],
      refTable: 'teams',
      refColumns: ['id'],
    })

    expect(updated.tables.users.virtualForeignKeys).toHaveLength(1)
    expect(updated.tables.users.virtualForeignKeys[0].confidence).toBe('manual')
  })

  it('removeVirtualFK 刪除指定 vFK', () => {
    const model = makeModel()
    const updated = removeVirtualFK(model, 'orders', 'vfk_1')

    expect(updated.tables.orders.virtualForeignKeys).toHaveLength(0)
  })

  it('confirmSuggestion 將 auto-suggested 改為 manual', () => {
    const model = makeModel()
    const updated = confirmSuggestion(model, 'orders', 'vfk_1')

    expect(updated.tables.orders.virtualForeignKeys[0].confidence).toBe('manual')
    expect(updated.tables.orders.virtualForeignKeys[0].id).toBe('vfk_1')
  })

  it('ignoreSuggestion 刪除 auto-suggested vFK', () => {
    const model = makeModel()
    const updated = ignoreSuggestion(model, 'orders', 'vfk_1')

    expect(updated.tables.orders.virtualForeignKeys).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Application/VirtualFKService.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 VirtualFKService.ts**

```typescript
// src/Modules/Schema/Application/Services/VirtualFKService.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'

export function addVirtualFK(
  model: ERModel,
  params: { tableName: string; columns: string[]; refTable: string; refColumns: string[] },
): ERModel {
  const table = model.tables[params.tableName]
  if (!table) throw new Error(`Table "${params.tableName}" not found`)

  const vfk = createVirtualFK({
    columns: params.columns,
    refTable: params.refTable,
    refColumns: params.refColumns,
    confidence: 'manual',
  })

  return {
    ...model,
    tables: {
      ...model.tables,
      [params.tableName]: {
        ...table,
        virtualForeignKeys: [...table.virtualForeignKeys, vfk],
      },
    },
  }
}

export function removeVirtualFK(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" not found`)

  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.filter((vfk) => vfk.id !== vfkId),
      },
    },
  }
}

export function confirmSuggestion(model: ERModel, tableName: string, vfkId: string): ERModel {
  const table = model.tables[tableName]
  if (!table) throw new Error(`Table "${tableName}" not found`)

  return {
    ...model,
    tables: {
      ...model.tables,
      [tableName]: {
        ...table,
        virtualForeignKeys: table.virtualForeignKeys.map((vfk) =>
          vfk.id === vfkId ? { ...vfk, confidence: 'manual' as const } : vfk
        ),
      },
    },
  }
}

export function ignoreSuggestion(model: ERModel, tableName: string, vfkId: string): ERModel {
  return removeVirtualFK(model, tableName, vfkId)
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Application/VirtualFKService.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Application/Services/VirtualFKService.ts test/unit/Application/VirtualFKService.test.ts
git commit -m "feat: [schema] VirtualFKService — 新增/刪除/確認/忽略 virtual FK"
```

---

## Task 10: Infrastructure 層 — Exporter 介面 + 四個 Exporter

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Exporters/IExporter.ts`
- Create: `src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts`
- Create: `src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts`
- Create: `src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts`
- Create: `src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts`
- Test: `test/unit/Infrastructure/Exporters/MermaidExporter.test.ts`
- Test: `test/unit/Infrastructure/Exporters/DbmlExporter.test.ts`
- Test: `test/unit/Infrastructure/Exporters/PrismaExporter.test.ts`
- Test: `test/unit/Infrastructure/Exporters/EloquentExporter.test.ts`

由於此 Task 較大，分為 4 個 sub-task。每個 exporter 獨立 TDD。

### Sub-task 10a: IExporter 介面 + MermaidExporter

- [ ] **Step 1: 建立 IExporter.ts**

```typescript
// src/Modules/Schema/Infrastructure/Exporters/IExporter.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export interface IExporter {
  readonly name: string
  readonly label: string
  export(model: ERModel): string
}
```

- [ ] **Step 2: 寫 Mermaid 失敗測試**

```typescript
// test/unit/Infrastructure/Exporters/MermaidExporter.test.ts
import { describe, it, expect } from 'vitest'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(): ERModel {
  return {
    source: { system: 'mariadb', database: 'test', importedAt: '', dbcliVersion: '1.0.0' },
    tables: {
      users: {
        name: 'users',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'name', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
      orders: {
        name: 'orders',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 5, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [{ name: 'fk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'] }],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['product_id'], refTable: 'products', refColumns: ['id'], confidence: 'manual', createdAt: '' },
        ],
      },
      products: {
        name: 'products',
        columns: [{ name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 }],
        rowCount: 20, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
    },
    groups: {},
  }
}

describe('MermaidExporter', () => {
  it('輸出合法 Mermaid ER 語法', () => {
    const exporter = new MermaidExporter()
    const output = exporter.export(makeModel())

    expect(output).toContain('erDiagram')
    expect(output).toContain('users {')
    expect(output).toContain('orders }o--|| users : "user_id"')
    expect(output).toContain('orders }o--|| products : "product_id"')
  })

  it('name 和 label 正確', () => {
    const exporter = new MermaidExporter()
    expect(exporter.name).toBe('mermaid')
    expect(exporter.label).toBe('Mermaid ER Diagram')
  })
})
```

- [ ] **Step 3: 確認失敗後實作 MermaidExporter.ts**

```typescript
// src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

export class MermaidExporter implements IExporter {
  readonly name = 'mermaid'
  readonly label = 'Mermaid ER Diagram'

  export(model: ERModel): string {
    const lines: string[] = ['erDiagram']

    // Table definitions
    for (const table of Object.values(model.tables)) {
      lines.push(`  ${table.name} {`)
      for (const col of table.columns) {
        const pkMark = col.primaryKey === 1 ? ' PK' : ''
        const type = col.type.replace(/\(.*\)/, '')
        lines.push(`    ${type} ${col.name}${pkMark}`)
      }
      lines.push('  }')
    }

    lines.push('')

    // Relationships — explicit FK
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`  ${table.name} }o--|| ${fk.refTable} : "${fk.columns[0]}"`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`  ${table.name} }o--|| ${vfk.refTable} : "${vfk.columns[0]}"`)
      }
    }

    return lines.join('\n')
  }
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Infrastructure/Exporters/MermaidExporter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/IExporter.ts src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts test/unit/Infrastructure/Exporters/MermaidExporter.test.ts
git commit -m "feat: [schema] IExporter 介面 + MermaidExporter"
```

### Sub-task 10b: DbmlExporter

- [ ] **Step 6: 寫 DBML 失敗測試**

```typescript
// test/unit/Infrastructure/Exporters/DbmlExporter.test.ts
import { describe, it, expect } from 'vitest'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(): ERModel {
  return {
    source: { system: 'mariadb', database: 'test', importedAt: '', dbcliVersion: '1.0.0' },
    tables: {
      users: {
        name: 'users',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'email', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
      posts: {
        name: 'posts',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 50, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence: 'manual', createdAt: '' },
        ],
      },
    },
    groups: {},
  }
}

describe('DbmlExporter', () => {
  it('輸出合法 DBML 語法', () => {
    const exporter = new DbmlExporter()
    const output = exporter.export(makeModel())

    expect(output).toContain('Table users {')
    expect(output).toContain('id bigint [pk]')
    expect(output).toContain('Ref: posts.user_id > users.id')
  })
})
```

- [ ] **Step 7: 實作 DbmlExporter.ts**

```typescript
// src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

export class DbmlExporter implements IExporter {
  readonly name = 'dbml'
  readonly label = 'DBML (dbdiagram.io)'

  export(model: ERModel): string {
    const lines: string[] = []

    for (const table of Object.values(model.tables)) {
      lines.push(`Table ${table.name} {`)
      for (const col of table.columns) {
        const attrs: string[] = []
        if (col.primaryKey === 1) attrs.push('pk')
        if (col.nullable === 0 && col.primaryKey === 0) attrs.push('not null')
        if (col.default !== undefined && col.default !== 'NULL') attrs.push(`default: '${col.default}'`)
        const type = col.type.replace(/\(.*\)/, '')
        const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : ''
        lines.push(`  ${col.name} ${type}${attrStr}`)
      }
      lines.push('}')
      lines.push('')
    }

    // References
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`Ref: ${table.name}.${fk.columns[0]} > ${fk.refTable}.${fk.refColumns[0]}`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`Ref: ${table.name}.${vfk.columns[0]} > ${vfk.refTable}.${vfk.refColumns[0]}`)
      }
    }

    return lines.join('\n')
  }
}
```

- [ ] **Step 8: 執行測試**

```bash
bun run test -- test/unit/Infrastructure/Exporters/DbmlExporter.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts test/unit/Infrastructure/Exporters/DbmlExporter.test.ts
git commit -m "feat: [schema] DbmlExporter — DBML 格式輸出"
```

### Sub-task 10c: PrismaExporter

- [ ] **Step 10: 寫 Prisma 失敗測試**

```typescript
// test/unit/Infrastructure/Exporters/PrismaExporter.test.ts
import { describe, it, expect } from 'vitest'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(): ERModel {
  return {
    source: { system: 'mariadb', database: 'test', importedAt: '', dbcliVersion: '1.0.0' },
    tables: {
      users: {
        name: 'users',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'email', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
      orders: {
        name: 'orders',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
          { name: 'total', type: 'decimal(10,2)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 5, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence: 'manual', createdAt: '' },
        ],
      },
    },
    groups: {},
  }
}

describe('PrismaExporter', () => {
  it('輸出合法 Prisma schema', () => {
    const exporter = new PrismaExporter()
    const output = exporter.export(makeModel())

    expect(output).toContain('model Users {')
    expect(output).toContain('model Orders {')
    expect(output).toContain('user   Users  @relation(fields: [user_id], references: [id])')
    expect(output).toContain('orders Orders[]')
  })
})
```

- [ ] **Step 11: 實作 PrismaExporter.ts**

```typescript
// src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts
import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

function toPascalCase(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function mapType(sqlType: string): string {
  const base = sqlType.toLowerCase().replace(/\(.*\)/, '')
  const mapping: Record<string, string> = {
    bigint: 'BigInt',
    int: 'Int',
    tinyint: 'Int',
    smallint: 'Int',
    mediumint: 'Int',
    decimal: 'Decimal',
    float: 'Float',
    double: 'Float',
    varchar: 'String',
    char: 'String',
    text: 'String',
    longtext: 'String',
    mediumtext: 'String',
    timestamp: 'DateTime',
    datetime: 'DateTime',
    date: 'DateTime',
    json: 'Json',
    boolean: 'Boolean',
    enum: 'String',
  }
  return mapping[base] ?? 'String'
}

export class PrismaExporter implements IExporter {
  readonly name = 'prisma'
  readonly label = 'Prisma Schema'

  export(model: ERModel): string {
    const lines: string[] = []

    // Collect reverse relations for hasMany
    const reverseRels = new Map<string, Array<{ fromTable: string; fromColumn: string }>>()

    for (const table of Object.values(model.tables)) {
      const allFks = [...table.foreignKeys, ...table.virtualForeignKeys]
      for (const fk of allFks) {
        if (!reverseRels.has(fk.refTable)) {
          reverseRels.set(fk.refTable, [])
        }
        reverseRels.get(fk.refTable)!.push({ fromTable: table.name, fromColumn: fk.columns[0] })
      }
    }

    for (const table of Object.values(model.tables)) {
      const modelName = toPascalCase(table.name)
      lines.push(`model ${modelName} {`)

      // Columns
      for (const col of table.columns) {
        const prismaType = mapType(col.type)
        const attrs: string[] = []
        if (col.primaryKey === 1) attrs.push('@id')
        if (col.nullable === 1) {
          lines.push(`  ${col.name} ${prismaType}? ${attrs.join(' ')}`.trimEnd())
        } else {
          lines.push(`  ${col.name} ${prismaType} ${attrs.join(' ')}`.trimEnd())
        }
      }

      // BelongsTo relations
      const allFks = [...table.foreignKeys, ...table.virtualForeignKeys]
      for (const fk of allFks) {
        const refModel = toPascalCase(fk.refTable)
        const relName = fk.columns[0].replace(/_id$/, '')
        lines.push(`  ${relName}   ${refModel}  @relation(fields: [${fk.columns[0]}], references: [${fk.refColumns[0]}])`)
      }

      // HasMany relations
      const reverse = reverseRels.get(table.name) ?? []
      for (const rel of reverse) {
        const relModelName = toPascalCase(rel.fromTable)
        lines.push(`  ${rel.fromTable} ${relModelName}[]`)
      }

      lines.push('}')
      lines.push('')
    }

    return lines.join('\n')
  }
}
```

- [ ] **Step 12: 執行測試**

```bash
bun run test -- test/unit/Infrastructure/Exporters/PrismaExporter.test.ts
```

Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts test/unit/Infrastructure/Exporters/PrismaExporter.test.ts
git commit -m "feat: [schema] PrismaExporter — Prisma schema 格式輸出"
```

### Sub-task 10d: EloquentExporter

- [ ] **Step 14: 寫 Eloquent 失敗測試**

```typescript
// test/unit/Infrastructure/Exporters/EloquentExporter.test.ts
import { describe, it, expect } from 'vitest'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(): ERModel {
  return {
    source: { system: 'mariadb', database: 'test', importedAt: '', dbcliVersion: '1.0.0' },
    tables: {
      users: {
        name: 'users',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'name', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
          { name: 'email', type: 'varchar(255)', nullable: 0, primaryKey: 0 },
          { name: 'created_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
          { name: 'updated_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
        ],
        rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [], virtualForeignKeys: [],
      },
      orders: {
        name: 'orders',
        columns: [
          { name: 'id', type: 'bigint(20)', nullable: 0, primaryKey: 1 },
          { name: 'user_id', type: 'bigint(20)', nullable: 0, primaryKey: 0 },
        ],
        rowCount: 5, engine: 'InnoDB', primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence: 'manual', createdAt: '' },
        ],
      },
    },
    groups: {},
  }
}

describe('EloquentExporter', () => {
  it('輸出含 $fillable 和關聯方法的 PHP Model', () => {
    const exporter = new EloquentExporter()
    const output = exporter.export(makeModel())

    // Users model
    expect(output).toContain('class User extends Model')
    expect(output).toContain("protected $table = 'users'")
    expect(output).toContain("'name'")
    expect(output).toContain("'email'")
    expect(output).toContain('public function orders()')
    expect(output).toContain('$this->hasMany(Order::class)')

    // Orders model
    expect(output).toContain('class Order extends Model')
    expect(output).toContain('public function user()')
    expect(output).toContain('$this->belongsTo(User::class)')
  })
})
```

- [ ] **Step 15: 實作 EloquentExporter.ts**

```typescript
// src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from './IExporter'

function toSingularPascalCase(tableName: string): string {
  // Simple singularization: remove trailing 's' or 'es'
  let singular = tableName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('ses') || singular.endsWith('xes') || singular.endsWith('zes')) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1)
  }
  return singular
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function toCamelCase(s: string): string {
  const parts = s.split('_')
  return parts[0] + parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at'])
const EXCLUDED_FILLABLE = new Set(['id', 'created_at', 'updated_at', 'deleted_at'])

export class EloquentExporter implements IExporter {
  readonly name = 'eloquent'
  readonly label = 'Laravel Eloquent Model'

  export(model: ERModel): string {
    const outputs: string[] = []

    // Collect reverse relations
    const reverseRels = new Map<string, Array<{ fromTable: string; fromColumn: string }>>()
    for (const table of Object.values(model.tables)) {
      for (const fk of [...table.foreignKeys, ...table.virtualForeignKeys]) {
        if (!reverseRels.has(fk.refTable)) {
          reverseRels.set(fk.refTable, [])
        }
        reverseRels.get(fk.refTable)!.push({ fromTable: table.name, fromColumn: fk.columns[0] })
      }
    }

    for (const table of Object.values(model.tables)) {
      const className = toSingularPascalCase(table.name)
      const fillable = table.columns
        .filter((c) => !EXCLUDED_FILLABLE.has(c.name))
        .map((c) => `        '${c.name}'`)

      const hasTimestamps = table.columns.some((c) => c.name === 'created_at') &&
        table.columns.some((c) => c.name === 'updated_at')
      const hasSoftDeletes = table.columns.some((c) => c.name === 'deleted_at')

      const lines: string[] = [
        '<?php',
        '',
        'namespace App\\Models;',
        '',
        'use Illuminate\\Database\\Eloquent\\Model;',
      ]

      if (hasSoftDeletes) {
        lines.push('use Illuminate\\Database\\Eloquent\\SoftDeletes;')
      }

      lines.push('')
      lines.push(`class ${className} extends Model`)
      lines.push('{')

      if (hasSoftDeletes) {
        lines.push('    use SoftDeletes;')
        lines.push('')
      }

      lines.push(`    protected $table = '${table.name}';`)
      lines.push('')

      if (!hasTimestamps) {
        lines.push('    public $timestamps = false;')
        lines.push('')
      }

      lines.push('    protected $fillable = [')
      lines.push(fillable.join(',\n'))
      lines.push('    ];')

      // BelongsTo
      const allFks = [...table.foreignKeys, ...table.virtualForeignKeys]
      for (const fk of allFks) {
        const relName = toCamelCase(fk.columns[0].replace(/_id$/, ''))
        const relClass = toSingularPascalCase(fk.refTable)
        lines.push('')
        lines.push(`    public function ${relName}()`)
        lines.push('    {')
        lines.push(`        return $this->belongsTo(${relClass}::class);`)
        lines.push('    }')
      }

      // HasMany
      const reverse = reverseRels.get(table.name) ?? []
      for (const rel of reverse) {
        const relName = toCamelCase(rel.fromTable)
        const relClass = toSingularPascalCase(rel.fromTable)
        lines.push('')
        lines.push(`    public function ${relName}()`)
        lines.push('    {')
        lines.push(`        return $this->hasMany(${relClass}::class);`)
        lines.push('    }')
      }

      lines.push('}')
      outputs.push(lines.join('\n'))
    }

    return outputs.join('\n\n// ---\n\n')
  }
}
```

- [ ] **Step 16: 執行測試**

```bash
bun run test -- test/unit/Infrastructure/Exporters/EloquentExporter.test.ts
```

Expected: PASS

- [ ] **Step 17: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts test/unit/Infrastructure/Exporters/EloquentExporter.test.ts
git commit -m "feat: [schema] EloquentExporter — Laravel Eloquent Model 輸出"
```

---

## Task 11: Application 層 — ExportService

**Files:**
- Create: `src/Modules/Schema/Application/Services/ExportService.ts`
- Test: `test/unit/Application/ExportService.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// test/unit/Application/ExportService.test.ts
import { describe, it, expect } from 'vitest'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

const model: ERModel = {
  source: { system: 'mariadb', database: 'test', importedAt: '', dbcliVersion: '1.0.0' },
  tables: {
    users: {
      name: 'users',
      columns: [{ name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 }],
      rowCount: 10, engine: 'InnoDB', primaryKey: ['id'],
      foreignKeys: [], virtualForeignKeys: [],
    },
  },
  groups: {},
}

describe('ExportService', () => {
  it('根據 format 選擇正確 exporter', () => {
    const service = new ExportService([new MermaidExporter(), new DbmlExporter()])
    const result = service.export(model, 'mermaid')

    expect(result).toContain('erDiagram')
  })

  it('不支援的 format 拋出錯誤', () => {
    const service = new ExportService([new MermaidExporter()])

    expect(() => service.export(model, 'unknown')).toThrow('Unsupported export format: unknown')
  })

  it('listFormats 回傳所有可用格式', () => {
    const service = new ExportService([new MermaidExporter(), new DbmlExporter()])
    const formats = service.listFormats()

    expect(formats).toEqual([
      { name: 'mermaid', label: 'Mermaid ER Diagram' },
      { name: 'dbml', label: 'DBML (dbdiagram.io)' },
    ])
  })
})
```

- [ ] **Step 2: 確認測試失敗**

```bash
bun run test -- test/unit/Application/ExportService.test.ts
```

Expected: FAIL

- [ ] **Step 3: 實作 ExportService.ts**

```typescript
// src/Modules/Schema/Application/Services/ExportService.ts
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

export class ExportService {
  private readonly exporters: Map<string, IExporter>

  constructor(exporters: IExporter[]) {
    this.exporters = new Map(exporters.map((e) => [e.name, e]))
  }

  export(model: ERModel, format: string): string {
    const exporter = this.exporters.get(format)
    if (!exporter) {
      throw new Error(`Unsupported export format: ${format}`)
    }
    return exporter.export(model)
  }

  listFormats(): Array<{ name: string; label: string }> {
    return Array.from(this.exporters.values()).map((e) => ({
      name: e.name,
      label: e.label,
    }))
  }
}
```

- [ ] **Step 4: 執行測試**

```bash
bun run test -- test/unit/Application/ExportService.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Application/Services/ExportService.ts test/unit/Application/ExportService.test.ts
git commit -m "feat: [schema] ExportService — pluggable exporter 調度"
```

---

## Task 12: Presentation 層 — Controller + Routes + ServiceProvider + Wiring

**Files:**
- Create: `src/Modules/Schema/Presentation/Controllers/SchemaController.ts`
- Create: `src/Modules/Schema/Presentation/Routes/Schema.routes.ts`
- Create: `src/Modules/Schema/Infrastructure/Providers/SchemaServiceProvider.ts`
- Create: `src/wiring/index.ts`
- Modify: `src/bootstrap.ts`
- Modify: `src/routes.ts`

- [ ] **Step 1: 建立 SchemaController.ts**

```typescript
// src/Modules/Schema/Presentation/Controllers/SchemaController.ts
import type { IHttpContext } from '@/Shared/Presentation/IHttpContext'
import { ApiResponse } from '@/Shared/Presentation/ApiResponse'
import type { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import type { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { addVirtualFK, removeVirtualFK, confirmSuggestion, ignoreSuggestion } from '@/Modules/Schema/Application/Services/VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export class SchemaController {
  constructor(
    private repo: JsonFileRepository,
    private exportService: ExportService,
  ) {}

  async getSchema(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded. Import a dbcli config first.'), 404)
    }
    return ctx.json(ApiResponse.success(model))
  }

  async addVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{
      tableName: string
      columns: string[]
      refTable: string
      refColumns: string[]
    }>()

    try {
      const updated = addVirtualFK(model, body)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success(updated.tables[body.tableName].virtualForeignKeys))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async deleteVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{ tableName: string }>()
    const vfkId = ctx.getParam('id')!

    try {
      const updated = removeVirtualFK(model, body.tableName, vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ deleted: vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async confirmVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{ tableName: string; vfkId: string }>()

    try {
      const updated = confirmSuggestion(model, body.tableName, body.vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ confirmed: body.vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async ignoreVirtualFK(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{ tableName: string; vfkId: string }>()

    try {
      const updated = ignoreSuggestion(model, body.tableName, body.vfkId)
      await this.repo.save(updated)
      return ctx.json(ApiResponse.success({ ignored: body.vfkId }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async updateGroups(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{ groups: ERModel['groups'] }>()

    const updated: ERModel = { ...model, groups: body.groups }
    await this.repo.save(updated)
    return ctx.json(ApiResponse.success(updated.groups))
  }

  async getSuggestions(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const suggestions: Array<{ tableName: string; vfk: any }> = []
    for (const table of Object.values(model.tables)) {
      for (const vfk of table.virtualForeignKeys) {
        if (vfk.confidence === 'auto-suggested') {
          suggestions.push({ tableName: table.name, vfk })
        }
      }
    }
    return ctx.json(ApiResponse.success(suggestions))
  }

  async exportSchema(ctx: IHttpContext): Promise<Response> {
    const model = await this.repo.load()
    if (!model) {
      return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
    }

    const body = await ctx.getBody<{ format: string }>()

    try {
      const output = this.exportService.export(model, body.format)
      return ctx.json(ApiResponse.success({ format: body.format, content: output }))
    } catch (error: any) {
      return ctx.json(ApiResponse.error('INVALID', error.message), 400)
    }
  }

  async listExportFormats(ctx: IHttpContext): Promise<Response> {
    return ctx.json(ApiResponse.success(this.exportService.listFormats()))
  }
}
```

- [ ] **Step 2: 建立 Schema.routes.ts**

```typescript
// src/Modules/Schema/Presentation/Routes/Schema.routes.ts
import type { IModuleRouter } from '@/Shared/Presentation/IModuleRouter'
import type { SchemaController } from '../Controllers/SchemaController'

export function registerSchemaRoutes(router: IModuleRouter, controller: SchemaController): void {
  router.group('/api', (r) => {
    r.get('/schema', (ctx) => controller.getSchema(ctx))
    r.put('/virtual-fk', (ctx) => controller.addVirtualFK(ctx))
    r.delete('/virtual-fk/:id', (ctx) => controller.deleteVirtualFK(ctx))
    r.post('/virtual-fk/confirm', (ctx) => controller.confirmVirtualFK(ctx))
    r.post('/virtual-fk/ignore', (ctx) => controller.ignoreVirtualFK(ctx))
    r.put('/groups', (ctx) => controller.updateGroups(ctx))
    r.get('/suggestions', (ctx) => controller.getSuggestions(ctx))
    r.post('/export', (ctx) => controller.exportSchema(ctx))
    r.get('/export/formats', (ctx) => controller.listExportFormats(ctx))
  })
}
```

- [ ] **Step 3: 建立 SchemaServiceProvider.ts**

```typescript
// src/Modules/Schema/Infrastructure/Providers/SchemaServiceProvider.ts
import { ModuleServiceProvider, type IContainer } from '@/Shared/Infrastructure/IServiceProvider'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import path from 'path'

export class SchemaServiceProvider extends ModuleServiceProvider {
  register(container: IContainer): void {
    container.singleton('jsonFileRepository', () => {
      const filePath = process.env.ARCHIVOLT_FILE ?? path.resolve(process.cwd(), 'archivolt.json')
      return new JsonFileRepository(filePath)
    })

    container.singleton('exportService', () => {
      return new ExportService([
        new MermaidExporter(),
        new DbmlExporter(),
        new PrismaExporter(),
        new EloquentExporter(),
      ])
    })
  }
}
```

- [ ] **Step 4: 建立 src/wiring/index.ts**

```typescript
// src/wiring/index.ts
import type { PlanetCore } from '@gravito/core'
import { createGravitoModuleRouter } from '@/Shared/Infrastructure/Framework/GravitoModuleRouter'
import { SchemaController } from '@/Modules/Schema/Presentation/Controllers/SchemaController'
import { registerSchemaRoutes } from '@/Modules/Schema/Presentation/Routes/Schema.routes'

export const registerSchema = (core: PlanetCore): void => {
  const router = createGravitoModuleRouter(core)
  const repo = core.container.make('jsonFileRepository') as any
  const exportService = core.container.make('exportService') as any
  const controller = new SchemaController(repo, exportService)
  registerSchemaRoutes(router, controller)
}
```

- [ ] **Step 5: 更新 src/bootstrap.ts**

```typescript
// src/bootstrap.ts
import { PlanetCore, defineConfig } from '@gravito/core'
import { buildConfig } from '../config/index'
import { createGravitoServiceProvider } from '@/Shared/Infrastructure/Framework/GravitoServiceProviderAdapter'
import { SchemaServiceProvider } from '@/Modules/Schema/Infrastructure/Providers/SchemaServiceProvider'
import { registerRoutes } from './routes'

export async function bootstrap(port = 3100): Promise<PlanetCore> {
  const configObj = buildConfig(port)

  const config = defineConfig({
    config: configObj,
  })

  const core = new PlanetCore(config)

  core.register(createGravitoServiceProvider(new SchemaServiceProvider()))

  await core.bootstrap()

  await registerRoutes(core)

  core.registerGlobalErrorHandlers()

  return core
}

export default bootstrap
```

- [ ] **Step 6: 更新 src/routes.ts**

```typescript
// src/routes.ts
import type { PlanetCore } from '@gravito/core'
import { registerSchema } from './wiring'

export async function registerRoutes(core: PlanetCore) {
  core.router.get('/api', async (ctx) => {
    return ctx.json({
      success: true,
      message: 'Archivolt API',
      version: '0.1.0',
    })
  })

  registerSchema(core)
}
```

- [ ] **Step 7: 驗證 typecheck**

```bash
bun run typecheck
```

Expected: 無錯誤

- [ ] **Step 8: 驗證 server 啟動 + API 回應**

```bash
# 在一個終端啟動 server
bun run dev &
sleep 2

# 測試 API root
curl -s http://localhost:3100/api | head

# 測試 schema（應回傳 404，因為還沒匯入）
curl -s http://localhost:3100/api/schema | head

# 測試 export formats
curl -s http://localhost:3100/api/export/formats | head

# 停止 server
kill %1
```

Expected: API root 回傳 JSON，schema 回傳 404，export/formats 回傳 4 個格式

- [ ] **Step 9: Commit**

```bash
git add src/Modules/Schema/Presentation/ src/Modules/Schema/Infrastructure/Providers/ src/wiring/ src/bootstrap.ts src/routes.ts
git commit -m "feat: [schema] Controller + Routes + ServiceProvider + Wiring — 完整 API 層"
```

---

## Task 13: CLI 匯入指令 — 讀取 dbcli config.json 並生成 archivolt.json

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 更新 src/index.ts 支援 --input 參數**

```typescript
// src/index.ts
import { createApp } from './app'
import { importSchema } from '@/Modules/Schema/Application/Services/ImportSchemaService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import path from 'path'

async function start() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf('--input')
  const reimport = args.includes('--reimport')

  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')
  const repo = new JsonFileRepository(archivoltPath)

  // Handle import
  if (inputIndex !== -1 && args[inputIndex + 1]) {
    const inputPath = path.resolve(args[inputIndex + 1])
    const file = Bun.file(inputPath)
    const exists = await file.exists()
    if (!exists) {
      console.error(`❌ Input file not found: ${inputPath}`)
      process.exit(1)
    }

    const dbcliJson = await file.json()

    const existingModel = await repo.load()

    if (existingModel && !reimport) {
      console.log('⚡ archivolt.json already exists. Use --reimport to update schema while preserving annotations.')
    } else if (existingModel && reimport) {
      // Reimport: update tables/columns, preserve virtualForeignKeys and groups
      const freshModel = importSchema(dbcliJson)
      const mergedTables: Record<string, any> = {}

      for (const [name, freshTable] of Object.entries(freshModel.tables)) {
        const existing = existingModel.tables[name]
        mergedTables[name] = {
          ...freshTable,
          virtualForeignKeys: existing ? existing.virtualForeignKeys : freshTable.virtualForeignKeys,
        }
      }

      await repo.save({
        ...freshModel,
        tables: mergedTables,
        groups: existingModel.groups,
      })
      console.log(`✅ Schema reimported from ${inputPath} (annotations preserved)`)
    } else {
      const model = importSchema(dbcliJson)
      await repo.save(model)
      console.log(`✅ Schema imported: ${Object.keys(model.tables).length} tables, ${Object.keys(model.groups).length} groups`)
    }
  }

  // Start server
  const core = await createApp()
  const port = (core.config.get<number>('PORT') ?? 3100) as number
  const server = core.liftoff(port)

  const schemaExists = await repo.exists()

  console.log(`
╔══════════════════════════════════════════╗
║        🏛️  Archivolt — Running            ║
╚══════════════════════════════════════════╝

📍 URL:    http://localhost:${port}
📌 API:    http://localhost:${port}/api
📊 Schema: ${schemaExists ? '✅ Loaded' : '❌ Not loaded (use --input to import)'}
`)

  return server
}

const server = await start().catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})

export default server
```

- [ ] **Step 2: 測試匯入**

```bash
bun run src/index.ts --input /Users/carl/Dev/CMG/Dbcli/.dbcli/config.json
```

Expected: 看到 `✅ Schema imported: 99 tables, N groups`，`archivolt.json` 生成

按 Ctrl+C 停止 server。

- [ ] **Step 3: 驗證 archivolt.json 結構**

```bash
bun -e "const d = await Bun.file('archivolt.json').json(); console.log('tables:', Object.keys(d.tables).length); console.log('groups:', Object.keys(d.groups).length); console.log('vFKs:', Object.values(d.tables).reduce((s, t) => s + t.virtualForeignKeys.length, 0))"
```

Expected: 99 tables, 多個 groups, 多個 auto-suggested vFKs

- [ ] **Step 4: 測試 API 回傳 schema**

```bash
bun run src/index.ts --input /Users/carl/Dev/CMG/Dbcli/.dbcli/config.json &
sleep 2
curl -s http://localhost:3100/api/schema | bun -e "const d = JSON.parse(await Bun.stdin.text()); console.log(d.success, Object.keys(d.data.tables).length)"
kill %1
```

Expected: `true 99`

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: [archivolt] CLI --input 匯入 dbcli JSON + --reimport 保留標註"
```

---

## Task 14: React 前端初始化 — Vite + Tailwind + shadcn/ui

**Files:**
- Create: `web/` directory with Vite React project
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/src/App.tsx`
- Create: `web/src/types/er-model.ts`
- Create: `web/src/api/schema.ts`

- [ ] **Step 1: 用 Vite 初始化 React 專案**

```bash
cd /Users/carl/Dev/CMG/Archivolt
bunx create-vite web --template react-ts
cd web
bun install
```

- [ ] **Step 2: 安裝 Tailwind CSS + shadcn/ui 依賴**

```bash
cd /Users/carl/Dev/CMG/Archivolt/web
bun add tailwindcss @tailwindcss/vite
bun add @xyflow/react zustand
bun add -d @types/node
```

- [ ] **Step 3: 設定 Vite proxy 到後端**

替換 `web/vite.config.ts`：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: 設定 Tailwind CSS**

替換 `web/src/index.css`：

```css
@import "tailwindcss";
```

- [ ] **Step 5: 建立共享型別 web/src/types/er-model.ts**

```typescript
// web/src/types/er-model.ts
export interface Column {
  name: string
  type: string
  nullable: 0 | 1
  default?: string
  primaryKey: 0 | 1
}

export interface ForeignKey {
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
}

export interface VirtualForeignKey {
  id: string
  columns: string[]
  refTable: string
  refColumns: string[]
  confidence: 'manual' | 'auto-suggested'
  createdAt: string
}

export interface Table {
  name: string
  columns: Column[]
  rowCount: number
  engine: string
  primaryKey: string[]
  foreignKeys: ForeignKey[]
  virtualForeignKeys: VirtualForeignKey[]
}

export interface Group {
  name: string
  tables: string[]
  auto: boolean
}

export interface ERModel {
  source: {
    system: string
    database: string
    importedAt: string
    dbcliVersion: string
  }
  tables: Record<string, Table>
  groups: Record<string, Group>
}
```

- [ ] **Step 6: 建立 API client web/src/api/schema.ts**

```typescript
// web/src/api/schema.ts
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
```

- [ ] **Step 7: 建立骨架 App.tsx**

```tsx
// web/src/App.tsx
import { useEffect, useState } from 'react'
import { schemaApi } from '@/api/schema'
import type { ERModel } from '@/types/er-model'

export default function App() {
  const [model, setModel] = useState<ERModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    schemaApi.getSchema()
      .then(setModel)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400">
        <p>Error: {error}</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <p>Loading schema...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Left: Group Panel */}
      <div className="w-60 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-red-400 mb-3">Groups</h2>
        {Object.entries(model.groups).map(([id, group]) => (
          <div key={id} className="bg-gray-800 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold">{group.name}</div>
            <div className="text-xs text-gray-500">{group.tables.length} tables</div>
          </div>
        ))}
      </div>

      {/* Center: Canvas placeholder */}
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>{Object.keys(model.tables).length} tables loaded — ReactFlow canvas coming next</p>
      </div>

      {/* Right: Detail Panel placeholder */}
      <div className="w-64 bg-gray-900 border-l border-gray-800 p-4">
        <h2 className="text-sm font-bold text-red-400 mb-3">Details</h2>
        <p className="text-xs text-gray-500">Select a table to see details</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 更新 web/src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: 驗證前端啟動**

在一個終端啟動後端（需先匯入 schema）：
```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run src/index.ts --input /Users/carl/Dev/CMG/Dbcli/.dbcli/config.json
```

在另一個終端啟動前端：
```bash
cd /Users/carl/Dev/CMG/Archivolt/web && bun run dev
```

瀏覽 http://localhost:5173，Expected: 看到三欄佈局，左側有分組列表，中間顯示表數量

- [ ] **Step 10: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add web/
git commit -m "feat: [web] React 前端初始化 — Vite + Tailwind + 三欄骨架 + API client"
```

---

## Task 15: ReactFlow 畫布 — 表節點 + 關聯邊 + 自動排列

**Files:**
- Create: `web/src/stores/schemaStore.ts`
- Create: `web/src/components/Canvas/TableNode.tsx`
- Create: `web/src/components/Canvas/edges.ts`
- Create: `web/src/components/Canvas/layoutEngine.ts`
- Create: `web/src/components/Canvas/ERCanvas.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 安裝 dagre 用於自動排列**

```bash
cd /Users/carl/Dev/CMG/Archivolt/web
bun add @dagrejs/dagre
```

- [ ] **Step 2: 建立 Zustand store**

```typescript
// web/src/stores/schemaStore.ts
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
```

- [ ] **Step 3: 建立 TableNode 元件**

```tsx
// web/src/components/Canvas/TableNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Table } from '@/types/er-model'

export interface TableNodeData {
  table: Table
  [key: string]: unknown
}

function TableNodeComponent({ data, selected }: NodeProps) {
  const table = (data as TableNodeData).table
  const fkColumns = new Set([
    ...table.foreignKeys.flatMap((fk) => fk.columns),
    ...table.virtualForeignKeys.flatMap((vfk) => vfk.columns),
  ])

  return (
    <div
      className={`bg-gray-800 rounded-lg border-2 min-w-[180px] overflow-hidden ${
        selected ? 'border-purple-500' : 'border-gray-600'
      }`}
    >
      <div className="bg-gray-700 px-3 py-2 text-sm font-semibold text-white">
        {table.name}
      </div>
      <div className="px-3 py-1.5">
        {table.columns.slice(0, 8).map((col) => (
          <div key={col.name} className="text-xs flex justify-between gap-2 py-0.5">
            <span className={
              col.primaryKey === 1
                ? 'text-red-400'
                : fkColumns.has(col.name)
                  ? 'text-green-400'
                  : 'text-gray-300'
            }>
              {col.primaryKey === 1 ? '🔑 ' : ''}{col.name}
            </span>
            <span className="text-gray-500">{col.type.replace(/\(.*\)/, '')}</span>
          </div>
        ))}
        {table.columns.length > 8 && (
          <div className="text-xs text-gray-500 py-0.5">+{table.columns.length - 8} more</div>
        )}
        <div className="text-xs text-gray-600 mt-1 border-t border-gray-700 pt-1">
          {table.rowCount.toLocaleString()} rows
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-green-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
```

- [ ] **Step 4: 建立邊的樣式定義**

```typescript
// web/src/components/Canvas/edges.ts
import type { Edge } from '@xyflow/react'
import type { ERModel } from '@/types/er-model'

export function buildEdges(model: ERModel): Edge[] {
  const edges: Edge[] = []

  for (const table of Object.values(model.tables)) {
    // Explicit FK — solid green
    for (const fk of table.foreignKeys) {
      edges.push({
        id: `fk-${table.name}-${fk.name}`,
        source: table.name,
        target: fk.refTable,
        label: fk.columns[0],
        style: { stroke: '#22c55e', strokeWidth: 2 },
        labelStyle: { fill: '#22c55e', fontSize: 10 },
        type: 'default',
      })
    }

    // Virtual FK
    for (const vfk of table.virtualForeignKeys) {
      const isManual = vfk.confidence === 'manual'
      edges.push({
        id: `vfk-${table.name}-${vfk.id}`,
        source: table.name,
        target: vfk.refTable,
        label: `${vfk.columns[0]}${isManual ? '' : ' ⚡'}`,
        style: {
          stroke: isManual ? '#a855f7' : '#f59e0b',
          strokeWidth: 2,
          strokeDasharray: isManual ? 'none' : '6 4',
        },
        labelStyle: { fill: isManual ? '#a855f7' : '#f59e0b', fontSize: 10 },
        type: 'default',
      })
    }
  }

  return edges
}
```

- [ ] **Step 5: 建立自動排列引擎**

```typescript
// web/src/components/Canvas/layoutEngine.ts
import Dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 150 })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  Dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - 100, y: pos.y - 75 },
    }
  })
}
```

- [ ] **Step 6: 建立 ERCanvas 元件**

```tsx
// web/src/components/Canvas/ERCanvas.tsx
import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSchemaStore } from '@/stores/schemaStore'
import { TableNode, type TableNodeData } from './TableNode'
import { buildEdges } from './edges'
import { autoLayout } from './layoutEngine'
import { schemaApi } from '@/api/schema'

const nodeTypes = { tableNode: TableNode }

export function ERCanvas() {
  const { model, visibleGroups, selectTable, refreshModel } = useSchemaStore()

  const visibleTables = useMemo(() => {
    if (!model) return []
    const visible = new Set<string>()
    for (const [groupId, group] of Object.entries(model.groups)) {
      if (visibleGroups.has(groupId)) {
        for (const t of group.tables) visible.add(t)
      }
    }
    return Array.from(visible)
  }, [model, visibleGroups])

  const initialNodes = useMemo((): Node[] => {
    if (!model) return []
    const nodes: Node[] = visibleTables.map((name) => ({
      id: name,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: { table: model.tables[name] } satisfies TableNodeData,
    }))
    const edges = buildEdges(model).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target)
    )
    return autoLayout(nodes, edges)
  }, [model, visibleTables])

  const initialEdges = useMemo(() => {
    if (!model) return []
    return buildEdges(model).filter(
      (e) => visibleTables.includes(e.source) && visibleTables.includes(e.target)
    )
  }, [model, visibleTables])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when model or visibility changes
  useMemo(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectTable(node.id)
  }, [selectTable])

  const onConnect = useCallback(async (connection: Connection) => {
    if (!model || !connection.source || !connection.target) return
    const sourceTable = model.tables[connection.source]
    if (!sourceTable) return

    // Find a _id column that points to target
    const candidate = sourceTable.columns.find((c) =>
      c.name.endsWith('_id') && !sourceTable.foreignKeys.some((fk) => fk.columns.includes(c.name))
    )

    if (!candidate) return

    try {
      await schemaApi.addVirtualFK({
        tableName: connection.source,
        columns: [candidate.name],
        refTable: connection.target,
        refColumns: ['id'],
      })
      const updated = await schemaApi.getSchema()
      refreshModel(updated)
    } catch (e) {
      console.error('Failed to add virtual FK:', e)
    }
  }, [model, refreshModel])

  if (!model) return null

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      className="bg-gray-950"
    >
      <Background color="#333" gap={20} />
      <Controls className="!bg-gray-800 !border-gray-700 !text-white" />
      <MiniMap className="!bg-gray-900" nodeColor="#4b5563" />
    </ReactFlow>
  )
}
```

- [ ] **Step 7: 更新 App.tsx 整合 ERCanvas**

```tsx
// web/src/App.tsx
import { useEffect } from 'react'
import { useSchemaStore } from '@/stores/schemaStore'
import { ERCanvas } from '@/components/Canvas/ERCanvas'

export default function App() {
  const { model, loading, error, fetchSchema, visibleGroups, toggleGroup, selectedTable } = useSchemaStore()

  useEffect(() => {
    fetchSchema()
  }, [fetchSchema])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400">
        <p>Error: {error}</p>
      </div>
    )
  }

  if (loading || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <p>Loading schema...</p>
      </div>
    )
  }

  const selected = selectedTable ? model.tables[selectedTable] : null

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Left: Group Panel */}
      <div className="w-60 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-red-400 mb-3">Groups</h2>
        {Object.entries(model.groups).map(([id, group]) => (
          <button
            key={id}
            onClick={() => toggleGroup(id)}
            className={`w-full text-left bg-gray-800 rounded-lg p-3 mb-2 transition ${
              visibleGroups.has(id) ? 'border border-blue-500' : 'border border-transparent opacity-60'
            }`}
          >
            <div className="text-sm font-semibold">{group.name}</div>
            <div className="text-xs text-gray-500 mt-1">{group.tables.length} tables</div>
          </button>
        ))}
      </div>

      {/* Center: ReactFlow Canvas */}
      <div className="flex-1">
        <ERCanvas />
      </div>

      {/* Right: Detail Panel */}
      <div className="w-64 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-red-400 mb-3">Details</h2>
        {selected ? (
          <div>
            <h3 className="text-sm font-semibold mb-2">{selected.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{selected.engine} | {selected.rowCount.toLocaleString()} rows</p>
            <div className="text-xs space-y-1">
              {selected.columns.map((col) => (
                <div key={col.name} className="flex justify-between">
                  <span className={col.primaryKey === 1 ? 'text-red-400' : 'text-gray-300'}>
                    {col.name}
                  </span>
                  <span className="text-gray-500">{col.type}</span>
                </div>
              ))}
            </div>
            {selected.foreignKeys.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-green-400 mb-1">FK ({selected.foreignKeys.length})</div>
                {selected.foreignKeys.map((fk) => (
                  <div key={fk.name} className="text-xs text-gray-300">→ {fk.refTable}.{fk.refColumns[0]}</div>
                ))}
              </div>
            )}
            {selected.virtualForeignKeys.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-amber-400 mb-1">Virtual FK ({selected.virtualForeignKeys.length})</div>
                {selected.virtualForeignKeys.map((vfk) => (
                  <div key={vfk.id} className="text-xs text-gray-300">
                    → {vfk.refTable}.{vfk.refColumns[0]} ({vfk.confidence})
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Select a table to see details</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 驗證完整前端**

同時啟動後端和前端，瀏覽 http://localhost:5173。

Expected: 看到左側群組列表、中間 ReactFlow 畫布有表節點和關聯邊、右側點擊表後顯示詳情。

- [ ] **Step 9: Commit**

```bash
cd /Users/carl/Dev/CMG/Archivolt
git add web/src/stores/ web/src/components/Canvas/ web/src/App.tsx web/package.json web/bun.lock
git commit -m "feat: [web] ReactFlow 畫布 — 表節點 + 關聯邊 + dagre 自動排列 + Zustand store"
```

---

## Task 16: 在根目錄加入 dev script 同時啟動前後端

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 更新根 package.json 的 scripts**

在 `scripts` 中加入：

```json
{
  "dev": "bun run --hot src/index.ts",
  "dev:web": "cd web && bun run dev",
  "dev:all": "bun run dev & cd web && bun run dev"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: [archivolt] dev:all script 同時啟動前後端"
```

---

以上 16 個 Task 完成後，Archivolt 即具備：

1. **匯入**：CLI `--input` 匯入 dbcli JSON
2. **智慧分組**：自動分群 + 關聯推測
3. **視覺化**：ReactFlow 畫布 + 三欄式佈局
4. **標註**：拖拉連線 + 右側面板 virtual FK 管理
5. **即時存檔**：每次操作即時寫入 archivolt.json
6. **輸出**：Eloquent / Prisma / DBML / Mermaid 四種格式
