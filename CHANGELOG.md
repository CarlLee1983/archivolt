# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
[0.3.0]: https://github.com/CarlLee1983/archivolt/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CarlLee1983/archivolt/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/archivolt/releases/tag/v0.1.0
