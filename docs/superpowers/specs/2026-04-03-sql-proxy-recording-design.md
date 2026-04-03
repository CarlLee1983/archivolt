# SQL Proxy 側錄模組設計

## 概述

為 Archivolt 新增 `Recording` 模組，提供 SQL Proxy 服務，透明攔截目標專案與資料庫之間的所有 SQL 通訊，捕捉完整資料流（語句 + 結果集），作為後續 LLM 推斷商業邏輯的事實基礎。

## 目標與 Scope

### 本次 Scope（MVP）
- 自建 TCP Proxy，使用 Bun 原生 TCP socket
- MySQL text protocol 支援（`COM_QUERY` + result set + OK/ERR）
- Session 管理（start/stop/list/summary）
- JSONL 格式持久化側錄資料
- CLI 介面操作
- REST API 預留供前端未來使用

### 明確排除（未來版本）
- PostgreSQL wire protocol
- MySQL prepared statements（`COM_STMT_*`）
- SSL/TLS 加密連線
- Compression protocol
- 前端 UI 管理介面
- Framework skill adapters（行為入口盤點）
- 自動功能測試生成
- LLM 商業邏輯萃取

### 未來流水線定位

本模組是完整逆向工程流水線的第一段：

```
1. Skill 盤點入口（框架相關）     ← 未來
2. Agent 生成功能測試（框架相關）  ← 未來
3. SQL Proxy 側錄（通用）         ← 本次
4. LLM 分析資料流 → 商業邏輯     ← 未來
```

階段 3 和 4 完全框架無關，階段 1 和 2 需要 framework adapter skill。

## 模組架構

採用與 `Schema` 模組一致的 DDD 分層結構：

```
src/Modules/Recording/
  Domain/
    Session.ts              — 側錄 session 聚合根
    CapturedQuery.ts        — 單筆 SQL 捕捉實體
    ProtocolParser.ts       — Wire protocol 解析介面
  Application/
    Services/
      RecordingService.ts   — 啟動/停止側錄、查詢結果
      QueryAnalyzer.ts      — SQL 分類與 table 名提取
  Infrastructure/
    Proxy/
      TcpProxy.ts           — Bun TCP socket proxy 核心
      MysqlProtocolParser.ts — MySQL wire protocol 解析器
    Persistence/
      RecordingRepository.ts — JSONL 檔案持久化
    Providers/
      RecordingServiceProvider.ts — DI 容器註冊
  Presentation/
    Controllers/
      RecordingController.ts — REST API
    Routes/
      Recording.routes.ts
```

### 關鍵設計決策

- **ProtocolParser 介面化**：Domain 層定義介面，Infrastructure 層實作。未來加 PostgreSQL 只需新增 `PgProtocolParser`，不改動其他層。
- **側錄資料獨立儲存**：不混入 `archivolt.json`，每個 session 獨立目錄。
- **Session 為聚合根**：包含多筆 CapturedQuery，統一管理生命週期。

## 核心型別定義

### RecordingSession

```typescript
interface RecordingSession {
  readonly id: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly status: 'recording' | 'stopped'
  readonly proxy: {
    readonly listenPort: number
    readonly targetHost: string
    readonly targetPort: number
  }
  readonly stats: {
    readonly totalQueries: number
    readonly byOperation: Record<string, number>
    readonly tablesAccessed: readonly string[]
    readonly connectionCount: number
  }
}
```

### CapturedQuery

```typescript
interface CapturedQuery {
  readonly id: string
  readonly sessionId: string
  readonly connectionId: number
  readonly timestamp: number
  readonly duration: number
  readonly sql: string
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly affectedRows?: number
  readonly resultSummary?: {
    readonly columnCount: number
    readonly rowCount: number
    readonly columns: readonly string[]
    readonly sampleRows: readonly Record<string, unknown>[]
  }
  readonly error?: string
}
```

### AnalyzedQuery（QueryAnalyzer 輸出）

```typescript
interface AnalyzedQuery {
  readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER'
  readonly tables: readonly string[]
  readonly isTransaction: boolean
  readonly isSchemaChange: boolean
}
```

### ProtocolParser 介面

```typescript
interface ProtocolParser {
  parseClientPacket(data: Buffer): ParsedClientPacket
  parseServerPacket(data: Buffer): ParsedServerPacket
}
```

## SQL Proxy 機制

### 架構

```
目標專案 App                    Archivolt Recording Module
┌──────────┐                   ┌─────────────────────────┐
│           │  連線 :13306      │  TcpProxy (:13306)      │
│  舊專案   │──────────────────▶│                         │
│  (任何    │                   │  ┌─ 接收 client 封包    │
│  框架)    │◀──────────────────│  ├─ 解析 SQL 語句       │     真實 DB
│           │  回傳結果          │  ├─ 轉發到真實 DB ──────────▶ :3306
│           │                   │  ├─ 接收 DB 回應  ◀──────────
└──────────┘                   │  ├─ 解析結果集          │
                               │  ├─ 記錄 CapturedQuery  │
                               │  └─ 回傳給 client       │
                               └─────────────────────────┘
```

### MySQL Wire Protocol MVP 範圍

