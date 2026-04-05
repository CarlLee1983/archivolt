# Project Overview

Archivolt is a local ER visualization and annotation tool. It helps developers understand, annotate, and export implicit relationships (Virtual Foreign Keys) in legacy databases.

- **Visual Database Explorer**: Built with [ReactFlow](https://reactflow.dev/) for an interactive and zoomable schema visualization.
- **Virtual Foreign Keys (vFK)**: Annotate "implicit" relationships between tables without modifying the production database schema.
- **Unified Analysis**: Built-in HTTP and TCP proxies to correlate API calls with SQL patterns.
- **Log File Analysis**: Analyze MySQL general logs, slow query logs, or any canonical JSONL without a live proxy session. Use `--from general-log|slow-log|canonical <path>` to feed existing log files into the same optimization pipeline.
- **End-to-End Observation**: Detect N+1 queries, noise tables, and group database queries into logical flows.
- **Multi-Format Exporters**: Eloquent, Prisma, DBML, and Mermaid support.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend runtime | Bun |
| Backend framework | Gravito / PlanetCore |
| DB Recording Proxy | Custom TCP Proxy (MySQL/Postgres protocol) |
| API Recording Proxy | Bun.serve() HTTP Reverse Proxy |
| SQL Analysis | SQL normalization + SHA256 hashing |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Graph visualization | @xyflow/react 12 (React Flow) |
| Frontend state | Zustand 5 |
| Graph layout | Dagre |
| Testing | Vitest |
| Linter / formatter | Biome |
| Language | TypeScript 5.3+ |

## Version

Currently v0.3.0 (April 2026)
