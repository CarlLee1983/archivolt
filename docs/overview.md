# Project Overview

Archivolt is a local ER visualization and annotation tool. It helps developers understand, annotate, and export implicit relationships (Virtual Foreign Keys) in legacy databases.

- **Backend**: Bun + TypeScript API server (Gravito / PlanetCore)
- **Frontend**: React + ReactFlow interactive UI
- **TCP proxy**: Query recording and SQL analysis with automatic relation hints
- **Chrome extension**: Captures browser events as operation markers

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend runtime | Bun |
| Backend framework | Gravito / PlanetCore |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Graph visualization | @xyflow/react 12 (React Flow) |
| Frontend state | Zustand 5 |
| Graph layout | Dagre |
| Testing | Vitest |
| Linter / formatter | Biome |
| Language | TypeScript 5.3+ |

## Version

Currently v0.2.0
