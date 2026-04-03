# Archivolt 工作流改善設計規格

日期：2026-04-03

## 背景

審閱 `docs/WORKFLOW.zh-TW.md` 及實際程式碼後，發現 6 個可改善的流程斷點。本規格定義每個改善項目的設計，按優先順序分為 6 個獨立階段，逐一實作、逐一驗收。

---

## 階段 A：Manifest → vFK 匯入流程

### 問題

`archivolt analyze` 產出的 `InferredRelation[]` 停在 Manifest 檔案中，無法自動回流為 vFK。

### 設計

**CLI 指令：**

```
archivolt apply <session-id> [--min-confidence high|medium|low] [--dry-run] [--auto]
```

- `--min-confidence`：預設 `high`，只匯入 ≥ 該等級的關係
- `--dry-run`：列出會新增的 vFK，不寫入
- `--auto`：跳過逐一確認，全部套用
- 預設：互動模式，逐一顯示推斷關係讓使用者 accept/skip/quit

**互動輸出範例：**

```
Found 5 inferred relations (≥ high confidence):

[1/5] orders.user_id → users.id  (high, JOIN ON)
      Accept? [Y/n/q] y  ✅ Added

[2/5] order_items.product_id → products.id  (high, JOIN ON)
      Accept? [Y/n/q] n  ⏭ Skipped

Summary: 3 added, 2 skipped, 0 duplicates
```

**去重邏輯：** 套用前比對現有 vFK，相同 `(sourceTable, sourceColumn, targetTable, targetColumn)` 的跳過。

**影響範圍：**

| 檔案 | 職責 |
|------|------|
| `src/CLI/ApplyCommand.ts` | 新增：參數解析 + 互動流程 |
| `src/Modules/Schema/Application/Services/VirtualFKService.ts` | 擴充：`applyInferredRelations()` |
| `src/index.ts` | 註冊 `apply` 子指令 |

---

## 階段 B：vFK 建立時的 Column 選擇器

### 問題

`ERCanvas.tsx` 的 `onConnect` 只找第一個 `*_id` 欄位且固定對應 `id`，無法處理非標準命名或複合鍵。

### 設計

**流程變更：**

```
目前：拉線 → 自動猜 column → 立即寫入
改為：拉線 → 彈出選擇器 → 使用者確認 → 寫入
```

**VFKDialog 元件：**
- Source table 名稱 + 可選 columns（下拉選單）
- Target table 名稱 + 可選 columns（下拉選單）
- 智慧預設：`target_name + _id` > 任何 `*_id` > 留空
- Target column 預設 `id`，可手動切換
- Confirm / Cancel 按鈕

**影響範圍：**

| 檔案 | 變更 |
|------|------|
| `web/src/components/Canvas/VFKDialog.tsx` | 新增 |
| `web/src/components/Canvas/ERCanvas.tsx` | `onConnect` 改為開啟 dialog |

---

## 階段 C：回放時畫布自動聚焦

### 問題

回放時畫布只做 highlight/dim，使用者得手動找活躍的表群。

### 設計

**自動 fitView：** `activeChunkId` 變化時，計算涉及的 table nodes bounding box，呼叫 `fitBounds()` 平滑移動。

**Edge 讀寫標註：** 回放時高亮 edge 加方向標籤：
- `read` → `R`（綠色）
- `write` → `W`（橙色）
- `mixed` → `R/W`（紫色）

**可關閉的自動聚焦：** PlaybackControls 加 toggle 按鈕（📍），預設開啟。關閉後只做 highlight 不移動畫布。

**影響範圍：**

| 檔案 | 變更 |
|------|------|
| `web/src/components/Canvas/ERCanvas.tsx` | `useEffect` 監聽 activeChunkId → fitBounds |
| `web/src/components/Canvas/edges.ts` | 接收 chunk pattern，回放時加 R/W label |
| `web/src/stores/recordingStore.ts` | 新增 `autoFocus` state + toggle |
| `web/src/components/Timeline/PlaybackControls.tsx` | 新增 toggle 按鈕 |

---

## 階段 D：分組鎖定機制

### 問題

使用者手動調整分組後，`--reimport` 的 `computeGroups` 會覆蓋手動調整。

### 設計

**規則：**
- `auto: true`：自動產生，reimport 時可被覆蓋
- `auto: false`：手動建立或編輯過，reimport 時保留

**reimport 合併邏輯：**

1. 保留所有 `auto: false` 的分組及其 tables
2. 收集已鎖定的 table names → `lockedTables`
3. 對剩餘 tables 執行 `computeGroups()`
4. 合併兩者

**前端行為：** 使用者在 UI 編輯分組時（重新命名、拖入/拖出 table），自動設為 `auto: false`。

**CLI 提示：**

```
🔒 Preserved 3 locked groups: 訂單, 會員, 庫存
🔄 Re-computed 5 auto groups
```

**影響範圍：**

| 檔案 | 變更 |
|------|------|
| `src/index.ts` | reimport 合併邏輯 |
| `src/Modules/Schema/Presentation/Controllers/SchemaController.ts` | 分組編輯 API 設定 `auto: false` |

---

## 階段 E：Session 比較

### 問題

無法比較兩個 Session 的行為差異。

### 設計

**CLI 指令：**

```
archivolt diff <session-a> <session-b> [--format md|json] [--output path] [--stdout]
```

**比較維度：**
- Table 存取差異：新增/消失的 table、讀寫次數變化
- 查詢模式變化：chunk 數量、read/write/mixed 比例
- 關係推斷差異：新增/消失的 InferredRelation
- 總量統計：query 總數、table 數量增減

**實作元件：**

| 檔案 | 職責 |
|------|------|
| `src/CLI/DiffCommand.ts` | 參數解析、輸出控制 |
| `src/Modules/Recording/Application/Services/SessionDiffService.ts` | 核心比較邏輯 |
| `src/Modules/Recording/Infrastructure/Renderers/DiffMarkdownRenderer.ts` | Markdown 格式化 |
| `src/index.ts` | 註冊 `diff` 子指令 |

複用 `ChunkAnalyzerService.analyze()` 取得兩個 manifest 再比較。

---

## 階段 F：PostgreSQL 支援

### 問題

只有 `MysqlProtocolParser`，PostgreSQL 使用者無法使用錄製功能。

### 設計

**PostgresProtocolParser：** 實作 `IProtocolParser` 介面：
- `extractQuery()`：解析 `Query ('Q')` 和 `Parse ('P')` 訊息
- `parseResponse()`：解析 `CommandComplete`、`ErrorResponse`、`RowDescription`
- `isHandshakePhase()`：偵測 `StartupMessage` / `AuthenticationOk`

**自動偵測策略（依序）：**
1. Port 慣例：5432 → PostgreSQL，3306 → MySQL
2. 首封包嗅探：MySQL Protocol Version 10 vs PostgreSQL `R` 訊息

**CLI 擴充：**
- 新增 `--protocol mysql|postgres` 手動指定
- `--from-env` 額外讀取 `DB_CONNECTION` / `DB_DRIVER`

**影響範圍：**

| 檔案 | 職責 |
|------|------|
| `src/Modules/Recording/Infrastructure/Proxy/PostgresProtocolParser.ts` | 新增 |
| `src/Modules/Recording/Infrastructure/Proxy/ProtocolDetector.ts` | 新增 |
| `src/CLI/RecordCommand.ts` | `--protocol` 參數 + 偵測整合 |
| `src/Modules/Recording/Application/Services/RecordingService.ts` | parser 由外部決定 |
