# Operation Manifest 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將側錄的 QueryChunk 資料進行語義分析，產出一份 Operation Manifest 中間文件（Markdown + JSON），並改善 Chrome extension 的側錄品質。

**Architecture:** Domain Service（`ChunkAnalyzerService`）負責核心分析邏輯，CLI（`archivolt analyze`）和 API（`GET /api/recordings/:id/manifest`）為雙入口。Chrome extension 同步改善 describeElement、navigate title、GET API 捕捉。

**Optimization:**
- **支援空 Chunk**：保留無 DB query 的 marker 脈絡。
- **精準語義**：按操作類型精確對應影響的 Table。

**Tech Stack:** TypeScript, Bun, Vitest, Chrome Extension Manifest V3

---

## 任務清單

- [x] **Task 1: Mock 測試資料**
  - [x] 建立 `session.json`
  - [x] 建立 `markers.jsonl`
  - [x] 建立 `queries.jsonl`
  - [x] 驗證 fixture 可被 `buildChunks` 處理

- [x] **Task 2: Domain 型別 — OperationManifest**
  - [x] 建立 `src/Modules/Recording/Domain/OperationManifest.ts`
  - [x] 驗證 TypeScript 編譯

- [x] **Task 3: SqlSemanticInferrer — SQL 語義推斷**
  - [x] 實作 `skeletonizeSql`（骨架化 SQL）
  - [x] 實作 `inferSemantic`（**優化版**：按操作精確匹配 Table）
  - [x] 實作 `buildLabel`（Marker 標籤）
  - [x] 通過單元測試

- [x] **Task 4: RelationInferrer — 關係推斷**
  - [x] 實作 `JOIN ON` (high confidence)
  - [x] 實作 `WHERE IN` (medium confidence)
  - [x] 實作 `_id` 共現 (low confidence)
  - [x] 通過單元測試

- [x] **Task 5: ChunkAnalyzerService — 核心分析**
  - [x] 整合 `buildChunks`
  - [x] 整合語義推斷與關係推斷
  - [x] 計算 Table Matrix
  - [x] 通過單元測試（包含空 Chunk 驗證）

- [x] **Task 6: ManifestMarkdownRenderer**
  - [x] 實作 Markdown 渲染邏輯
  - [x] 嵌入可解析的 JSON block
  - [x] 通過單元測試

- [x] **Task 7: CLI — `archivolt analyze` 命令**
  - [x] 實作參數解析
  - [x] 實作檔案寫入邏輯
  - [x] 在 `src/index.ts` 註冊命令
  - [x] 通過單元測試

- [x] **Task 8: API endpoint — `GET /api/recordings/:id/manifest`**
  - [x] 修改 `RecordingController`
  - [x] 註冊路由
  - [x] 更新 wiring 注入
  - [x] 驗證 TypeScript 編譯

- [x] **Task 9: Chrome Extension — 改善 describeElement**
  - [x] 加入元素文字（最多 40 字）
  - [x] 通過單元測試

- [x] **Task 10: Chrome Extension — 改善 navigate**
  - [x] 加入 `document.title` 作為 label
  - [x] 更新 `SPA_NAVIGATE` 處理

- [x] **Task 11: Chrome Extension — 捕捉 GET API**
  - [x] 實作 `isApiUrl` 判定
  - [x] 修改 fetch/XHR 攔截
  - [x] 通過單元測試

- [x] **Task 12: 整合驗證**
  - [x] 執行 fixture 端到端測試
  - [x] 執行全部測試確認無回歸

---

## 檔案結構

### 新建檔案

| 檔案 | 職責 |
|------|------|
| `src/Modules/Recording/Domain/OperationManifest.ts` | Manifest 型別定義 |
| `src/Modules/Recording/Application/Services/ChunkAnalyzerService.ts` | 核心分析：chunk → manifest |
| `src/Modules/Recording/Application/Strategies/SqlSemanticInferrer.ts` | SQL 模式匹配 → 語義標籤 |
| `src/Modules/Recording/Application/Strategies/RelationInferrer.ts` | SQL JOIN/WHERE → 關係推斷 |
| `src/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer.ts` | Manifest → Markdown 字串 |
| `src/CLI/AnalyzeCommand.ts` | CLI `archivolt analyze` 入口 |
| `test/unit/Recording/Application/SqlSemanticInferrer.test.ts` | 語義推斷測試 |
| `test/unit/Recording/Application/RelationInferrer.test.ts` | 關係推斷測試 |
| `test/unit/Recording/Application/ChunkAnalyzerService.test.ts` | 核心分析測試 |
| `test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts` | Markdown 渲染測試 |
| [其他測試檔案...] | |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `src/Modules/Recording/Domain/QueryChunk.ts` | **優化**：支援包含 Marker 的空 Chunk |
| `src/index.ts` | 註冊 `analyze` 命令 |
| `src/Modules/Recording/Presentation/Controllers/RecordingController.ts` | 新增 `getManifest()` |
| `extension/src/content.ts` | 側錄品質改善 |
| [其他修改檔案...] | |