| 狀態 | 封包類型 | 說明 |
|------|---------|------|
| ✅ 支援 | `COM_QUERY` | Text protocol 查詢 |
| ✅ 支援 | Result Set | column count + rows 解析，摘要記錄 |
| ✅ 支援 | OK / ERR | 寫入結果（affected rows）/ 錯誤訊息 |
| ✅ 支援 | Handshake | 轉發認證流程，不介入 |
| ⏭️ v2 | `COM_STMT_*` | Prepared statements |
| ⏭️ v2 | SSL/TLS | 加密連線 |

### Proxy 行為原則

1. **透明轉發** — 不修改任何封包內容，只讀取
2. **非阻塞記錄** — 先寫入記憶體 buffer，定時 flush，不影響轉發效能
3. **多連線支援** — 每個 client connection 獨立追蹤
4. **容錯** — 解析失敗時仍轉發原始封包，不中斷服務

## 資料流

```
TCP 封包進入
    │
    ▼
MysqlProtocolParser.parse()     → 提取 SQL 字串 + 結果集
    │
    ▼
QueryAnalyzer.analyze()         → 標記 operation / tables / flags
    │
    ▼
CapturedQuery 物件建立           → 組合 protocol 資料 + 分析結果
    │
    ▼
MemoryBuffer.add()              → 暫存記憶體
    │
    ├─ 每 100 筆或 5 秒 ─▶ flush → queries.jsonl（append）
    │
    └─ session stop ─▶ final flush + 計算 stats → session.json
```

### QueryAnalyzer

- 用正則匹配 operation 和 table 名，不用完整 SQL parser
- 這是「預分類標籤」，降低後續 LLM 分析的工作量
- 複雜的巢狀 subquery 不需完美解析，LLM 後續會看原始 SQL

## Session 管理

### 生命週期

```
archivolt record start → 建立 Session → 啟動 TcpProxy → 開始監聽
                         使用者操作目標專案 → 持續捕捉 → 定時 flush
archivolt record stop  → 關閉 Proxy → flush 剩餘資料 → 標記結束 → 產出 summary
```

### 持久化結構

```
data/recordings/
  {session-id}/
    session.json      — Session 元資料 + stats
    queries.jsonl     — CapturedQuery 逐行寫入（append-friendly）
```

- **JSONL 格式**：適合 streaming write，不需整檔載入
- **Flush 策略**：每 100 筆或每 5 秒，先到先觸發
- **Session 結束時**：自動計算 stats 寫入 `session.json`

## CLI 介面

```bash
# 啟動側錄（使用者自行確保可連線目標 DB）
archivolt record start --target localhost:3306 --port 13306

# 從舊專案 .env 自動讀取 DB 連線資訊（nice to have）
archivolt record start --from-env /path/to/project/.env

# 查看進行中的 session
archivolt record status

# 停止側錄
archivolt record stop

# 列出所有 sessions
archivolt record list

# 查看特定 session 的摘要
archivolt record summary <session-id>
```

## REST API

供前端未來使用，由既有 HTTP server (:3100) 統一提供：

```
POST   /api/recording/start       — 啟動側錄
POST   /api/recording/stop        — 停止側錄
GET    /api/recording/status       — 當前 session 狀態
GET    /api/recordings             — 列出所有 sessions
GET    /api/recordings/:id         — 取得 session 詳情 + queries
```

Proxy（TCP）與管理 API（HTTP）在同一個 Archivolt process 中，不會有兩個 HTTP server。

## 錯誤處理

| 情境 | 處理方式 |
|------|---------|
| Protocol 解析失敗 | 原始封包照常轉發，該筆 query 標記為 `unparseable` |
| 真實 DB 斷線 | 回傳 MySQL ERR 封包給 client（與直連行為一致），記錄事件 |
| 記憶體 buffer 滿 | 強制 flush，磁碟失敗則丟棄最舊 batch，log 警告 |
| 超大 result set | 只記錄前 10 筆 sample rows |
| 多 statement query | 視為單筆 CapturedQuery，LLM 分析時再拆 |
| Binary data（BLOB） | 記為 `[BLOB: N bytes]`，不儲存原始內容 |

**核心原則：Proxy 的任何錯誤都不能影響目標專案的正常運作。**

## 測試策略

### Unit 測試（無外部依賴）
- `QueryAnalyzer.test.ts` — SQL 分類正確性、table 名提取、邊際情境

### Integration 測試（需要可連線的 MySQL 實例）
- `MysqlProtocolParser.test.ts` — 對真實 MySQL 驗證封包解析
- `TcpProxy.test.ts` — 透過 proxy 操作 DB，結果與直連一致
- `RecordingService.test.ts` — 完整 session 流程：start → query → stop → 驗證 JSONL

測試前提：開發者自行確保有可連線的 MySQL 實例（本地、Docker、遠端備份皆可）。

## 與 Schema 模組的關聯

側錄結果中的 `tables` 欄位可對應 `archivolt.json` 中的 table 定義。未來流水線第 4 階段（LLM 分析）可交叉比對：
- **靜態 schema**（表結構、欄位、關聯）← Schema 模組
- **動態行為**（哪些操作讀寫了哪些表）← Recording 模組

兩者結合即為完整的商業邏輯還原。
