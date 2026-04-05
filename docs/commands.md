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
bun run dev analyze <session-id>                   # Output operation manifest to Markdown file
bun run dev analyze <session-id> --stdout          # Print JSON manifest to console
bun run dev analyze <session-id> --format json     # Write JSON manifest to file
bun run dev analyze <session-id> --format md       # Write Markdown manifest to file (default)

# Analyze from log file (no proxy recording needed)
bun run dev analyze --from general-log /path/to/mysql-general.log
bun run dev analyze --from slow-log /path/to/slow.log
bun run dev analyze --from canonical /path/to/queries.jsonl
  # --from creates a virtual session from the log file and runs the full analysis pipeline.
  # Supports all existing flags (--format optimize-md, --ddl, --explain-db, --output, --stdout)

# DB Performance Optimization Report (--format optimize-md)
bun run dev analyze <session-id> --format optimize-md
  # Layer 1 only (offline pattern analysis):
  #   - Per-table read/write ratio + Redis/Read Replica recommendations
  #   - N+1 query detection aggregated to API path level
  #   - Query fragmentation detection (≥3 identical queries per request)

bun run dev analyze <session-id> --format optimize-md \
  --ddl ./schema.sql
  # + Layer 2a: DDL schema diff
  #   Parses MySQL CREATE TABLE to detect un-indexed WHERE columns

bun run dev analyze <session-id> --format optimize-md \
  --ddl ./schema.sql \
  --explain-db mysql://user:pass@localhost:3306/mydb \
  --min-rows 1000 \
  --explain-concurrency 5
  # + Layer 2b: Live EXPLAIN analysis
  #   Connects to DB, runs EXPLAIN on unique SELECT patterns,
  #   detects full table scans (type=ALL, rows > --min-rows)

# Output flags for optimize-md:
#   --output <path>         Write report to specific path (default: data/analysis/<id>/optimization-report.md)
#   --stdout                Print report to console
#   --llm                   [deferred to v2] Enable LLM deep analysis via Claude API

# Export (CLI)
bun run dev export eloquent --laravel /path/to/laravel
bun run dev export mermaid --output ./docs/schema
bun run dev export prisma --output ./prisma
bun run dev export dbml --output ./docs

# AI Skills (Claude Code / Cursor / Codex)
bun run dev install-skill           # Install skills to ~/.claude/plugins/archivolt/skills/
bun run dev install-skill --cursor  # Write skills as .mdc to .cursor/rules/
bun run dev install-skill --codex   # Write combined system prompt to archivolt-skills-system-prompt.md

# Quality
bun run check            # typecheck + lint + test (all)
bun run typecheck        # TypeScript typecheck
bun run lint             # Biome lint
bun run format           # Biome format
bun run test             # Vitest unit tests
```
