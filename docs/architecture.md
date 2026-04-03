# Architecture

採用 **DDD（Domain-Driven Design）** 分層架構，框架無關設計。每個模組遵循 Domain → Application → Infrastructure → Presentation 嚴格分層。

## 後端 (`src/`)

```
src/
  index.ts               進入點：CLI 指令分派（export, record, doctor）與 server 啟動
  app.ts                 Express-like app 建立與 port 設定
  bootstrap.ts           PlanetCore 初始化、ServiceProvider 註冊、全域錯誤處理
  routes.ts              模組路由註冊（Schema + Recording）

  Modules/
    Schema/
      Domain/            ERModel 型別、RelationInferrer 推斷演算法、GroupingStrategy
      Application/       ImportSchemaService, ExportService, VirtualFKService
      Infrastructure/
        Persistence/     JsonFileRepository（archivolt.json 讀寫）
        Exporters/       IExporter 介面 + 實作（Eloquent, Prisma, DBML, Mermaid）
        Writers/         IFileWriter 介面 + 實作（Directory, Stdout, LaravelArtisan）
        Providers/       SchemaServiceProvider
      Presentation/      SchemaController, Schema.routes.ts

    Recording/
      Domain/            Session 實體, OperationMarker, ProtocolParser 介面, QueryChunk
      Application/       RecordingService, QueryAnalyzer（SQL 解析與關聯推薦）
      Infrastructure/
        Proxy/           TcpProxy（TCP 代理）, MysqlProtocolParser
        Persistence/     RecordingRepository
        Providers/       RecordingServiceProvider
      Presentation/      RecordingController, Recording.routes.ts

    Doctor/
      Domain/            IHealthCheck 介面, IPrompter 介面
      Application/       DoctorService（協調檢查與修復）
      Infrastructure/
        Checks/
          Environment/   BunVersion, DbcliAvailable, PortAvailable,
                         Dependencies, WebDependencies, RecordingsDir
          Data/          ArchivoltJson, SchemaStructure, VirtualFkIntegrity,
                         TableGroupIntegrity, RecordingIntegrity
        DoctorReporter   格式化輸出
        InteractivePrompter  互動式修復提示
      Presentation/      DoctorCommand（CLI 進入點）

  CLI/
    ExportCommand.ts     export 子指令處理
    RecordCommand.ts     record 子指令處理

  Shared/
    Presentation/        IHttpContext, IModuleRouter, ApiResponse, routerHelpers
    Infrastructure/      IServiceProvider, GravitoModuleRouter, GravitoServiceProviderAdapter

  wiring/                模組路由註冊（Schema + Recording routes）
```

## 前端 (`web/src/`)

```
web/src/
  main.tsx               進入點
  App.tsx                主要應用元件（Navbar、側邊面板、Canvas、Timeline）

  components/
    Canvas/
      ERCanvas.tsx       ReactFlow 包裝器（LOD 層級細節切換）
      TableNode.tsx      表格節點視覺元件
      edges.ts           邊（FK + VFK）產生邏輯
      layoutEngine.ts    Dagre 自動排版演算法
    Timeline/
      TimelinePanel.tsx  錄製 session 時間軸 UI
      PlaybackControls.tsx  播放控制（速度、播放/暫停）
      ChunkCard.tsx      查詢 chunk 卡片元件

  stores/
    schemaStore.ts       Schema 狀態管理（Zustand）：過濾、群組可見性
    recordingStore.ts    錄製 session、chunks、播放狀態
    playbackUtils.ts     播放時間計算工具

  api/
    schema.ts            Schema REST API 客戶端
    recording.ts         Recording REST API 客戶端

  types/
    er-model.ts          ERModel TypeScript 介面定義
```

## Chrome 擴充 (`extension/`)

```
extension/
  manifest.json          V3 manifest（all tabs + localhost 權限）
  src/
    api.ts               與 Archivolt server 溝通（status, sendMarker）
    background.ts        背景 script（生命週期管理）
    content.ts           注入頁面的 content script
    popup.ts             Popup UI
    types.ts             TypeScript 介面
  build.ts               Bun 建置 script
```

捕捉瀏覽器事件（點擊、表單送出等）並作為「操作標記（Marker）」送至 Recording API（預設 http://localhost:3100）。

## 資料流

1. `dbcli schema --format json` 匯出 → `ImportSchemaService` 轉換為 ERModel
2. `JsonFileRepository` 存入 `archivolt.json`
3. 前端透過 REST API 取得 schema，ReactFlow 渲染
4. **查詢錄製**：`TcpProxy` 攔截 SQL → `MysqlProtocolParser` 解析 → `RecordingService` 儲存 → `QueryAnalyzer` 推斷隱性關聯
5. **瀏覽器標記**：Chrome Extension 捕捉事件 → Recording API → 與 SQL 查詢關聯
6. 使用者標註 vFK → SchemaController API → `JsonFileRepository` 持久化
7. CLI `export` 指令 → `ExportService` → `IExporter` → `IFileWriter`
8. `doctor` 指令 → `DoctorService` 逐一執行 `IHealthCheck` → 報告或互動修復

## 持久層

- **`archivolt.json`**：主要 schema 資料檔（表格、欄位、FK、VFK、群組、來源 metadata）
- **`data/recordings/`**：錄製 session 資料存放目錄
