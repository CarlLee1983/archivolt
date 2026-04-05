# 📦 Archivolt 版本資訊

本文件用於追蹤 Archivolt 各個組件的發布版本、系統相容性要求。

---

## 🚀 當前發布：v0.7.0 (2026-04-05)

| 組件 | 版本 | 說明 |
|-----------|---------|-------------|
| **Archivolt CLI / API** | `0.7.0` | 核心邏輯、錄製代理、語義分析、效能診斷報告、Log 匯入、AI Skills、LLM Layer 3。 |
| **Web Dashboard** | `0.6.0` | ReactFlow 畫布、VFK Review UX、時間線回放。 |
| **Chrome Extension** | `1.0.0` | 瀏覽器行為標註 (navigate, submit, click, request)。 |

---

## 🛠️ 系統相容性

| 依賴項 | 最低版本要求 | 備註 |
|------------|-----------------|-------|
| [Bun](https://bun.sh) | `v1.0.0` | 核心運行環境。 |
| [dbcli](https://github.com/CarlLee1983/dbcli) | `v1.2.0` | 用於 Schema 提取 (`--format json`)。 |
| Chrome / Edge | `v110+` | 擴充功能版本 (Manifest V3)。 |

---

## 📅 版本歷史摘要

- **v0.7.0** (目前版本):
  - ✨ 新增 **Layer 3 LLM 最佳化** (`--llm`、`--top-n`、`--llm-separate`) — Claude Haiku 針對最高影響問題提供建議。
- **v0.6.0**:
  - ✨ 新增 **AI Skill Family** — `archivolt-schema`、`archivolt-record`、`archivolt-analyze`、`archivolt-advisor`。
  - ✨ 新增 **`install-skill`** CLI 指令，支援 Claude Code / Cursor / Codex 分發。
- **v0.5.0**:
  - ✨ 新增 **Log 檔案分析** (`--from general-log|slow-log|canonical`)。
- **v0.4.0**:
  - ✨ 新增 **VFK Review UX** (Pending/Confirmed/Ignored 狀態)。
  - ✨ 新增 ER 畫布中的 **資料表名稱篩選 (Table Name Filter)**。
  - ✅ 正式實作 **效能診斷報告管線 (Optimization Report Pipeline)** (Layer 1, 2a, 2b)。
- **v0.3.x**:
  - ✨ 新增 **HTTP Proxy & API 關聯分析** (500ms 時間視窗)。
  - ✨ 新增 **N+1 查詢偵測**。
- **v0.2.x**:
  - ✨ 新增 **TCP 錄製代理與查詢分組 (Query Chunking)**。
  - ✨ 新增 **Eloquent/Prisma/DBML/Mermaid 導出器**。
- **v0.1.x**:
  - ✨ 初始 Alpha 版本，具備基礎 ER 畫布與 vFK 標註功能。
