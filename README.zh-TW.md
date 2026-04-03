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
- **強大的 CLI 指令**：直接將標註好的內容導出為檔案，或透過 Artisan 與 Laravel 專案深度整合。
- **即時持久化**：所有變更會立即存入本地的 `archivolt.json`，這不僅是單一事實來源，也方便 LLM 讀取理解。

---

## 🚀 快速入門

### 前置需求

- [Bun](https://bun.sh) (v1.0.0 或以上版本)
- [dbcli](https://github.com/intellectronica/dbcli) (用於將資料庫 Schema 提取為 JSON 格式)

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
   Archivolt 使用 [dbcli](https://github.com/intellectronica/dbcli) 輸出的 JSON 檔案。
   ```bash
   bun run dev --input path/to/dbcli/config.json
   ```
   *註：使用 `--reimport` 旗標可以在更新資料表/欄位資訊的同時，保留你已完成的標註。*

2. **啟動視覺化介面**：
   上述指令會啟動 API 伺服器，你還需要啟動網頁前端：
   ```bash
   bun run dev:all
   ```
   接著在瀏覽器中開啟 [http://localhost:5173](http://localhost:5173)。

3. **使用 CLI 導出**：
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
- `archivolt.json`：儲存標註資料的本地資料庫。

---

## 📜 授權條款

[MIT](LICENSE)
