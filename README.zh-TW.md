# 🏛️ Archivolt

**Archivolt** 是一款專為老舊專案開發者設計的本地視覺化標註工具，旨在協助理解、記錄並輸出資料庫關聯。

在許多老舊系統中，資料庫存在大量「隱性關聯」——即欄位名稱類似 `user_id` 但在資料庫引擎中並未建立實際的外鍵 (Foreign Key)。Archivolt 提供了一個視覺化介面來標註這些關聯，並能將其輸出為現代的 ORM 格式或 ER 圖。

---

## ✨ 功能特色

- **視覺化資料庫瀏覽器**：基於 [ReactFlow](https://reactflow.dev/) 構建，提供互動式且可縮放的 Schema 視覺化介面。
- **虛擬外鍵 (Virtual Foreign Keys, vFK)**：標註表與表之間的「隱性」關聯，無需更動實際的資料庫結構。
- **智慧資料表分組**：自動根據現有的外鍵、欄位命名規則（如 `_id` 後綴）以及資料表前綴進行分組，讓龐大的資料庫結構變得易於管理。
- **多格式導出支援**：
  - **Eloquent (PHP)**：生成包含 `$fillable`、`$casts` 以及關聯方法（`belongsTo`、`hasMany` 等）的 Laravel Model。
  - **Prisma**：生成包含資料源與模型關聯的 `schema.prisma`。
  - **DBML**：導出為相容於 [dbdiagram.io](https://dbdiagram.io) 的格式。
  - **Mermaid**：生成可嵌入 Markdown 文件的 ER 圖語法。
- **查詢錄製**：運行 TCP 代理以捕捉應用程式的即時資料庫查詢 —— 無需資料庫憑據，只需將應用程式指向代理埠。
- **強大的 CLI 指令**：直接將標註好的內容導出為檔案，或透過 Artisan 與 Laravel 專案深度整合。
- **即時持久化**：所有變更會立即存入本地的 `archivolt.json`，這不僅是單一事實來源，也方便 LLM 讀取理解。

---

## 🚀 快速入門

### 前置需求

- [Bun](https://bun.sh) (v1.0.0 或以上版本)
- [dbcli](https://github.com/CarlLee1983/dbcli) (用於將資料庫 Schema 提取為 JSON 格式)

### 安裝步驟

1. 複製專案庫：
   ```bash
   git clone https://github.com/intellectronica/archivolt.git
   cd archivolt
   ```
2. 安裝依賴套件：
   ```bash
   bun install
   ```

### 使用說明

1. **匯入資料庫 Schema**：
   Archivolt 使用 [dbcli](https://github.com/CarlLee1983/dbcli) 輸出的 JSON 檔案。
   ```bash
   # 使用 dbcli 提取 Schema
   dbcli schema --format json > my-database.json

   # 匯入 Archivolt
   bun run dev --input my-database.json
   ```
   *註：使用 `--reimport` 旗標可以在更新資料表/欄位資訊的同時，保留你已完成的標註。*

2. **啟動視覺化介面**：
   上述指令會啟動 API 伺服器，你還需要啟動網頁前端：
   ```bash
   bun run dev:all
   ```
   接著在瀏覽器中開啟 [http://localhost:5173](http://localhost:5173)。

3. **錄製資料庫查詢**：
   Archivolt 可以作為應用程式與資料庫之間的 TCP 代理，即時捕捉所有查詢而無需資料庫憑據 —— 驗證過程由您的應用程式與目標資料庫直接處理。

   ```bash
   # 開始錄製 —— 直接指定目標資料庫
   bun run dev record start --target localhost:3306

   # 或從 .env 檔案讀取 DB_HOST / DB_PORT
   bun run dev record start --from-env /path/to/.env --port 13306
   ```

   接著將應用程式的資料庫連線指向 `127.0.0.1:13306`（或您指定的埠）。按下 `Ctrl+C` 停止。

   ```bash
   # 管理錄製會話
   bun run dev record status              # 檢查錄製是否正在進行
   bun run dev record list                # 列出所有會話
   bun run dev record summary <session-id> # 查看會話的查詢統計
   ```

4. **使用 CLI 導出**：
   ```bash
   # 導出為 Laravel Eloquent 模型
   bun run dev export eloquent --laravel path/to/laravel-project

   # 導出為 Mermaid ER 圖
   bun run dev export mermaid --output ./docs/schema
   ```

---

## 🗺️ 專案結構

- `src/Modules/Schema`：核心業務邏輯（採用 DDD 架構）。
  - `Domain`：ER 模型實體與分組策略。
  - `Application`：匯入、管理 vFK 以及導出相關服務。
  - `Infrastructure`：JSON 持久化、各類導出器 (Eloquent, Prisma 等) 以及檔案寫入器。
- `web/`：基於 React + ReactFlow 的前端應用程式。
- `extension/`：Chrome 擴充功能，用於捕捉瀏覽器事件。
- `archivolt.json`：儲存標註資料的本地資料庫。

### 詳細文件

- [專案概覽與技術棧](docs/overview.md)
- [架構設計](docs/architecture.md) — 後端 DDD 模組、前端、Chrome 擴充、資料流
- [指令參考](docs/commands.md) — 完整的 CLI 指令說明
- [測試說明](docs/testing.md) — 如何執行與撰寫測試
- [開發規範](docs/conventions.md) — 代碼風格與設計模式
- [工作流程](docs/WORKFLOW.zh-TW.md)

---

## 📜 授權條款

[MIT](LICENSE)
