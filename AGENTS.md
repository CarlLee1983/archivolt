# AGENTS.md

This file provides guidance for AI coding agents and assistants when working with code in this repository.

## Project Overview

Archivolt 是一個本地端 ER 視覺化標註工具，幫助開發者理解、標註並匯出老舊資料庫中的隱含關聯（Virtual Foreign Keys）。後端為 Bun + TypeScript API server，前端為 React + ReactFlow 互動式介面。**新增功能：支援透過 TCP 代理進行查詢錄製與 SQL 分析，自動推斷關聯。**

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

# 查詢錄製 (TCP Proxy)
bun run dev record start --target localhost:3306 --port 13306
bun run dev record status
bun run dev record list
bun run dev record summary <session-id>

# 匯出資料 (CLI Export)
bun run dev export eloquent --laravel /path/to/laravel
bun run dev export mermaid --output ./docs/schema

# 品質檢查
bun run check            # typecheck + lint + test（全部）
...
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

src/Modules/Recording/
  Domain/          ProtocolParser, Session 實體
  Application/     RecordingService, QueryAnalyzer（SQL 語句解析與推薦）
  Infrastructure/  TcpProxy (TCP 代理實作), MysqlProtocolParser, RecordingRepository
  Presentation/    RecordingController, Recording.routes.ts
```

- **Domain → Application → Infrastructure**：嚴格分層，Domain 層不依賴框架
...
- **持久層**：單一 `archivolt.json` 檔案，由 `JsonFileRepository` 讀寫；錄製資料存放在 `data/recordings/`
- **匯出器**：實作 `IExporter` 介面（Eloquent, Prisma, DBML, Mermaid）
...
### 資料流

1. `dbcli schema --format json` 匯出 → `ImportSchemaService` 轉換為 ERModel
2. `JsonFileRepository` 存入 `archivolt.json`
3. 前端透過 REST API 取得 schema，ReactFlow 渲染
4. **查詢錄製**：`TcpProxy` 攔截 SQL → `ProtocolParser` 解析 → `RecordingService` 儲存並透過 `QueryAnalyzer` 推斷隱性關聯
5. 使用者標註 vFK → API 更新 → 持久化
6. CLI `export` 指令 → `ExportService` → `IExporter` → `IFileWriter`
...
## Conventions

- **Path alias**：`@/*` 對應 `./src/*`（backend 與 vitest 皆支援）
- **Interface 命名**：`I` 前綴（IExporter, IFileWriter, IContainer）
- **Formatter**：Biome，2 space indent，single quotes，100 char line width
- **Immutability**：Domain 實體使用 readonly 屬性
- **測試結構**：`test/unit/` 鏡射 `src/` 目錄結構
- **Vitest globals**：已啟用，不需 import `describe`/`it`/`expect`
