# 📦 Archivolt Versioning

This document tracks the release versions and compatibility requirements for all Archivolt components.

---

## 🚀 Current Release: v0.6.0 (2026-04-05)

| Component | Version | Description |
|-----------|---------|-------------|
| **Archivolt CLI / API** | `0.6.0` | Core logic, Recording Proxy, Semantic Analysis, Optimization Report, Log Import, AI Skills. |
| **Web Dashboard** | `0.6.0` | ReactFlow Canvas, VFK Review UX, Timeline Playback. |
| **Chrome Extension** | `1.0.0` | Browser event capture (navigate, submit, click, request). |

---

## 🛠️ System Compatibility

| Dependency | Minimum Version | Notes |
|------------|-----------------|-------|
| [Bun](https://bun.sh) | `v1.0.0` | Core runtime. |
| [dbcli](https://github.com/CarlLee1983/dbcli) | `v1.2.0` | Required for schema extraction (`--format json`). |
| Chrome / Edge | `v110+` | Required for the Extension (Manifest V3). |

---

## 📅 Release History (Summary)

- **v0.6.0** (Current):
  - ✨ Added **AI Skill Family** — `archivolt-schema`, `archivolt-record`, `archivolt-analyze`, `archivolt-advisor` for guided reverse-engineering and architecture recommendation.
  - ✨ Added **`install-skill`** CLI command for Claude Code / Cursor / Codex distribution.
- **v0.5.0**:
  - ✨ Added **Log File Analysis** (`--from general-log|slow-log|canonical`).
- **v0.4.0**:
  - ✨ Added **VFK Review UX** (Pending/Confirmed/Ignored status).
  - ✨ Added **Table Name Filter** in ER Canvas.
  - ✅ Finalized **Optimization Report Pipeline** (Layer 1, 2a, 2b).
- **v0.3.x**:
  - ✨ Added **HTTP Proxy & API Correlation** (500ms window).
  - ✨ Added **N+1 Query Detection**.
- **v0.2.x**:
  - ✨ Added **TCP Recording Proxy & Query Chunking**.
  - ✨ Added **Eloquent/Prisma/DBML/Mermaid Exporters**.
- **v0.1.x**:
  - ✨ Initial alpha release with basic ER Canvas and vFK annotation.
