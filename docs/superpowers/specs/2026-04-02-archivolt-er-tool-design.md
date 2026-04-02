# Archivolt — ER Model 視覺化標註工具設計規格

## 概述

Archivolt 是一套協助老舊專案開發者理解、標註、輸出資料庫關聯的本地工具。核心場景是：老舊資料庫有大量「隱性關聯」（欄位名像 `user_id` 卻沒有建立 FK），開發者需要一個視覺化介面來標註這些關係，並將結果輸出為 ORM model 或 ER 圖格式。

## 輸入來源

使用者自行開發的 **dbcli** 工具，輸出 JSON 格式的 DB schema：

```jsonc
{
  "connection": { "system": "mariadb", "database": "testing", ... },
  "schema": {
    "<table_name>": {
      "name": "string",
      "columns": [
        { "name": "string", "type": "string", "nullable": 0|1, "default": "string?", "primaryKey": 0|1 }
      ],
      "rowCount": "number",
      "engine": "string",
      "primaryKey": ["string"],
      "foreignKeys": [
        { "name": "string", "columns": ["string"], "refTable": "string", "refColumns": ["string"] }
      ]
    }
  }
}
```

實測資料：99 張表，24 張有實際 FK，75 張無 FK。

### 匯入方式

啟動 Archivolt 時透過 CLI 參數指定 dbcli 的 config.json 路徑：

```bash
bun run dev --input /path/to/.dbcli/config.json
```

首次啟動時讀取並轉換為 `archivolt.json`；後續啟動若 `archivolt.json` 已存在則直接載入，不覆蓋已有標註。若需重新匯入，可加 `--reimport` 旗標（僅更新 table/column 資訊，保留 virtualForeignKeys 和 groups）。

## ER Model 中間格式

Archivolt 的核心資料結構，以單一 JSON 檔 `archivolt.json` 作為真相來源：

```jsonc
{
  "source": {
    "system": "mariadb",
    "database": "testing",
    "importedAt": "2026-04-02T15:00:00Z",
    "dbcliVersion": "1.0.0"
  },
  "tables": {
    "<table_name>": {
      "name": "string",
      "columns": [
        { "name": "string", "type": "string", "nullable": 0|1, "default": "string?", "primaryKey": 0|1 }
      ],
      "rowCount": "number",
      "engine": "string",
      "primaryKey": ["string"],
      "foreignKeys": [
        { "name": "string", "columns": ["string"], "refTable": "string", "refColumns": ["string"] }
      ],
      "virtualForeignKeys": [
        {
          "id": "string",
          "columns": ["string"],
          "refTable": "string",
          "refColumns": ["string"],
          "confidence": "manual" | "auto-suggested",
          "createdAt": "string (ISO 8601)"
        }
      ]
    }
  },
  "groups": {
    "<group_id>": {
      "name": "string",
      "tables": ["string"],
      "auto": true | false
    }
  }
}
```

### 設計決策

- `virtualForeignKeys` 與 `foreignKeys` 分離，原始 DB FK 不可被修改
- `groups` 獨立於 tables，支援自動分組和手動調整
- `confidence` 欄位區分自動建議（`auto-suggested`）與人工標註（`manual`）
- 格式為單一 JSON 檔，方便 LLM 直接讀取理解，也方便其他工具消費

## 智慧分組演算法

匯入 dbcli JSON 時，自動將表分組：

### 分組策略（依優先順序）

1. **已有 FK 關聯鏈**：有直接 FK 連結的表歸同一組（圖的連通分量）
2. **欄位名匹配**：含相同 `_id` 後綴欄位但無 FK 的表，建議歸入同組
3. **表名前綴**：共享前綴的表合併（如 `chat_room_*` → Chat Room 群組）
4. **孤立表**：無任何關聯線索的表歸入「未分類」群組

### 處理流程

```
importSchema(dbcliJson)
  → extractExplicitRelations()    // 從 foreignKeys 建立圖
  → inferImplicitRelations()      // 從欄位名推測關聯（標記 auto-suggested）
  → groupByConnectedComponents()  // 圖的連通分量 = 一個 group
  → refineByPrefix()              // 同前綴的孤立表合併
  → assignGroupNames()            // 自動命名（取共同前綴或最大表名）
```

