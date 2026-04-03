# Export File Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 export 從 API-only 擴展為 CLI 指令，支援 stdout / 檔案輸出 / Laravel artisan 整合。

**Architecture:** Exporter 回傳 `ExportResult`（filename→content Map），FileWriter 層根據 CLI 參數選擇輸出策略（stdout / 目錄寫檔 / artisan 流程）。CLI 指令解析參數並串接兩層。

**Tech Stack:** TypeScript, Bun, Vitest

---

## File Structure

### 修改的檔案

| 檔案 | 職責 |
|------|------|
| `src/Modules/Schema/Infrastructure/Exporters/IExporter.ts` | 新增 ExportResult 型別，改 export() 回傳 |
| `src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts` | 回傳 ExportResult |
| `src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts` | 回傳 ExportResult |
| `src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts` | 回傳 ExportResult + datasource/generator |
| `src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts` | 回傳 ExportResult，每 Model 一個 entry |
| `src/Modules/Schema/Application/Services/ExportService.ts` | 適配 ExportResult |
| `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` | files 合併回字串，API 不變 |
| `test/unit/Infrastructure/Exporters/MermaidExporter.test.ts` | 適配 ExportResult |
| `test/unit/Infrastructure/Exporters/DbmlExporter.test.ts` | 適配 ExportResult |
| `test/unit/Infrastructure/Exporters/PrismaExporter.test.ts` | 適配 ExportResult |
| `test/unit/Infrastructure/Exporters/EloquentExporter.test.ts` | 適配 ExportResult |
| `test/unit/Application/ExportService.test.ts` | 適配 ExportResult |

### 新增的檔案

| 檔案 | 職責 |
|------|------|
| `src/Modules/Schema/Infrastructure/Writers/IFileWriter.ts` | FileWriter 介面 |
| `src/Modules/Schema/Infrastructure/Writers/StdoutWriter.ts` | stdout 輸出 |
| `src/Modules/Schema/Infrastructure/Writers/DirectoryWriter.ts` | 目錄寫檔 |
| `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts` | artisan + 覆寫 |
| `src/CLI/ExportCommand.ts` | CLI export 指令 |
| `test/unit/Infrastructure/Writers/StdoutWriter.test.ts` | StdoutWriter 測試 |
| `test/unit/Infrastructure/Writers/DirectoryWriter.test.ts` | DirectoryWriter 測試 |
| `test/unit/Infrastructure/Writers/LaravelArtisanWriter.test.ts` | LaravelArtisanWriter 測試 |
| `test/unit/CLI/ExportCommand.test.ts` | CLI 指令測試 |

---

## Task 1: ExportResult 型別 + IExporter 介面更新

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Exporters/IExporter.ts`

- [ ] **Step 1: 更新 IExporter.ts，新增 ExportResult 並改 export() 回傳型別**

```typescript
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

export interface ExportResult {
  readonly files: ReadonlyMap<string, string>
}

export interface IExporter {
  readonly name: string
  readonly label: string
  export(model: ERModel): ExportResult
}
```

- [ ] **Step 2: 執行 typecheck 確認型別錯誤（預期 4 個 exporter + ExportService + Controller 會報錯）**

Run: `bun run typecheck`
Expected: FAIL — 各 exporter 回傳 string 但介面要求 ExportResult

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/IExporter.ts
git commit -m "refactor: [schema] ExportResult 型別 — export() 回傳 filename→content Map"
```

---

## Task 2: MermaidExporter 適配 ExportResult

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts`
- Modify: `test/unit/Infrastructure/Exporters/MermaidExporter.test.ts`

- [ ] **Step 1: 更新測試，改為從 ExportResult 取內容**

```typescript
import { describe, it, expect } from 'vitest'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

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
        { name: 'total', type: 'decimal', nullable: 1, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [
        {
          id: 'vfk_1',
          columns: ['product_id'],
          refTable: 'products',
          refColumns: ['id'],
          confidence: 'auto-suggested',
          createdAt: new Date(),
        },
      ],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'name', type: 'varchar', nullable: 0, primaryKey: 0 },
      ],
      rowCount: 50,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [],
    },
    products: {
      name: 'products',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'title', type: 'varchar', nullable: 0, primaryKey: 0 },
      ],
      rowCount: 200,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [],
      virtualForeignKeys: [],
    },
  },
  groups: {},
}

