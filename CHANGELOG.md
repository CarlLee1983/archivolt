# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-04-05

### Added
- **AI Skill Family** (`archivolt install-skill`): Four Claude Code skills for guided legacy database reverse-engineering and architecture advisory.
  - `archivolt-schema`: Walks you through `archivolt doctor`, DDL schema collection, and VFK review — the one-time setup for a new legacy project.
  - `archivolt-record`: Guides recording via Chrome extension (full UI semantic markers, ★★★★★) or TCP proxy fallback (★★★). Builds the extension automatically; only the "Load unpacked" step requires a human click.
  - `archivolt-analyze`: Runs the Layer 1+2 optimization pipeline and ER export on a completed session.
  - `archivolt-advisor`: Reads collected artifacts, asks 4 questions (team size, codebase state, domain count, traffic scale), cross-references Archivolt signals (N+1 density, read/write ratio, VFK clusters, query chunk labels), and outputs a Markdown architecture recommendation report — Slim MVC through Microservices, with reasoning grounded in your actual data.
- **`install-skill` CLI command**: Copy skills to `~/.claude/plugins/archivolt/skills/` (Claude Code), `.cursor/rules/` (Cursor), or a combined system prompt file (Codex/ChatGPT) with `--cursor` / `--codex` flags.

## [0.5.0] - 2026-04-05

### Added
- **Log File Analysis** (`--from` flag): Analyze MySQL general logs, slow query logs, or canonical JSONL files without running a proxy session. `archivolt analyze --from general-log|slow-log|canonical <path>` creates a virtual recording session from the log file and passes it through the full analysis pipeline — every existing flag (`--format optimize-md`, `--ddl`, `--explain-db`, `--stdout`, `--output`) works unchanged.
  - `MysqlGeneralLogParser`: Parses MySQL general log format. Supports both ISO 8601 (`2024-04-05T10:00:00.000000Z`) and compact (`240405 10:00:00`) timestamp formats. Skips non-Query events (Connect, Quit, Init DB). Guards against invalid timestamps.
  - `MysqlSlowQueryLogParser`: Parses MySQL slow query log format. Extracts `durationMs` (Query_time × 1000) and `rowsExamined` per entry. Handles multi-line SQL and optional `use db;` statements for database context.
  - `CanonicalJsonlParser`: Reads JSONL where each line is a `{ timestamp, sql, connectionId?, durationMs?, rowsExamined? }` object — a stable target format for any custom log collector. Skips malformed lines and entries with missing required fields.
  - All parsers stream line-by-line (O(1) memory) — safe to use on multi-GB production logs.
- **`QueryEvent` type**: Canonical input schema shared by all log parsers. Defines the contract for external tools targeting Archivolt.
- **`LogImportService`**: Orchestrates parse → virtual session creation. Uses `analyzeQuery()` for SQL operation and table inference. Guarantees stream cleanup via `try-finally`.

## [0.4.0] - 2026-04-04

### Added
- **DB Performance Optimization Report** (`--format optimize-md`): A three-layer analysis pipeline that turns recorded sessions into actionable, runnable SQL recommendations.
  - **Layer 1 — Pattern Analysis (offline)**: N+1 query detection aggregated to API path level with batch `IN (...)` rewrite suggestions. Query fragmentation detection (≥3 identical queries per request) with `dataloader`/`batch`/`cache` recommendations. Read/write ratio analysis with Redis TTL and Read Replica suggestions.
  - **Layer 2a — DDL Schema Diff** (`--ddl <schema.sql>`): Parses MySQL `CREATE TABLE` DDL with regex (backtick identifiers, composite indexes, `AUTO_INCREMENT`, charset/collation). Cross-references N+1 and fragmentation findings against existing indexes to surface un-indexed `WHERE` columns. Generates `CREATE INDEX` statements marked as "unverified — test in staging first."
  - **Layer 2b — EXPLAIN Live Analysis** (`--explain-db <url>`): Connects to a live MySQL database, deduplicates SELECT queries by hash, runs `EXPLAIN` concurrently (configurable with `--explain-concurrency`, default 5), and detects full table scans (`type=ALL`, rows > `--min-rows`). 5-second connection timeout; gracefully skips Layer 2b on failure.
  - **Index Suggestion Merging**: When both DDL and EXPLAIN confirm the same missing index, the finding is marked `source: 'both'` and promoted to "confirmed" confidence.
  - **Runnable Markdown output**: Every finding includes a `CREATE INDEX`, batch query rewrite, or cache comment — ready to copy-paste.
