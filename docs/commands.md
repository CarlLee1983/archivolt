# Commands

```bash
# 安裝依賴
bun install
cd web && bun install

# 開發（後端 + 前端同時啟動）
bun run dev:all          # API :3100 + Web :5173

# 單獨啟動
bun run dev              # 後端 API server（hot reload）
bun run dev:web          # 前端 React dev server

# 建置
bun run build            # 後端 bundle（dist/index.js）
bun run build:ext        # Chrome 擴充（extension/dist/）

# 健康檢查 (Doctor)
bun run dev doctor       # 執行所有環境與資料檢查
bun run dev doctor --fix # 互動式修復問題

# 查詢錄製 (TCP Proxy)
bun run dev record start --target localhost:3306 --port 13306
bun run dev record status
bun run dev record list
bun run dev record summary <session-id>

# 匯出資料 (CLI Export)
bun run dev export eloquent --laravel /path/to/laravel
bun run dev export mermaid --output ./docs/schema
bun run dev export prisma --output ./prisma
bun run dev export dbml --output ./docs

# 品質檢查
bun run check            # typecheck + lint + test（全部）
bun run typecheck        # TypeScript 型別檢查
bun run lint             # Biome lint
bun run format           # Biome format
bun run test             # Vitest 單元測試
```
