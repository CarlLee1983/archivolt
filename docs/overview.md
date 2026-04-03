# Project Overview

Archivolt 是一個本地端 ER 視覺化標註工具，幫助開發者理解、標註並匯出老舊資料庫中的隱含關聯（Virtual Foreign Keys）。

- **後端**：Bun + TypeScript API server（Gravito/PlanetCore 框架）
- **前端**：React + ReactFlow 互動式介面
- **TCP 代理**：查詢錄製與 SQL 分析，自動推斷關聯
- **Chrome 擴充**：捕捉瀏覽器事件作為操作標記

## Tech Stack

| 層級 | 技術 |
|------|------|
| 後端 Runtime | Bun |
| 後端框架 | Gravito/PlanetCore |
| 前端 | React 19 + Vite + TailwindCSS 4 |
| 圖表視覺化 | @xyflow/react 12（ReactFlow） |
| 前端狀態管理 | Zustand 5 |
| 圖表排版 | Dagre |
| 測試 | Vitest |
| Linter/Formatter | Biome |
| 語言 | TypeScript 5.3+ |

## 版本

目前 v0.2.0
