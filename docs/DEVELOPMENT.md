# 🛠️ Archivolt Development Guide

This document is for developers and contributors, explaining how to start, debug, and test Archivolt in a local environment.

---

## 🚀 Quick Start

Archivolt consists of a **Backend (Bun)** and a **Frontend (Vite/React)**.

1. **Install Dependencies**:
   ```bash
   bun install
   ```
2. **Start Development Environment (Full System)**:
   ```bash
   # Run in root directory to start both API Server and Web Dev Server
   bun run dev:all
   ```
   - API: `http://localhost:3100` (API Server)
   - UI: `http://localhost:5173` (Vite Preview)

3. **Start Components Separately**:
   - API Only (Hot Reload): `bun run dev`
   - UI Only: `cd web && bun run dev`

---

## 🛠️ Common Development Commands

### CLI Subcommand Testing
During development, you can test CLI behavior directly using `src/index.ts`:
```bash
# Record test
bun run src/index.ts record start --target localhost:3306

# Analyze test
bun run src/index.ts analyze <session-id>

# Export test
bun run src/index.ts export eloquent
```

### Environment Check (Doctor)
Use the `doctor` command to verify that the development environment meets the specifications:
```bash
bun run src/index.ts doctor
```

### Testing and Validation
- **Run all tests**: `bun test`
- **Linting check**: `bunx biome check .`
- **Auto-fix linting**: `bunx biome check --apply .`

---

## 🌐 Chrome Extension Development

The extension is located in the `extension/` directory.

1. **Build Extension**:
   ```bash
   cd extension
   bun install
   bun run build.ts
   ```
2. **Load into Browser**:
   - Open Chrome `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked", and select the `extension/dist` directory.

---

## 🏗️ Architecture and Conventions

- **Tech Stack**: Bun, TypeScript, React, TailwindCSS, Vitest.
- **Modularity**: Core logic is located in `src/Modules/`, following a Domain-Driven Design (DDD) style.
- **Conventions**: Please refer to `docs/conventions.md` for naming and coding style standards.