- **`--explain-concurrency <n>`** flag (default 5): Tune EXPLAIN query parallelism for remote DBs over VPN or fast local instances.
- **DDL corpus test fixtures**: 5 real-world MySQL DDL fixtures (`laravel_ecommerce`, `rails_blog`, `mysql_charset_collation`, `composite_indexes`, `wordpress_core`) exercise the parser against production-like schema patterns.

## [0.3.0] - 2026-04-04

### Added
- **Flow Grouping**: Automatically groups recorded queries into logical flows using navigate-boundary strategy. Each flow maps to a URL and carries a dominant read/write pattern and inferred relations.
- **Noise Table Detection**: Identifies tables that appear in more than 60% of flows (e.g. session or auth tables) and filters them out of semantic analysis to reduce noise.
- **HTTP Proxy & API↔DB Correlation**: Built-in HTTP reverse proxy captures API traffic. `UnifiedCorrelationService` matches HTTP flows to database queries within a 500ms time window using SHA-256 query hashing, surfacing N+1 patterns at the API-call level.
- **Operation Manifest**: `AnalyzeCommand` now outputs a structured manifest with bootstrap metadata, per-flow query breakdowns, noise tables, and correlated API call flows.
- **ReadWriteRatioAnalyzer** (Optimization Report foundation): Computes per-table read/write ratios across a recorded session. Emits `redis_cache` recommendations when a table's read ratio is ≥ 90% with ≥ 10 queries, and `read_replica` when ratio ≥ 80% with > 100 queries. Errored queries are excluded. This is Layer 1 of the upcoming `--format optimize-md` optimization report.

### Changed
- `ManifestMarkdownRenderer` extended with API Call Flows section and Bootstrap summary.
- `RecordCommand` adds `--http-proxy` / `--http-port` flags to enable HTTP recording alongside the TCP proxy.

## [0.2.0] - 2026-04-03

### Added
- **SQL Proxy Recording**: Built a MySQL-aware TCP proxy to record raw database queries in real-time.
- **Query Chunking**: Implemented an algorithm to group captured queries into logical "chunks" based on browser events and time intervals.
- **Chrome Extension**: Introduced a companion browser extension to capture user interactions (clicks, fetch, navigation) and sync them with query recording.
- **Visual Debugger (Web)**: Added a timeline panel for query playback, chunk highlighting, and real-time synchronization with the ER model.
- **Archivolt Doctor**: A comprehensive diagnostics system to verify environment health (Bun, dbcli, ports), project dependencies, and data integrity (virtual FKs, recording sessions).
- **Interactive Prompter**: Added a CLI interface to automatically suggest and apply fixes for diagnostic issues found by the Doctor.
- **Advanced Exporters**: Full support for exporting annotated ER models to Mermaid, DBML, Prisma Schema, and Laravel Eloquent models (with Artisan support).
- **Automatic Relation Inference**: Enhanced link prediction based on `_id` suffixes and pluralized table names.

### Changed
- **LOD (Level of Detail)**: Optimized web UI to handle large ER models with glassmorphism and detail-on-demand rendering.
- **Export Architecture**: Refactored the export system to use a pluggable `IFileWriter` interface supporting stdout, directory writes, and custom artisan commands.

### Fixed
- Improved immutability and error handling across the core domain services.
- Corrected port availability detection in the Doctor module.

## [0.1.0] - 2026-04-01

### Added
- **Initial Release**: Core ER model visualization and manual virtual FK labeling.
- **Basic Importers**: Support for importing database schemas via `dbcli` JSON format.
- **Interactive UI**: Basic React-based canvas for exploring table relationships.

---
[0.4.0]: https://github.com/CarlLee1983/archivolt/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CarlLee1983/archivolt/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CarlLee1983/archivolt/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/archivolt/releases/tag/v0.1.0