describe('MermaidExporter', () => {
  const exporter = new MermaidExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('mermaid')
    expect(exporter.label).toBe('Mermaid ER Diagram')
  })

  it('returns ExportResult with schema.mmd file', () => {
    const result = exporter.export(model)
    expect(result.files.has('schema.mmd')).toBe(true)
    expect(result.files.size).toBe(1)
  })

  it('outputs erDiagram header', () => {
    const result = exporter.export(model)
    const content = result.files.get('schema.mmd')!
    expect(content).toContain('erDiagram')
  })

  it('outputs table column definitions', () => {
    const content = exporter.export(model).files.get('schema.mmd')!
    expect(content).toContain('orders {')
    expect(content).toContain('bigint id')
    expect(content).toContain('users {')
  })

  it('outputs FK relationships', () => {
    const content = exporter.export(model).files.get('schema.mmd')!
    expect(content).toContain('orders }o--|| users')
  })

  it('outputs virtualFK relationships', () => {
    const content = exporter.export(model).files.get('schema.mmd')!
    expect(content).toContain('orders }o--|| products')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Exporters/MermaidExporter.test.ts`
Expected: FAIL — export() 回傳 string 不是 ExportResult

- [ ] **Step 3: 更新 MermaidExporter 回傳 ExportResult**

```typescript
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter, ExportResult } from './IExporter'

export class MermaidExporter implements IExporter {
  readonly name = 'mermaid'
  readonly label = 'Mermaid ER Diagram'

  export(model: ERModel): ExportResult {
    const lines: string[] = ['erDiagram']

    for (const table of Object.values(model.tables)) {
      lines.push(`  ${table.name} {`)
      for (const col of table.columns) {
        lines.push(`    ${col.type} ${col.name}`)
      }
      lines.push('  }')
    }

    lines.push('')

    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`  ${table.name} }o--|| ${fk.refTable} : "${fk.columns.join(', ')}"`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`  ${table.name} }o--|| ${vfk.refTable} : "${vfk.columns.join(', ')}"`)
      }
    }

    return { files: new Map([['schema.mmd', lines.join('\n')]]) }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Exporters/MermaidExporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts test/unit/Infrastructure/Exporters/MermaidExporter.test.ts
git commit -m "refactor: [schema] MermaidExporter 適配 ExportResult"
```

---

## Task 3: DbmlExporter 適配 ExportResult

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts`
- Modify: `test/unit/Infrastructure/Exporters/DbmlExporter.test.ts`

- [ ] **Step 1: 更新測試，改為從 ExportResult 取 schema.dbml**

測試結構與 MermaidExporter 相同，差異：
- 檔名改為 `schema.dbml`
- 斷言內容不變（`Table orders {`、`Ref:`）

```typescript
import { describe, it, expect } from 'vitest'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

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
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'name', type: 'varchar', nullable: 0, primaryKey: 0 },
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

describe('DbmlExporter', () => {
  const exporter = new DbmlExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('dbml')
    expect(exporter.label).toBe('DBML')
  })

  it('returns ExportResult with schema.dbml file', () => {
    const result = exporter.export(model)
    expect(result.files.has('schema.dbml')).toBe(true)
    expect(result.files.size).toBe(1)
  })

  it('outputs table definitions', () => {
    const content = exporter.export(model).files.get('schema.dbml')!
    expect(content).toContain('Table orders {')
    expect(content).toContain('Table users {')
  })

  it('outputs FK refs', () => {
    const content = exporter.export(model).files.get('schema.dbml')!
    expect(content).toContain('Ref: orders.user_id > users.id')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Exporters/DbmlExporter.test.ts`
Expected: FAIL

- [ ] **Step 3: 更新 DbmlExporter 回傳 ExportResult**