- 自動建議的關聯標記為 `confidence: "auto-suggested"`，使用者可在介面確認或刪除
- 分組結果可在介面上手動拖拉調整

## 技術架構

### 技術棧

- **後端**：Bun + Gravito PlanetCore（自行開發的 DDD-first modular platform shell）
- **前端**：React + Tailwind CSS + shadcn/ui + ReactFlow
- **資料存儲**：本地 JSON 檔案（無資料庫）

### Gravito 配置

只啟用 **Photon Orbit**（HTTP 路由），不需要：
- Atlas Orbit（無 DB 連線需求）
- Monitor Orbit（非生產服務）
- Sentinel/Fortify（無認證需求）

### 系統架構

```
┌──────────────────────────────────────────────────────┐
│                     Archivolt                         │
│                                                       │
│  ┌──────────┐    ┌───────────┐    ┌───────────────┐  │
│  │  dbcli   │───>│ Importer  │───>│ archivolt.json│  │
│  │  JSON    │    │ + 分組     │    │ (ER Model)    │  │
│  └──────────┘    │ + 推測FK   │    └──────┬────────┘  │
│                  └───────────┘           │            │
│                                          │ 讀/寫       │
│                                          ▼            │
│  ┌──────────────────────────────────────────────────┐ │
│  │        Gravito PlanetCore (Bun runtime)          │ │
│  │                                                  │ │
│  │  SchemaServiceProvider                           │ │
│  │    GET  /api/schema        → 讀取 ER Model       │ │
│  │    PUT  /api/virtual-fk    → 新增/修改 vFK       │ │
│  │    DEL  /api/virtual-fk/:id → 刪除 vFK          │ │
│  │    PUT  /api/groups        → 修改分組            │ │
│  │    POST /api/export        → 生成 ORM / ER 圖    │ │
│  │    GET  /api/suggestions   → 取得自動建議        │ │
│  │                                                  │ │
│  │  ※ Photon Orbit → HTTP 路由                      │ │
│  │  ※ 每次修改即時 Bun.write() 寫入 archivolt.json  │ │
│  │  ※ 同一 process serve API + 前端靜態檔           │ │
│  └──────────────────────────────────────────────────┘ │
│                         │                             │
│                         ▼                             │
│  ┌──────────────────────────────────────────────────┐ │
│  │         React + ReactFlow 前端                    │ │
│  │  左側：群組導航 ←→ 中間：畫布 ←→ 右側：面板       │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │         Export Plugins (pluggable)                │ │
│  │  ┌─────────┐ ┌────────┐ ┌───────┐ ┌──────────┐  │ │
│  │  │Eloquent │ │ Prisma │ │ DBML  │ │ Mermaid  │  │ │
│  │  └─────────┘ └────────┘ └───────┘ └──────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 專案結構

依循 gravito-ddd-starter 模式：

```
archivolt/
├── config/
│   ├── app.ts
│   ├── index.ts
│   └── orbits.ts              ← 只啟用 Photon
├── src/
│   ├── index.ts               ← entry-server
│   ├── app.ts                 ← createApp()
│   ├── bootstrap.ts           ← PlanetCore 初始化
│   ├── routes.ts              ← 全域路由註冊
│   ├── Modules/
│   │   └── Schema/
│   │       ├── Application/
│   │       │   └── Services/
│   │       │       ├── ImportSchemaService.ts    ← 匯入 dbcli JSON
│   │       │       ├── VirtualFKService.ts       ← virtual FK CRUD
│   │       │       ├── GroupService.ts           ← 分組管理
│   │       │       ├── SuggestionService.ts      ← 自動關聯建議
│   │       │       └── ExportService.ts          ← 觸發 exporter
│   │       ├── Domain/
│   │       │   ├── ERModel.ts                    ← 核心型別定義
│   │       │   ├── GroupingStrategy.ts           ← 分組演算法
│   │       │   └── RelationInferrer.ts           ← 關聯推測邏輯
│   │       ├── Infrastructure/
│   │       │   ├── Providers/
│   │       │   │   └── SchemaServiceProvider.ts  ← Gravito ServiceProvider
│   │       │   ├── Persistence/
│   │       │   │   └── JsonFileRepository.ts     ← archivolt.json 讀寫
│   │       │   └── Exporters/
│   │       │       ├── IExporter.ts              ← exporter 介面
│   │       │       ├── EloquentExporter.ts
│   │       │       ├── PrismaExporter.ts
│   │       │       ├── DbmlExporter.ts
│   │       │       └── MermaidExporter.ts
│   │       └── Presentation/
│   │           ├── Controllers/
│   │           │   └── SchemaController.ts
│   │           └── Routes/
│   │               └── Schema.routes.ts
│   └── Shared/
│       ├── Infrastructure/
│       │   └── Framework/
│       │       ├── GravitoModuleRouter.ts
│       │       └── GravitoServiceProviderAdapter.ts
│       └── Presentation/
│           ├── IModuleRouter.ts
│           └── ApiResponse.ts
├── web/                        ← React 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Canvas/         ← ReactFlow 畫布
│   │   │   ├── GroupPanel/     ← 左側群組列表
│   │   │   ├── DetailPanel/    ← 右側詳情面板
│   │   │   └── Toolbar/        ← 搜尋、排列、篩選
│   │   ├── hooks/
│   │   │   ├── useSchema.ts    ← 資料 fetching
│   │   │   └── useVirtualFK.ts ← vFK 操作
│   │   ├── stores/
│   │   │   └── schemaStore.ts  ← 前端狀態管理
│   │   └── types/
│   │       └── er-model.ts     ← 共享型別
│   ├── package.json
│   └── vite.config.ts
├── archivolt.json              ← ER Model 資料檔（runtime 產生）
├── package.json
└── gravito.config.ts
```

## 介面設計

### 三欄式佈局

1. **左側 — 群組導航**（~240px）
   - 顯示所有群組，含表數量與 FK 數量 badge
   - 點擊群組展開/收合該群組在畫布上的表
   - 「未分類」群組以低透明度區分

2. **中間 — ReactFlow 畫布**
   - 表節點：顯示表名、主要欄位、row count
   - 實際 FK 以實線連接（綠色）
   - 自動建議 virtual FK 以虛線連接（橙色）
   - 手動標註 virtual FK 以實線連接（紫色）
   - 支援：拖拉連線建立 vFK、縮放、自動排列、分組展開/收合
   - 工具列：搜尋表、自動排列、顯示/隱藏欄位

3. **右側 — 詳情面板**（~260px）
   - 選中表時顯示：完整欄位列表、已有 FK、建議關聯（可確認/忽略）
   - 手動新增 virtual FK 表單（來源欄位 + 目標表.欄位）
   - Export 操作入口

### 操作模式

**混合模式**：畫布拖拉連線 + 面板表單操作並行
- 同一群組內的表：拖拉連線直覺建立
- 跨群組的表：用面板表單精確指定

## Export Plugin 架構

```typescript
interface IExporter {
  readonly name: string    // "eloquent" | "prisma" | "dbml" | "mermaid"
  readonly label: string   // 顯示名稱
  export(model: ERModel): string
}
```

### 第一版 Exporter

| Exporter | 輸出格式 | 用途 |
|----------|----------|------|
| Eloquent | Laravel Model PHP 檔 | 含 `$fillable`、`$casts`、關聯方法 |
| Prisma | `schema.prisma` | 含 model 定義、relation 指令 |
| DBML | `.dbml` | 可匯入 dbdiagram.io |
| Mermaid | Mermaid ER 語法 | 可嵌入 Markdown 文件 |

### 擴充方式

新增 Exporter 只需：
1. 建立實作 `IExporter` 的類別
2. 在 `SchemaServiceProvider` 中註冊

## API 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/schema` | 讀取完整 ER Model |
| PUT | `/api/virtual-fk` | 新增或修改 virtual FK |
| DELETE | `/api/virtual-fk/:id` | 刪除 virtual FK |
| PUT | `/api/groups` | 修改分組（重新命名、移動表） |
| GET | `/api/suggestions` | 取得自動建議的關聯 |
| POST | `/api/export` | 生成指定格式的輸出（body: `{ format: "eloquent" | ... }`） |

## 非功能需求

- **即時存檔**：每次 virtual FK 或分組變更，即時 `Bun.write()` 寫入 `archivolt.json`
- **無需安裝資料庫**：純本地 JSON 讀寫
- **單指令啟動**：`bun run dev` 同時啟動 API server + 前端 dev server
- **LLM 友善**：`archivolt.json` 格式可直接丟給 LLM 理解專案資料結構
