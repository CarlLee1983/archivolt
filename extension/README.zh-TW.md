# 📍 Archivolt Marker (Chrome Extension)

**Archivolt Marker** 是一款輔助用的 Chrome 瀏覽器擴充功能，旨在將您的瀏覽器操作行為（點擊、表單提交等）與 Archivolt 的資料庫錄製會話 (Recording Session) 進行同步。

這能幫助開發者在分析大量的 SQL 查詢時，清楚知道哪一段查詢是由哪一個具體的 UI 動作所觸發。

---

## ✨ 功能特色

- **自動事件標記**：監聽瀏覽器中的點擊與表單操作，並自動發送標記 (Marker) 至 Archivolt API。
- **操作同步**：讓 SQL 錄製結果具備上下文，例如「點擊『建立訂單』按鈕後觸發的 5 條 SQL」。
- **即時連線**：預設與運行在 `localhost:3100` 的 Archivolt 核心同步。

---

## 🛠️ 開發與建置

### 前置需求
- [Bun](https://bun.sh)

### 安裝依賴
```bash
bun install
```

### 建置擴充功能
使用 Bun 進行快速打包：
```bash
bun run build.ts
```
打包後的檔案會生成於 `dist/` 目錄中。

---

## 🚀 如何安裝

1. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`。
2. 開啟右上角的 **「開發者模式 (Developer mode)」**。
3. 點擊 **「載入解壓縮擴充功能 (Load unpacked)」**。
4. 選擇本專案中的 `extension` 目錄（確保 `dist/` 已生成且包含 `manifest.json`）。

---

## 📜 運作機制

本擴充功能會將事件發送至 `http://localhost:3100/api/recording/marker`。請確保 Archivolt 的核心服務已啟動並在該埠口監聽，以確保標記能成功記錄。
