# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
[0.2.0]: https://github.com/CarlLee1983/archivolt/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/archivolt/releases/tag/v0.1.0
