# 🏛️ Archivolt

**Archivolt** is a local visualization and annotation tool designed to help developers of legacy projects understand, document, and export database relationships.

In many legacy systems, databases have numerous "implicit relationships"—columns named like `user_id` that aren't backed by actual foreign keys in the database engine. Archivolt provides a visual interface to annotate these relationships and export them into modern ORM formats or ER diagrams.

---

## ✨ Features

- **Visual Database Explorer**: Built with [ReactFlow](https://reactflow.dev/) for an interactive and zoomable schema visualization.
- **Virtual Foreign Keys (vFK)**: Annotate "implicit" relationships between tables without modifying the production database schema. **VFK Review UX** provides a dedicated interface to review, confirm, or ignore auto-detected relationship suggestions with real-time status badges.
- **Intelligent Table Grouping**: Automatically groups tables using existing foreign keys, column naming patterns (e.g., `_id` suffixes), and table prefixes to make large schemas manageable.
- **Multi-Format Exporters**:
  - **Eloquent (PHP)**: Generates Laravel Models with `$fillable`, `$casts`, and relationship methods (`belongsTo`, `hasMany`, etc.).
  - **Prisma**: Generates `schema.prisma` with datasource and model relations.
  - **DBML**: Exports to [dbdiagram.io](https://dbdiagram.io) compatible format.
  - **Mermaid**: Generates ER diagram syntax for embedding in Markdown documentation.
- **Query Recording & Chunking**: Run a TCP proxy to capture live database queries. Automatically groups queries into logical "flows" using a navigate-boundary strategy with automatic noise table detection.
- **HTTP Proxy & API Correlation**: Built-in HTTP reverse proxy to capture API traffic. Automatically correlates HTTP requests with database queries within a 500ms time window to detect N+1 query patterns and build end-to-end operation models.
- **Performance Optimization Report** (`--format optimize-md`): Complete three-layer analysis pipeline. Layer 1 runs offline from recorded sessions: per-table read/write ratios with Redis/Read Replica recommendations, N+1 query detection aggregated to API path level, and query fragmentation detection. Layer 2a adds DDL schema diff to detect un-indexed WHERE columns (`--ddl`). Layer 2b connects to a live database to confirm full table scans via EXPLAIN (`--explain-db`). Every finding includes a runnable SQL snippet — `CREATE INDEX`, batch query rewrite, or cache comment — ready to copy-paste.
- **Log File Analysis** (`--from`): Analyze existing MySQL general logs, slow query logs, or canonical JSONL files without running a proxy session. Download a log from a production host, run `archivolt analyze --from slow-log /path/to/slow.log --format optimize-md`, and get the same optimization report you'd get from a live recording.
- **Chrome Extension Integration**: Capture browser events (clicks, fetch, navigation) to sync with database and HTTP recording for full-stack observability.
- **Archivolt Doctor**: Built-in diagnostic tool to verify environment health, dependencies, and data integrity with interactive auto-fix suggestions.
- **Powerful CLI**: Export your annotated schema directly to files or integrate with Laravel projects via Artisan.
- **Real-time Persistence**: Changes are saved instantly to a local `archivolt.json`, which serves as a single source of truth that is also LLM-readable.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- [dbcli](https://github.com/CarlLee1983/dbcli) (to extract your database schema into JSON)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/intellectronica/archivolt.git
   cd archivolt
   ```
2. Install dependencies:
   ```bash
   bun install
   ```

### Usage

1. **Import your database schema**:
   Archivolt consumes JSON output from [dbcli](https://github.com/CarlLee1983/dbcli).
   ```bash
   # Extract schema using dbcli
   dbcli schema --format json > my-database.json

   # Import into Archivolt
   bun run dev --input my-database.json
   ```
   *Note: Use `--reimport` to update table/column information while preserving your existing annotations.*

2. **Start the visual interface**:
   The command above starts the API server. You also need to run the web frontend:
   ```bash
   bun run dev:all
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

3. **Record database queries**:
   Archivolt can act as a TCP proxy between your application and the database, capturing all queries in real time without needing database credentials — authentication is handled directly between your app and the target DB.

   ```bash
   # Start recording — specify target DB directly
   bun run dev record start --target localhost:3306

   # Enable HTTP reverse proxy to correlate API calls with DB queries
   bun run dev record start --target localhost:3306 --http-proxy http://localhost:3000

   # Or read DB_HOST / DB_PORT from a .env file
   bun run dev record start --from-env /path/to/.env --port 13306
   ```

   Then point your application's DB connection to `127.0.0.1:13306` (or the port you specified) and your HTTP traffic to `127.0.0.1:4000` (default port for HTTP proxy). Press `Ctrl+C` to stop.

   ```bash
   # Analyze a session to view flows, N+1 patterns, and bootstrap info
   bun run dev analyze <session-id> --stdout

   # Generate a DB performance optimization report (Layer 1: offline pattern analysis)
   bun run dev analyze <session-id> --format optimize-md

   # + Layer 2a: DDL schema diff (detects un-indexed WHERE columns)
   bun run dev analyze <session-id> --format optimize-md --ddl ./schema.sql

   # + Layer 2b: live EXPLAIN analysis (connects to DB, confirms full table scans)
   bun run dev analyze <session-id> --format optimize-md \
     --ddl ./schema.sql \
     --explain-db mysql://user:pass@localhost:3306/mydb
   ```

   Or skip the proxy entirely and analyze an existing log file:
   ```bash
   # MySQL slow query log (has execution time — best signal quality)
   bun run dev analyze --from slow-log /path/to/slow.log --format optimize-md

   # MySQL general log
   bun run dev analyze --from general-log /path/to/mysql-general.log

   # Canonical JSONL (any tool that produces { timestamp, sql } lines)
   bun run dev analyze --from canonical /path/to/queries.jsonl
   ```

4. **Exporting via CLI**:
   ```bash
   # Export to Laravel Eloquent models
   bun run dev export eloquent --laravel path/to/laravel-project

   # Export to Mermaid ER diagram
   bun run dev export mermaid --output ./docs/schema
   ```

---

## 🗺️ Project Structure

- `src/Modules/Schema`: Core business logic for ER modeling and vFK management (DDD-first structure).
- `src/Modules/Recording`: TCP/HTTP proxy infrastructure, query chunking, and session analysis.
- `src/Modules/Doctor`: Environment diagnostics, dependency verification, and auto-fix logic.
- `web/`: React + ReactFlow frontend application with interactive vFK Review dashboard.
- `extension/`: Chrome extension for browser event capturing.
- `archivolt.json`: The local data store for your annotations.

### Detailed Documentation

- [Overview & Tech Stack](docs/overview.md)
- [Architecture](docs/architecture.md) — Backend DDD modules, frontend, Chrome extension, data flow
- [Commands](docs/commands.md) — Full CLI reference
- [Testing](docs/testing.md) — How to run and write tests
- [Conventions](docs/conventions.md) — Coding standards and patterns
- [Workflow (中文)](docs/WORKFLOW.zh-TW.md)

---

## 📜 License

[MIT](LICENSE)
