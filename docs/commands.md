# Commands

```bash
# Install dependencies
bun install
cd web && bun install

# Development (backend + frontend together)
bun run dev:all          # API :3100 + Web :5173

# Run separately
bun run dev              # Backend API server (hot reload)
bun run dev:web          # Frontend React dev server

# Build
bun run build            # Backend bundle (dist/index.js)
bun run build:ext        # Chrome extension (extension/dist/)

# Health checks (Doctor)
bun run dev doctor       # Run all environment and data checks
bun run dev doctor --fix # Interactive repair

# Query recording (TCP proxy)
bun run dev record start --target localhost:3306 --port 13306
bun run dev record start --http-proxy http://localhost:3000 --http-port 4000
bun run dev record status
bun run dev record list
bun run dev record summary <session-id>

# Post-recording Analysis
bun run dev analyze <session-id>          # Output to Markdown file
bun run dev analyze <session-id> --stdout # View analysis in console
bun run dev analyze <session-id> --json   # Output raw analysis JSON
```
# Export (CLI)
bun run dev export eloquent --laravel /path/to/laravel
bun run dev export mermaid --output ./docs/schema
bun run dev export prisma --output ./prisma
bun run dev export dbml --output ./docs

# Quality
bun run check            # typecheck + lint + test (all)
bun run typecheck        # TypeScript typecheck
bun run lint             # Biome lint
bun run format           # Biome format
bun run test             # Vitest unit tests
```
