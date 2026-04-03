# Export File Output — Design Spec

## Summary

將現有的 API-only export 擴展為 CLI 指令，支援檔案輸出。Exporter 負責產內容，FileWriter 負責輸出策略。Eloquent 格式額外支援整合 Laravel 專案的 artisan 流程。

## CLI 介面

```
archivolt export <format> [options]

Formats: mermaid | dbml | prisma | eloquent

Options:
  --output <path>     寫到指定目錄
  --laravel <path>    Eloquent 專用，指定 Laravel 專案路徑
```

### 行為規則

- 無 `--output` 且無 `--laravel`：印到 stdout
- 有 `--output`：每個檔案寫到指定目錄
- 有 `--laravel`：僅限 eloquent 格式，用 artisan 建骨架後覆寫
- `--laravel` 和 `--output` 互斥

## 架構

### Layer 1: Exporter（產內容）

```typescript
interface ExportResult {
  readonly files: ReadonlyMap<string, string>  // filename -> content
}

interface IExporter {
  readonly name: string
  readonly label: string
  export(model: ERModel): ExportResult
}
```

各 Exporter 的回傳：

| Exporter | files |
|----------|-------|
| MermaidExporter | `{ "schema.mmd": content }` |
| DbmlExporter | `{ "schema.dbml": content }` |
| PrismaExporter | `{ "schema.prisma": content }` — 含 datasource + generator 區塊 |
| EloquentExporter | `{ "ActivityLog.php": content, "User.php": content, ... }` — 每個 Model 一個 entry |

### Layer 2: FileWriter（輸出策略）

```typescript
interface IFileWriter {
  write(result: ExportResult): Promise<void>
}
```

| Writer | 觸發條件 | 行為 |
|--------|----------|------|
| StdoutWriter | 無 --output、無 --laravel | 所有 files 內容合併印到 stdout |
| DirectoryWriter | --output ./path | 每個 file 寫到指定目錄下 |
| LaravelArtisanWriter | --laravel /path | artisan make:model + 覆寫 |

### LaravelArtisanWriter 流程

1. 讀 `<laravelPath>/composer.json` 確認是 Laravel 專案
2. 偵測 Laravel 版本（`laravel/framework` 版號）
3. 對每個 Model 執行 `cd <laravelPath> && php artisan make:model <ModelName>`
4. 用 ExportResult 的對應內容覆寫 `<laravelPath>/app/Models/<ModelName>.php`

### PrismaExporter datasource 推斷

從 `ERModel.source.system` 對映 Prisma provider：

| source.system | Prisma provider |
|---------------|-----------------|
| mariadb | mysql |
| mysql | mysql |
| postgresql | postgresql |
| sqlite | sqlite |

輸出包含：

```prisma
datasource db {
  provider = "<provider>"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

## API 向下相容

`POST /api/export` 回傳格式不變。Controller 將 `ExportResult.files` 所有 value 以分隔符合併為單一字串回傳。

## 檔案變更清單

### 修改

| 檔案 | 改動 |
|------|------|
| `src/Modules/Schema/Infrastructure/Exporters/IExporter.ts` | 新增 ExportResult，export() 回傳型別改為 ExportResult |
| `src/Modules/Schema/Infrastructure/Exporters/MermaidExporter.ts` | 回傳 ExportResult |
| `src/Modules/Schema/Infrastructure/Exporters/DbmlExporter.ts` | 回傳 ExportResult |
| `src/Modules/Schema/Infrastructure/Exporters/PrismaExporter.ts` | 回傳 ExportResult，加 datasource/generator 區塊 |
| `src/Modules/Schema/Infrastructure/Exporters/EloquentExporter.ts` | 回傳 ExportResult，每個 Model 一個 entry |
| `src/Modules/Schema/Application/Services/ExportService.ts` | 適配 ExportResult |
| `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` | files 合併為字串，API 不變 |

### 新增

| 檔案 | 用途 |
|------|------|
| `src/Modules/Schema/Infrastructure/Writers/IFileWriter.ts` | FileWriter 介面 |
| `src/Modules/Schema/Infrastructure/Writers/StdoutWriter.ts` | stdout 輸出 |
| `src/Modules/Schema/Infrastructure/Writers/DirectoryWriter.ts` | 目錄寫檔 |
| `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts` | artisan 流程 |
| `src/CLI/ExportCommand.ts` | CLI 指令進入點 |

### 測試更新

所有 4 個 exporter 測試 + ExportService 測試需配合 ExportResult 調整。新增 Writer 和 CLI 指令的測試。
