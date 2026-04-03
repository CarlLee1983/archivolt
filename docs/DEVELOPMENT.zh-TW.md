# 🛠️ Archivolt 本地開發指南

本文件供開發者與貢獻者參考，說明如何在本地環境啟動、偵錯與測試 Archivolt。

---

## 🚀 快速啟動

Archivolt 由 **後端 (Bun)** 與 **前端 (Vite/React)** 組成。

1. **安裝依賴**：
   ```bash
   bun install
   cd web && bun install
   ```
2. **啟動開發環境 (全系統)**：
   ```bash
   # 在根目錄執行，將同時啟動 API Server 與 Web Dev Server
   bun run dev:all
   ```
   - API: `http://localhost:3100`
   - UI: `http://localhost:5173`

3. **單獨啟動組件**：
   - 僅啟動 API (Hot Reload)：`bun run dev`
   - 僅啟動 UI：`cd web && bun run dev`

---

## 🛠️ 開發常用指令

### CLI 子命令測試
在開發期間，您可以直接使用 `src/index.ts` 測試 CLI 行為：
```bash
# 錄製測試
bun run src/index.ts record start --target localhost:3306

# 分析測試
bun run src/index.ts analyze <session-id>

# 導出測試
bun run src/index.ts export eloquent
```

### 環境檢查 (Doctor)
使用 `doctor` 指令確認開發環境是否符合規範：
```bash
bun run src/index.ts doctor
```

### 測試與校驗
- **執行所有測試**：`bun test`
- **代碼風格檢查**：`bunx biome check .`
- **自動修正風格**：`bunx biome check --apply .`

---

## 🌐 Chrome Extension 開發

擴充功能位於 `extension/` 目錄。

1. **編置擴充功能**：
   ```bash
   cd extension
   bun install
   bun run build.ts
   ```
2. **載入至瀏覽器**：
   - 開啟 Chrome `chrome://extensions/`
   - 開啟「開發者模式」
   - 點擊「載入解壓縮擴充功能」，選擇 `extension/dist` 目錄。

---

## 🏗️ 專案架構與規範

- **技術棧**：Bun, TypeScript, React, TailwindCSS, Vitest.
- **模組化**：核心邏輯位於 `src/Modules/`，遵循 Domain-Driven Design (DDD) 風格。
- ** conntions**：請參考 `docs/conventions.md` 了解命名與代碼風格規範。
