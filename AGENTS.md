# AGENTS.md

> **Agent Startup Rule**: 在執行任何 Directive 之前，請先檢查 `CONTRADICTIONS.md` 中的指令優先順序與已知衝突，確保決策不違反項目約定。

Archivolt — Reverse-engineering tool for legacy projects: analyze and understand the database before refactoring. Includes ER visualization and annotation (Virtual Foreign Keys), DB proxy query capture, query playback analysis, and more.

## Quick Reference

| Command | Description |
|---------|-------------|
| `bun run dev:all` | Start backend API :3100 + frontend :5173 |
| `bun run check` | typecheck + lint + test |
| `bun run test` | Vitest unit tests |

## Documentation Update Policy

**每個功能完成後，必須執行以下文件更新步驟：**

1. **`CHANGELOG.md`** — 新增版本條目，描述新功能（用使用者視角撰寫，不是 commit log）
2. **`VERSION.md`** — 更新版本號與 Release History
3. **`README.md`** — 更新 Features 列表與 Project Structure（如有新目錄/指令）
4. **`docs/commands.md`** — 新增任何新 CLI 指令
5. **`AGENTS.md`** — 在 Core Architectural Decisions 新增本次決策紀錄
6. **`TODOS.md`** — 將已完成的 TODO 移至 Completed 區塊

可直接呼叫 `/document-release` skill 自動執行上述步驟。

## Language Policy

- **Git Commit Messages**: Must be written in **English** (following Conventional Commits).
- **Communication**: Agent-developer interaction and local task discussions must be in **Traditional Chinese (繁體中文)**.
- **Documentation**: For every `*.zh-TW.md` file, there must be a corresponding `*.md` English version as the primary source of truth.

## Core Architectural Decisions

### 1. VFK Review UX (2026-04-05)
- **Goal**: Minimize friction in accepting auto-detected relationships.
- **Design**: A three-state lifecycle (Pending/Confirmed/Ignored) for each `VirtualFK`.
- **Implementation**: The state is stored in `archivolt.json` within each vFK entry. The `ReviewPage` in the frontend acts as the control center, while the `Canvas` provides visual context.
- **Badge Logic**: The "Pending" count is computed in `schemaStore` to provide global navigation cues.

### 2. Optimization Report Pipeline (2026-04-04)
- **Goal**: Provide actionable DB optimization advice without requiring a live connection by default.
- **Structure**: Three layers (Layer 1: Offline session analysis, Layer 2a: DDL diff, Layer 2b: Live EXPLAIN).
- **Format**: Standardized as GitHub-flavored Markdown (`--format optimize-md`) for easy sharing and copy-pasting of SQL snippets.

### 3. Log Input Sources (2026-04-05)
- **Goal**: Analyze MySQL general logs, slow query logs, or custom JSONL without a live proxy session — useful for production hosts where running a TCP proxy is impractical.
- **Design**: A canonical `QueryEvent` schema (timestamp, sql, connectionId?, durationMs?, rowsExamined?) decouples log format from analysis. `IQueryLogParser` implementations stream-parse each format line-by-line (O(1) memory). `LogImportService` converts events to `CapturedQuery[]` and creates a virtual `RecordingSession`, which the existing `AnalyzeCommand` pipeline consumes unchanged.
- **CLI**: `archivolt analyze --from general-log|slow-log|canonical <path>` — composes with all existing flags (`--format optimize-md`, `--ddl`, `--explain-db`, `--stdout`).

### 4. AI Skill Family (2026-04-05)
- **Goal**: Turn Archivolt's reverse-engineering output into actionable architecture recommendations for legacy project refactoring.
- **Design**: Four independent Claude Code skills (`archivolt-schema`, `archivolt-record`, `archivolt-analyze`, `archivolt-advisor`) in `skills/`. Each has a single responsibility and can be invoked independently. `archivolt-advisor` reads accumulated artifacts and produces a Markdown architecture recommendation report.
- **Distribution**: `archivolt install-skill` copies skills to `~/.claude/plugins/archivolt/skills/` (Claude Code), `.cursor/rules/` (Cursor), or a combined system prompt file (Codex).

- [Overview & Tech Stack](docs/overview.md)
- [Commands](docs/commands.md)
- [Architecture](docs/architecture.md) — Backend DDD modules, frontend, Chrome extension, data flow
- [Testing](docs/testing.md)
- [Conventions](docs/conventions.md)
- [Workflow](docs/WORKFLOW.zh-TW.md)
