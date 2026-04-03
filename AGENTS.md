# AGENTS.md

This file provides guidance for AI coding agents and assistants when working with code in this repository.

## Project Overview

Archivolt 是一個本地端 ER 視覺化標註工具，幫助開發者理解、標註並匯出老舊資料庫中的隱含關聯（Virtual Foreign Keys）。後端為 Bun + TypeScript API server，前端為 React + ReactFlow 互動式介面。

## Commands

```bash
# 安裝依賴
bun install
cd web && bun install

# 開發（後端 + 前端同時啟動）
bun run dev:all          # API :3100 + Web :5173

# 單獨啟動
bun run dev              # 後端 API server（hot reload）
bun run dev:web          # 前端 React dev server

# 品質檢查
bun run check            # typecheck + lint + test（全部）
bun run typecheck        # tsc --noEmit
bun run lint             # biome lint src test
bun run lint:fix         # biome lint --fix
bun run format           # biome format --write

# 測試
bun run test             # vitest run（單次執行）
bun run test:watch       # vitest（watch 模式）
bun run test:coverage    # vitest --coverage
bunx vitest run test/unit/Domain/ERModel.test.ts  # 執行單一測試檔

# 建置與啟動
bun run build            # 輸出到 dist/
bun run start            # 執行 dist/index.js
```

## Architecture

採用 **DDD（Domain-Driven Design）** 分層架構，框架無關設計。

### 後端 (`src/`)

```
src/Modules/Schema/
  Domain/          純商業邏輯（ERModel 型別、RelationInferrer 推斷演算法、GroupingStrategy）
  Application/     Use cases（ImportSchemaService, ExportService, VirtualFKService）
  Infrastructure/  技術實作（JsonFileRepository, Exporters, Writers）
  Presentation/    HTTP API（SchemaController, Schema.routes.ts）
```

- **Domain → Application → Infrastructure**：嚴格分層，Domain 層不依賴框架
- **Gravito 框架**：透過 `src/Shared/Infrastructure/Framework/` 的 adapter 隔離
- **DI 容器**：`SchemaServiceProvider` 註冊所有服務為 singleton
- **持久層**：單一 `archivolt.json` 檔案，由 `JsonFileRepository` 讀寫
- **匯出器**：實作 `IExporter` 介面（Eloquent, Prisma, DBML, Mermaid）
- **寫入器**：實作 `IFileWriter` 介面（Stdout, Directory, LaravelArtisan）

### 前端 (`web/`)

- **React + Vite + Tailwind CSS**
- **ReactFlow/XYFlow**：互動式 ER 圖表
- **Zustand**：狀態管理（`stores/schemaStore.ts`）
- **Dagre**：自動佈局演算法
- API proxy：Vite dev server 將 `/api` 轉發到 `localhost:3100`

### 資料流

1. `dbcli` 匯出 JSON → `ImportSchemaService` 轉換為 ERModel
2. `JsonFileRepository` 存入 `archivolt.json`
3. 前端透過 REST API 取得 schema，ReactFlow 渲染
4. 使用者標註 vFK → API 更新 → 持久化
5. CLI `export` 指令 → `ExportService` → `IExporter` → `IFileWriter`

## Conventions

- **Path alias**：`@/*` 對應 `./src/*`（backend 與 vitest 皆支援）
- **Interface 命名**：`I` 前綴（IExporter, IFileWriter, IContainer）
- **Formatter**：Biome，2 space indent，single quotes，100 char line width
- **Immutability**：Domain 實體使用 readonly 屬性
- **測試結構**：`test/unit/` 鏡射 `src/` 目錄結構
- **Vitest globals**：已啟用，不需 import `describe`/`it`/`expect`