```typescript
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter, ExportResult } from './IExporter'

export class DbmlExporter implements IExporter {
  readonly name = 'dbml'
  readonly label = 'DBML'

  export(model: ERModel): ExportResult {
    const lines: string[] = []

    for (const table of Object.values(model.tables)) {
      lines.push(`Table ${table.name} {`)
      for (const col of table.columns) {
        lines.push(`  ${col.name} ${col.type}`)
      }
      lines.push('}')
      lines.push('')
    }

    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        lines.push(`Ref: ${table.name}.${fk.columns[0]} > ${fk.refTable}.${fk.refColumns[0]}`)
      }
      for (const vfk of table.virtualForeignKeys) {
        lines.push(`Ref: ${table.name}.${vfk.columns[0]} > ${vfk.refTable}.${vfk.refColumns[0]}`)
      }
    }

    return { files: new Map([['schema.dbml', lines.join('\n').trim()]]) }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Exporters/DbmlExporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts test/unit/Infrastructure/Exporters/DbmlExporter.test.ts
git commit -m "refactor: [schema] DbmlExporter 適配 ExportResult"
```

---

## Task 4: PrismaExporter 適配 ExportResult + datasource/generator

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts`
- Modify: `test/unit/Infrastructure/Exporters/PrismaExporter.test.ts`

- [ ] **Step 1: 更新測試，加入 datasource/generator 斷言**

```typescript
import { describe, it, expect } from 'vitest'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

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
        { name: 'created_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
        { name: 'note', type: 'varchar', nullable: 1, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'name', type: 'varchar', nullable: 0, primaryKey: 0 },
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

describe('PrismaExporter', () => {
  const exporter = new PrismaExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('prisma')
    expect(exporter.label).toBe('Prisma Schema')
  })

  it('returns ExportResult with schema.prisma file', () => {
    const result = exporter.export(model)
    expect(result.files.has('schema.prisma')).toBe(true)
    expect(result.files.size).toBe(1)
  })

  it('outputs datasource block with provider from source.system', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('datasource db {')
    expect(content).toContain('provider = "mysql"')
    expect(content).toContain('url      = env("DATABASE_URL")')
  })

  it('outputs generator block', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('generator client {')
    expect(content).toContain('provider = "prisma-client-js"')
  })

  it('maps mariadb to mysql provider', () => {
    const mariaModel: ERModel = { ...model, source: { ...model.source, system: 'mariadb' } }
    const content = exporter.export(mariaModel).files.get('schema.prisma')!
    expect(content).toContain('provider = "mysql"')
  })

  it('outputs model blocks with PascalCase names', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('model Orders {')
    expect(content).toContain('model Users {')
  })

  it('maps SQL types to Prisma types', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('BigInt')
    expect(content).toContain('String')
    expect(content).toContain('DateTime')
  })

  it('marks primary key with @id', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('@id')
  })

  it('generates @relation from FK', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('@relation')
  })

  it('nullable fields use ? suffix', () => {
    const content = exporter.export(model).files.get('schema.prisma')!
    expect(content).toContain('DateTime?')
    expect(content).toContain('String?')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Exporters/PrismaExporter.test.ts`
Expected: FAIL — 缺少 datasource/generator，回傳型別不對

- [ ] **Step 3: 更新 PrismaExporter**

在現有 `PrismaExporter.ts` 的 `export()` 方法中：

1. 開頭加入 `mapSystemToProvider()` 輔助函式
2. 在 model blocks 前加入 datasource + generator 區塊
3. 回傳 `ExportResult`

```typescript
import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter, ExportResult } from './IExporter'

function toPascalCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function mapSqlTypeToPrisma(sqlType: string, nullable: 0 | 1): string {
  const lower = sqlType.toLowerCase()
  let prismaType: string

  if (lower.includes('bigint') || lower.includes('int8')) {
    prismaType = 'BigInt'
  } else if (lower.includes('int')) {
    prismaType = 'Int'
  } else if (lower.includes('float') || lower.includes('double') || lower.includes('decimal') || lower.includes('numeric')) {
    prismaType = 'Float'
  } else if (lower.includes('bool')) {
    prismaType = 'Boolean'
  } else if (lower.includes('timestamp') || lower.includes('datetime') || lower.includes('date')) {
    prismaType = 'DateTime'
  } else if (lower.includes('json')) {
    prismaType = 'Json'
  } else {
    prismaType = 'String'
  }

  return nullable === 1 ? `${prismaType}?` : prismaType
}

function mapSystemToProvider(system: string): string {
  const lower = system.toLowerCase()
  if (lower === 'mariadb' || lower === 'mysql') return 'mysql'
  if (lower === 'postgresql' || lower === 'postgres') return 'postgresql'
  if (lower === 'sqlite') return 'sqlite'
  return 'mysql'
}

interface RelationRef {
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
  readonly name: string
}

export class PrismaExporter implements IExporter {
  readonly name = 'prisma'
  readonly label = 'Prisma Schema'

  export(model: ERModel): ExportResult {
    const relations: RelationRef[] = []
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: fk.columns[0],
          toTable: fk.refTable,
          toColumn: fk.refColumns[0],
          name: fk.name,
        })
      }
      for (const vfk of table.virtualForeignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: vfk.columns[0],
          toTable: vfk.refTable,
          toColumn: vfk.refColumns[0],
          name: vfk.id,
        })
      }
    }

    const provider = mapSystemToProvider(model.source.system)
    const blocks: string[] = [
      `datasource db {\n  provider = "${provider}"\n  url      = env("DATABASE_URL")\n}`,
      '',
      'generator client {\n  provider = "prisma-client-js"\n}',
    ]

    for (const table of Object.values(model.tables)) {
      blocks.push('')
      blocks.push(this.renderModel(table, relations, model.tables))
    }

    return { files: new Map([['schema.prisma', blocks.join('\n')]]) }
  }

  private renderModel(
    table: Table,
    allRelations: readonly RelationRef[],
    allTables: Record<string, Table>,
  ): string {
    const lines: string[] = [`model ${toPascalCase(table.name)} {`]

    const pkSet = new Set(table.primaryKey)
    const belongsToRelations = allRelations.filter((r) => r.fromTable === table.name)
    const fkColumnNames = new Set(belongsToRelations.map((r) => r.fromColumn))

    for (const col of table.columns) {
      if (fkColumnNames.has(col.name) && !pkSet.has(col.name)) {
        lines.push(`  ${col.name} ${mapSqlTypeToPrisma(col.type, col.nullable)}`)
        continue
      }
      const prismaType = mapSqlTypeToPrisma(col.type, col.nullable)
      const idAttr = pkSet.has(col.name) ? ' @id' : ''
      lines.push(`  ${col.name} ${prismaType}${idAttr}`)
    }

    for (const rel of belongsToRelations) {
      const refPascal = toPascalCase(rel.toTable)
      lines.push(`  ${rel.toTable} ${refPascal} @relation(fields: [${rel.fromColumn}], references: [${rel.toColumn}])`)
    }

    const hasManyRelations = allRelations.filter((r) => r.toTable === table.name)
    for (const rel of hasManyRelations) {
      if (!(rel.fromTable in allTables)) continue
      lines.push(`  ${rel.fromTable} ${toPascalCase(rel.fromTable)}[]`)
    }

    lines.push('}')
    return lines.join('\n')
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Exporters/PrismaExporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts test/unit/Infrastructure/Exporters/PrismaExporter.test.ts
git commit -m "refactor: [schema] PrismaExporter 適配 ExportResult + datasource/generator 區塊"
```

---

## Task 5: EloquentExporter 適配 ExportResult（每 Model 一檔）

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts`
- Modify: `test/unit/Infrastructure/Exporters/EloquentExporter.test.ts`

- [ ] **Step 1: 更新測試，改為從 ExportResult 取個別 Model 檔**

```typescript
import { describe, it, expect } from 'vitest'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

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
        { name: 'total', type: 'decimal', nullable: 0, primaryKey: 0 },
        { name: 'deleted_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
      ],
      rowCount: 100,
      engine: 'InnoDB',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_orders_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      ],
      virtualForeignKeys: [],
    },
    users: {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', nullable: 0, primaryKey: 1 },
        { name: 'name', type: 'varchar', nullable: 0, primaryKey: 0 },
        { name: 'created_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
        { name: 'updated_at', type: 'timestamp', nullable: 1, primaryKey: 0 },
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

describe('EloquentExporter', () => {
  const exporter = new EloquentExporter()

  it('has correct name and label', () => {
    expect(exporter.name).toBe('eloquent')
    expect(exporter.label).toBe('Laravel Eloquent Models')
  })

  it('returns one file per table', () => {
    const result = exporter.export(model)
    expect(result.files.size).toBe(2)
    expect(result.files.has('Order.php')).toBe(true)
    expect(result.files.has('User.php')).toBe(true)
  })

  it('outputs PHP namespace and class in each file', () => {
    const result = exporter.export(model)
    const orderContent = result.files.get('Order.php')!
    expect(orderContent).toContain('namespace App\\Models;')
    expect(orderContent).toContain('class Order extends Model')
  })

  it('outputs $table property', () => {
    const orderContent = exporter.export(model).files.get('Order.php')!
    expect(orderContent).toContain("protected $table = 'orders';")
  })

  it('outputs $fillable with non-PK columns', () => {
    const orderContent = exporter.export(model).files.get('Order.php')!
    expect(orderContent).toContain("'user_id'")
    expect(orderContent).toContain("'total'")
  })

  it('uses SoftDeletes when deleted_at column exists', () => {
    const orderContent = exporter.export(model).files.get('Order.php')!
    expect(orderContent).toContain('SoftDeletes')
  })

  it('generates belongsTo method from FK', () => {
    const orderContent = exporter.export(model).files.get('Order.php')!
    expect(orderContent).toContain('public function user()')
    expect(orderContent).toContain('return $this->belongsTo')
  })

  it('generates hasMany method in referenced model', () => {
    const userContent = exporter.export(model).files.get('User.php')!
    expect(userContent).toContain('public function orders()')
    expect(userContent).toContain('return $this->hasMany')
  })

  it('detects $timestamps from created_at/updated_at columns', () => {
    const orderContent = exporter.export(model).files.get('Order.php')!
    expect(orderContent).toContain('public $timestamps = false;')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Exporters/EloquentExporter.test.ts`
Expected: FAIL

- [ ] **Step 3: 更新 EloquentExporter，每個 Model 一個 Map entry**

將 `export()` 方法改為：遍歷 tables，對每張表呼叫 `renderModel()` 取得內容，以 `{ClassName}.php` 為 key 存入 Map。

```typescript
import type { ERModel, Table } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter, ExportResult } from './IExporter'

function toPascalCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function toSingularPascalCase(tableName: string): string {
  let singular = tableName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('es') && singular.length > 3) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && singular.length > 1) {
    singular = singular.slice(0, -1)
  }
  return toPascalCase(singular)
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

interface RelationRef {
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
}

export class EloquentExporter implements IExporter {
  readonly name = 'eloquent'
  readonly label = 'Laravel Eloquent Models'

  export(model: ERModel): ExportResult {
    const relations: RelationRef[] = []
    for (const table of Object.values(model.tables)) {
      for (const fk of table.foreignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: fk.columns[0],
          toTable: fk.refTable,
          toColumn: fk.refColumns[0],
        })
      }
      for (const vfk of table.virtualForeignKeys) {
        relations.push({
          fromTable: table.name,
          fromColumn: vfk.columns[0],
          toTable: vfk.refTable,
          toColumn: vfk.refColumns[0],
        })
      }
    }

    const files = new Map<string, string>()
    for (const table of Object.values(model.tables)) {
      const className = toSingularPascalCase(table.name)
      const content = this.renderModel(table, relations, model.tables)
      files.set(`${className}.php`, content)
    }

    return { files }
  }

  private renderModel(
    table: Table,
    allRelations: readonly RelationRef[],
    allTables: Record<string, Table>,
  ): string {
    const className = toSingularPascalCase(table.name)
    const pkSet = new Set(table.primaryKey)
    const colNames = table.columns.map((c) => c.name)
    const hasSoftDeletes = colNames.includes('deleted_at')
    const hasTimestamps = colNames.includes('created_at') && colNames.includes('updated_at')

    const lines: string[] = []

    lines.push('<?php')
    lines.push('')
    lines.push('namespace App\\Models;')
    lines.push('')
    lines.push('use Illuminate\\Database\\Eloquent\\Model;')
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

    const timestampCols = new Set(['created_at', 'updated_at', 'deleted_at'])
    const fillable = table.columns
      .filter((c) => !pkSet.has(c.name) && !timestampCols.has(c.name))
      .map((c) => `'${c.name}'`)
    if (fillable.length > 0) {
      lines.push(`    protected $fillable = [${fillable.join(', ')}];`)
      lines.push('')
    }

    const belongsToRels = allRelations.filter((r) => r.fromTable === table.name)
    for (const rel of belongsToRels) {
      const methodName = toCamelCase(toSingularPascalCase(rel.toTable))
      const relClass = toSingularPascalCase(rel.toTable)
      lines.push(`    public function ${methodName}()`)
      lines.push('    {')
      lines.push(`        return $this->belongsTo(${relClass}::class, '${rel.fromColumn}', '${rel.toColumn}');`)
      lines.push('    }')
      lines.push('')
    }

    const hasManyRels = allRelations.filter(
      (r) => r.toTable === table.name && r.fromTable in allTables,
    )
    for (const rel of hasManyRels) {
      const methodName = rel.fromTable
      const relClass = toSingularPascalCase(rel.fromTable)
      lines.push(`    public function ${methodName}()`)
      lines.push('    {')
      lines.push(`        return $this->hasMany(${relClass}::class, '${rel.fromColumn}', '${rel.toColumn}');`)
      lines.push('    }')
      lines.push('')
    }

    lines.push('}')

    return lines.join('\n')
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Exporters/EloquentExporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts test/unit/Infrastructure/Exporters/EloquentExporter.test.ts
git commit -m "refactor: [schema] EloquentExporter 適配 ExportResult — 每 Model 一個檔案"
```

---

## Task 6: ExportService + SchemaController 適配 ExportResult

**Files:**
- Modify: `src/Modules/Schema/Application/Services/ExportService.ts`
- Modify: `src/Modules/Schema/Presentation/Controllers/SchemaController.ts`
- Modify: `test/unit/Application/ExportService.test.ts`

- [ ] **Step 1: 更新 ExportService 測試**

```typescript
import { describe, it, expect } from 'vitest'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { IExporter, ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

const emptyModel: ERModel = {
  source: {
    system: 'mysql',
    database: 'test',
    importedAt: new Date(),
    dbcliVersion: '1.0.0',
  },
  tables: {},
  groups: {},
}

const mockExporterA: IExporter = {
  name: 'format_a',
  label: 'Format A',
  export: (_model): ExportResult => ({ files: new Map([['a.txt', 'output_a']]) }),
}

const mockExporterB: IExporter = {
  name: 'format_b',
  label: 'Format B',
  export: (_model): ExportResult => ({ files: new Map([['b.txt', 'output_b']]) }),
}

describe('ExportService', () => {
  it('listFormats returns available formats', () => {
    const service = new ExportService([mockExporterA, mockExporterB])
    const formats = service.listFormats()
    expect(formats).toEqual([
      { name: 'format_a', label: 'Format A' },
      { name: 'format_b', label: 'Format B' },
    ])
  })

  it('export returns ExportResult', () => {
    const service = new ExportService([mockExporterA, mockExporterB])
    const result = service.export(emptyModel, 'format_a')
    expect(result.files.get('a.txt')).toBe('output_a')
  })

  it('export throws if format is not found', () => {
    const service = new ExportService([mockExporterA])
    expect(() => service.export(emptyModel, 'unknown')).toThrow()
  })

  it('works with real exporters', () => {
    const service = new ExportService([new MermaidExporter(), new DbmlExporter()])
    const formats = service.listFormats()
    expect(formats.map((f) => f.name)).toContain('mermaid')
    expect(formats.map((f) => f.name)).toContain('dbml')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Application/ExportService.test.ts`
Expected: FAIL

- [ ] **Step 3: 更新 ExportService — export() 回傳 ExportResult**

```typescript
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'
import type { IExporter, ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

export class ExportService {
  private readonly exporters: Map<string, IExporter>

  constructor(exporters: IExporter[]) {
    this.exporters = new Map(exporters.map((e) => [e.name, e]))
  }

  export(model: ERModel, format: string): ExportResult {
    const exporter = this.exporters.get(format)
    if (!exporter) {
      throw new Error(`Exporter not found for format: "${format}"`)
    }
    return exporter.export(model)
  }

  listFormats(): Array<{ name: string; label: string }> {
    return [...this.exporters.values()].map((e) => ({ name: e.name, label: e.label }))
  }
}
```

- [ ] **Step 4: 更新 SchemaController.exportSchema — 合併 files 為字串**

在 `SchemaController.ts` 的 `exportSchema` 方法中，將 `ExportResult.files` 的所有 value 合併為字串：

```typescript
async exportSchema(ctx: IHttpContext): Promise<Response> {
  const model = await this.repo.load()
  if (!model) return ctx.json(ApiResponse.error('NOT_FOUND', 'No schema loaded'), 404)
  const body = await ctx.getBody<{ format: string }>()
  try {
    const result = this.exportService.export(model, body.format)
    const content = [...result.files.values()].join('\n\n// ---\n\n')
    return ctx.json(ApiResponse.success({ format: body.format, content }))
  } catch (error: any) {
    return ctx.json(ApiResponse.error('INVALID', error.message), 400)
  }
}
```

- [ ] **Step 5: 執行所有測試確認通過**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Schema/Application/Services/ExportService.ts src/Modules/Schema/Presentation/Controllers/SchemaController.ts test/unit/Application/ExportService.test.ts
git commit -m "refactor: [schema] ExportService + SchemaController 適配 ExportResult"
```

---

## Task 7: IFileWriter 介面 + StdoutWriter

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Writers/IFileWriter.ts`
- Create: `src/Modules/Schema/Infrastructure/Writers/StdoutWriter.ts`
- Create: `test/unit/Infrastructure/Writers/StdoutWriter.test.ts`

- [ ] **Step 1: 寫 StdoutWriter 測試**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { StdoutWriter } from '@/Modules/Schema/Infrastructure/Writers/StdoutWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

describe('StdoutWriter', () => {
  it('writes single file content to stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writer = new StdoutWriter()
    const result: ExportResult = {
      files: new Map([['schema.prisma', 'model User {\n  id Int @id\n}']]),
    }

    await writer.write(result)

    expect(writeSpy).toHaveBeenCalledWith('model User {\n  id Int @id\n}\n')
    writeSpy.mockRestore()
  })

  it('writes multiple files separated by delimiter', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writer = new StdoutWriter()
    const result: ExportResult = {
      files: new Map([
        ['Order.php', '<?php class Order {}'],
        ['User.php', '<?php class User {}'],
      ]),
    }

    await writer.write(result)

    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('<?php class Order {}')
    expect(output).toContain('<?php class User {}')
    writeSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Writers/StdoutWriter.test.ts`
Expected: FAIL — 模組不存在

- [ ] **Step 3: 建立 IFileWriter 介面**

```typescript
// src/Modules/Schema/Infrastructure/Writers/IFileWriter.ts
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

export interface IFileWriter {
  write(result: ExportResult): Promise<void>
}
```

- [ ] **Step 4: 實作 StdoutWriter**

```typescript
// src/Modules/Schema/Infrastructure/Writers/StdoutWriter.ts
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

export class StdoutWriter implements IFileWriter {
  async write(result: ExportResult): Promise<void> {
    const entries = [...result.files.entries()]
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) {
        process.stdout.write('\n// ---\n\n')
      }
      process.stdout.write(`${entries[i][1]}\n`)
    }
  }
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Writers/StdoutWriter.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/IFileWriter.ts src/Modules/Schema/Infrastructure/Writers/StdoutWriter.ts test/unit/Infrastructure/Writers/StdoutWriter.test.ts
git commit -m "feat: [schema] IFileWriter 介面 + StdoutWriter"
```

---

## Task 8: DirectoryWriter

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Writers/DirectoryWriter.ts`
- Create: `test/unit/Infrastructure/Writers/DirectoryWriter.test.ts`

- [ ] **Step 1: 寫 DirectoryWriter 測試**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { DirectoryWriter } from '@/Modules/Schema/Infrastructure/Writers/DirectoryWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('DirectoryWriter', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('writes single file to output directory', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const writer = new DirectoryWriter(tmpDir)
    const result: ExportResult = {
      files: new Map([['schema.prisma', 'model User {}']]),
    }

    await writer.write(result)

    const content = readFileSync(path.join(tmpDir, 'schema.prisma'), 'utf-8')
    expect(content).toBe('model User {}')
  })

  it('writes multiple files to output directory', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const writer = new DirectoryWriter(tmpDir)
    const result: ExportResult = {
      files: new Map([
        ['Order.php', '<?php class Order {}'],
        ['User.php', '<?php class User {}'],
      ]),
    }

    await writer.write(result)

    expect(readFileSync(path.join(tmpDir, 'Order.php'), 'utf-8')).toBe('<?php class Order {}')
    expect(readFileSync(path.join(tmpDir, 'User.php'), 'utf-8')).toBe('<?php class User {}')
  })

  it('creates output directory if it does not exist', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const nestedDir = path.join(tmpDir, 'nested', 'output')
    const writer = new DirectoryWriter(nestedDir)
    const result: ExportResult = {
      files: new Map([['test.txt', 'hello']]),
    }

    await writer.write(result)

    expect(readFileSync(path.join(nestedDir, 'test.txt'), 'utf-8')).toBe('hello')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Writers/DirectoryWriter.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 DirectoryWriter**

```typescript
// src/Modules/Schema/Infrastructure/Writers/DirectoryWriter.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

export class DirectoryWriter implements IFileWriter {
  constructor(private readonly outputDir: string) {}

  async write(result: ExportResult): Promise<void> {
    mkdirSync(this.outputDir, { recursive: true })
    for (const [filename, content] of result.files) {
      const filePath = path.join(this.outputDir, filename)
      writeFileSync(filePath, content, 'utf-8')
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Writers/DirectoryWriter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/DirectoryWriter.ts test/unit/Infrastructure/Writers/DirectoryWriter.test.ts
git commit -m "feat: [schema] DirectoryWriter — 目錄寫檔"
```

---

## Task 9: LaravelArtisanWriter

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts`
- Create: `test/unit/Infrastructure/Writers/LaravelArtisanWriter.test.ts`

- [ ] **Step 1: 寫 LaravelArtisanWriter 測試**

測試重點：驗證 artisan 指令呼叫和檔案覆寫邏輯，用 mock 取代真實 shell 執行。

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LaravelArtisanWriter } from '@/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('LaravelArtisanWriter', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  function setupFakeLaravel(): string {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    // Fake composer.json
    writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    )
    // Fake artisan
    writeFileSync(path.join(tmpDir, 'artisan'), '#!/usr/bin/env php')
    // Fake app/Models directory
    mkdirSync(path.join(tmpDir, 'app', 'Models'), { recursive: true })
    return tmpDir
  }

  it('throws if composer.json is missing', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    const writer = new LaravelArtisanWriter(tmpDir)
    const result: ExportResult = { files: new Map([['User.php', '<?php']]) }

    await expect(writer.write(result)).rejects.toThrow('Not a Laravel project')
  })

  it('throws if laravel/framework is not in composer.json', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    writeFileSync(path.join(tmpDir, 'composer.json'), JSON.stringify({ require: {} }))
    const writer = new LaravelArtisanWriter(tmpDir)
    const result: ExportResult = { files: new Map([['User.php', '<?php']]) }

    await expect(writer.write(result)).rejects.toThrow('Not a Laravel project')
  })

  it('runs artisan make:model and overwrites with our content', async () => {
    const laravelPath = setupFakeLaravel()
    const mockExec = vi.fn().mockResolvedValue(undefined)
    const writer = new LaravelArtisanWriter(laravelPath, mockExec)
    const result: ExportResult = {
      files: new Map([['Order.php', '<?php\nclass Order extends Model {}']]),
    }

    await writer.write(result)

    // Verify artisan was called
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('php artisan make:model Order'),
      expect.objectContaining({ cwd: laravelPath }),
    )

    // Verify file was overwritten
    const content = readFileSync(path.join(laravelPath, 'app', 'Models', 'Order.php'), 'utf-8')
    expect(content).toBe('<?php\nclass Order extends Model {}')
  })

  it('processes multiple models', async () => {
    const laravelPath = setupFakeLaravel()
    const mockExec = vi.fn().mockResolvedValue(undefined)
    const writer = new LaravelArtisanWriter(laravelPath, mockExec)
    const result: ExportResult = {
      files: new Map([
        ['Order.php', '<?php class Order {}'],
        ['User.php', '<?php class User {}'],
      ]),
    }

    await writer.write(result)

    expect(mockExec).toHaveBeenCalledTimes(2)
    expect(readFileSync(path.join(laravelPath, 'app', 'Models', 'Order.php'), 'utf-8')).toBe('<?php class Order {}')
    expect(readFileSync(path.join(laravelPath, 'app', 'Models', 'User.php'), 'utf-8')).toBe('<?php class User {}')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/Infrastructure/Writers/LaravelArtisanWriter.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 LaravelArtisanWriter**

```typescript
// src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { IFileWriter } from './IFileWriter'

type ExecFn = (command: string, options: { cwd: string }) => Promise<void>

async function defaultExec(command: string, options: { cwd: string }): Promise<void> {
  const proc = Bun.spawn(['sh', '-c', command], {
    cwd: options.cwd,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`Command failed: ${command}\n${stderr}`)
  }
}

export class LaravelArtisanWriter implements IFileWriter {
  private readonly laravelPath: string
  private readonly exec: ExecFn

  constructor(laravelPath: string, exec?: ExecFn) {
    this.laravelPath = laravelPath
    this.exec = exec ?? defaultExec
  }

  async write(result: ExportResult): Promise<void> {
    this.validateLaravelProject()

    for (const [filename, content] of result.files) {
      const modelName = filename.replace('.php', '')
      await this.exec(`php artisan make:model ${modelName}`, { cwd: this.laravelPath })
      const modelPath = path.join(this.laravelPath, 'app', 'Models', filename)
      writeFileSync(modelPath, content, 'utf-8')
    }
  }

  private validateLaravelProject(): void {
    const composerPath = path.join(this.laravelPath, 'composer.json')
    if (!existsSync(composerPath)) {
      throw new Error('Not a Laravel project: composer.json not found')
    }
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'))
    const hasLaravel = composer.require?.['laravel/framework']
    if (!hasLaravel) {
      throw new Error('Not a Laravel project: laravel/framework not in composer.json')
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/Infrastructure/Writers/LaravelArtisanWriter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts test/unit/Infrastructure/Writers/LaravelArtisanWriter.test.ts
git commit -m "feat: [schema] LaravelArtisanWriter — artisan make:model + 覆寫"
```

---

## Task 10: CLI ExportCommand

**Files:**
- Create: `src/CLI/ExportCommand.ts`
- Create: `test/unit/CLI/ExportCommand.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 寫 ExportCommand 測試**

```typescript
import { describe, it, expect } from 'vitest'
import { parseExportArgs, resolveWriter } from '@/CLI/ExportCommand'

describe('parseExportArgs', () => {
  it('parses format from first positional arg', () => {
    const args = parseExportArgs(['export', 'prisma'])
    expect(args.format).toBe('prisma')
  })

  it('parses --output flag', () => {
    const args = parseExportArgs(['export', 'mermaid', '--output', './out'])
    expect(args.format).toBe('mermaid')
    expect(args.output).toBe('./out')
  })

  it('parses --laravel flag', () => {
    const args = parseExportArgs(['export', 'eloquent', '--laravel', '/path/to/laravel'])
    expect(args.format).toBe('eloquent')
    expect(args.laravel).toBe('/path/to/laravel')
  })

  it('throws if format is missing', () => {
    expect(() => parseExportArgs(['export'])).toThrow()
  })

  it('throws if --laravel used with non-eloquent format', () => {
    expect(() => parseExportArgs(['export', 'prisma', '--laravel', '/path'])).toThrow('--laravel can only be used with eloquent format')
  })

  it('throws if --laravel and --output both specified', () => {
    expect(() => parseExportArgs(['export', 'eloquent', '--laravel', '/path', '--output', './out'])).toThrow('--laravel and --output are mutually exclusive')
  })
})

describe('resolveWriter', () => {
  it('returns StdoutWriter when no flags', () => {
    const writer = resolveWriter({})
    expect(writer.constructor.name).toBe('StdoutWriter')
  })

  it('returns DirectoryWriter when --output', () => {
    const writer = resolveWriter({ output: './out' })
    expect(writer.constructor.name).toBe('DirectoryWriter')
  })

  it('returns LaravelArtisanWriter when --laravel', () => {
    const writer = resolveWriter({ laravel: '/path' })
    expect(writer.constructor.name).toBe('LaravelArtisanWriter')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun run test -- test/unit/CLI/ExportCommand.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 ExportCommand**

```typescript
// src/CLI/ExportCommand.ts
import { StdoutWriter } from '@/Modules/Schema/Infrastructure/Writers/StdoutWriter'
import { DirectoryWriter } from '@/Modules/Schema/Infrastructure/Writers/DirectoryWriter'
import { LaravelArtisanWriter } from '@/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { JsonFileRepository } from '@/Modules/Schema/Infrastructure/Persistence/JsonFileRepository'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import { PrismaExporter } from '@/Modules/Schema/Infrastructure/Exporters/PrismaExporter'
import { EloquentExporter } from '@/Modules/Schema/Infrastructure/Exporters/EloquentExporter'
import type { IFileWriter } from '@/Modules/Schema/Infrastructure/Writers/IFileWriter'
import path from 'node:path'

export interface ExportArgs {
  readonly format: string
  readonly output?: string
  readonly laravel?: string
}

const VALID_FORMATS = ['mermaid', 'dbml', 'prisma', 'eloquent']

export function parseExportArgs(argv: string[]): ExportArgs {
  const exportIdx = argv.indexOf('export')
  const rest = argv.slice(exportIdx + 1)

  const format = rest[0]
  if (!format || format.startsWith('-')) {
    throw new Error(`Missing format. Available: ${VALID_FORMATS.join(', ')}`)
  }
  if (!VALID_FORMATS.includes(format)) {
    throw new Error(`Unknown format: "${format}". Available: ${VALID_FORMATS.join(', ')}`)
  }

  const outputIdx = rest.indexOf('--output')
  const output = outputIdx !== -1 ? rest[outputIdx + 1] : undefined

  const laravelIdx = rest.indexOf('--laravel')
  const laravel = laravelIdx !== -1 ? rest[laravelIdx + 1] : undefined

  if (laravel && format !== 'eloquent') {
    throw new Error('--laravel can only be used with eloquent format')
  }
  if (laravel && output) {
    throw new Error('--laravel and --output are mutually exclusive')
  }

  return { format, output, laravel }
}

export function resolveWriter(options: { output?: string; laravel?: string }): IFileWriter {
  if (options.laravel) {
    return new LaravelArtisanWriter(options.laravel)
  }
  if (options.output) {
    return new DirectoryWriter(options.output)
  }
  return new StdoutWriter()
}

export async function runExportCommand(argv: string[]): Promise<void> {
  const args = parseExportArgs(argv)
  const archivoltPath = path.resolve(process.cwd(), 'archivolt.json')
  const repo = new JsonFileRepository(archivoltPath)
  const model = await repo.load()

  if (!model) {
    console.error('No schema loaded. Run import first.')
    process.exit(1)
  }

  const exportService = new ExportService([
    new MermaidExporter(),
    new DbmlExporter(),
    new PrismaExporter(),
    new EloquentExporter(),
  ])

  const result = exportService.export(model, args.format)
  const writer = resolveWriter(args)
  await writer.write(result)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun run test -- test/unit/CLI/ExportCommand.test.ts`
Expected: PASS

- [ ] **Step 5: 在 src/index.ts 加入 export 子指令分流**

在 `src/index.ts` 的 `start()` 函式開頭加入判斷：

```typescript
// 加在 start() 函式的最前面，import 之前的判斷
import { runExportCommand } from '@/CLI/ExportCommand'

// 在 start() 內，args 解析之後：
const subCommand = args[0]
if (subCommand === 'export') {
  await runExportCommand(['export', ...args.slice(1)])
  return
}
```

完整改動是在現有 `start()` 函式中，`const args = process.argv.slice(2)` 之後、`const inputIndex` 之前，加入：

```typescript
if (args[0] === 'export') {
  const { runExportCommand } = await import('@/CLI/ExportCommand')
  await runExportCommand(['export', ...args.slice(1)])
  process.exit(0)
}
```

- [ ] **Step 6: 執行所有測試確認通過**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 7: 手動測試 CLI**

```bash
# stdout 模式
bun src/index.ts export prisma

# 檔案輸出
bun src/index.ts export prisma --output ./tmp-export

# 確認檔案已產生
cat ./tmp-export/schema.prisma
rm -rf ./tmp-export
```

- [ ] **Step 8: Commit**

```bash
git add src/CLI/ExportCommand.ts test/unit/CLI/ExportCommand.test.ts src/index.ts
git commit -m "feat: [cli] export 子指令 — stdout / 目錄寫檔 / Laravel artisan"
```
