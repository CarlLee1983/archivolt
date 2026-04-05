# Archivolt Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create four Claude Code skill Markdown files (`archivolt-schema`, `archivolt-record`, `archivolt-analyze`, `archivolt-advisor`) and an `install-skill` CLI command that copies them to the user's Claude/Cursor/Codex environment.

**Architecture:** Skills live in `skills/` at the project root — plain Markdown files following the superpowers skill format. The `InstallSkillCommand` reads this directory and copies files to `~/.claude/plugins/archivolt/skills/` (Claude Code), `.cursor/rules/` (Cursor), or writes a combined system prompt file (Codex).

**Tech Stack:** Bun, TypeScript, Vitest, Markdown

---

## File Map

### Create
- `skills/archivolt-schema.md` — Skill: environment setup, DDL collection, VFK review
- `skills/archivolt-record.md` — Skill: guided recording session (Chrome extension or proxy)
- `skills/archivolt-analyze.md` — Skill: run analysis pipeline, produce reports
- `skills/archivolt-advisor.md` — Skill: read artifacts, ask questions, output architecture recommendation
- `src/CLI/InstallSkillCommand.ts` — CLI command: copy skills to target environment

### Modify
- `src/index.ts` — Add `install-skill` dispatch branch
- `test/unit/Recording/CLI/InstallSkillCommand.test.ts` — Unit tests for arg parsing

---

## Task 1: `skills/archivolt-schema.md`

**Files:**
- Create: `skills/archivolt-schema.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: archivolt-schema
description: Set up Archivolt for a legacy project — run doctor, collect DDL schema, and guide VFK review. Use when starting Archivolt on a new project or when schema has changed.
triggers:
  - 分析我的舊資料庫 schema
  - 設定 Archivolt
  - review VFK
  - set up archivolt
  - 我要逆向分析這個舊專案
---

# archivolt-schema

Guide the developer through environment setup, schema collection, and Virtual Foreign Key review for a legacy database.

## When to use

Run this skill once at the start of a legacy reverse-engineering project, or whenever the schema changes significantly.

## Step 1 — Doctor check

Run the health check to verify CLI, DB connectivity, and dependencies:

\```bash
archivolt doctor
\```

**Expected output:** All checks pass (✅). If any check fails, follow the fix instructions printed by doctor before continuing.

**Gate:** Do not proceed until `archivolt doctor` exits without errors.

## Step 2 — DB connection setup

If doctor reported a DB connection failure:

1. Locate or create `.env` in the project root
2. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. Re-run `archivolt doctor` and confirm the DB check passes

## Step 3 — Schema collection

Export the full DDL schema:

\```bash
archivolt analyze --ddl schema.sql
\```

**Expected output:** `schema.sql` written to the current directory, containing `CREATE TABLE` statements for all tables.

Verify: `wc -l schema.sql` should show a non-zero line count.

## Step 4 — VFK review

Archivolt auto-detects Virtual Foreign Keys (name-based matching). Now confirm or reject them:

1. Start the web UI:
   \```bash
   bun run dev:all
   \```
2. Open `http://localhost:5173` in the browser
3. Navigate to the **Review** page (sidebar)
4. For each **Pending** VFK:
   - Click **Confirm** if the relationship is real
   - Click **Ignore** if it is a false positive
5. Optionally add manual VFKs for relationships the auto-detection missed

**Gate:** Ask the developer:

> "VFK 審查完成了嗎？Pending 數量是否歸零，或剩餘的都是你決定忽略的？"

Only proceed when the developer confirms.

## Output artifacts

- `schema.sql` — DDL snapshot used by `archivolt-analyze`
- `archivolt.json` — Updated with confirmed/ignored VFKs

## Next step

Run `/archivolt-record` to capture query behavior from the application.
```

- [ ] **Step 2: Verify file created**

```bash
wc -l skills/archivolt-schema.md
```
Expected: > 50 lines

- [ ] **Step 3: Commit**

```bash
git add skills/archivolt-schema.md
git commit -m "feat: [skills] archivolt-schema skill — doctor, DDL collection, VFK review"
```

---

## Task 2: `skills/archivolt-record.md`

**Files:**
- Create: `skills/archivolt-record.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: archivolt-record
description: Capture application query behavior via Chrome extension (primary) or DB proxy (fallback). Use when you need to record representative user workflows for analysis.
triggers:
  - 幫我側錄操作行為
  - 開始錄製
  - capture queries
  - record session
  - 我要側錄 app 行為
---

# archivolt-record

Guide the developer through recording a query session. The Chrome extension path captures rich UI semantic markers (navigate/click/submit events) which significantly improves business-flow detection. The proxy-only path is a fallback when Chrome extension setup is not feasible.

## When to use

Run this skill each time you need to capture a new set of application behaviors for analysis.

## Prerequisites

- `archivolt-schema` has been run and `archivolt.json` exists
- DB proxy port (default 13306) is accessible
- Application is running locally or on a reachable host

---

## Path A — Chrome Extension + Proxy (★★★★★ Recommended)

With the Chrome extension, every navigation, form submit, and click is sent as an operation marker to the proxy. This annotates query chunks with UI context, enabling precise business-flow identification in `archivolt-advisor`.

### Step A1 — Build the extension

The agent runs this automatically:

\```bash
cd extension && bun run build
\```

**Expected output:** `extension/dist/` created containing `background.js`, `content.js`, `popup.html`.

### Step A2 — Load extension in Chrome (manual)

Chrome's extension management page is protected and cannot be automated.

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` directory from this project
5. The **Archivolt Marker** extension icon should appear in the toolbar

### Step A3 — Start recording

\```bash
archivolt record start --target localhost:3306
\```

Replace `localhost:3306` with your actual DB host:port.

**Expected output:**
\```
✅ Proxy listening on 0.0.0.0:13306 → localhost:3306
📍 Session ID: <uuid>
\```

### Step A4 — Activate extension and point app at proxy

1. Click the **Archivolt Marker** extension icon
2. Select the tab running your application
3. Click **Start recording**

Reconfigure your application's DB connection to use the proxy port (13306 by default) instead of the real DB port.

### Step A5 — Operate the application

Perform representative workflows — login, create records, search, update, delete, checkout. Cover the main user journeys. Aim for 5–15 minutes of realistic activity.

The extension automatically sends a marker for each navigation, form submit, and significant click.

### Step A6 — Stop recording

\```bash
archivolt record stop
\```

Then click **Stop recording** in the extension popup.

**Verify:**
\```bash
archivolt record status
\```
Expected: Session listed with query count > 0.

---

## Path B — DB Proxy Only (★★★ Fallback)

Use this path if Chrome extension installation is not feasible (e.g., team machines, CI environment, or production log analysis).

> ⚠️ **Data quality warning:** Without the Chrome extension, query chunks are split using 500 ms silence intervals only. There are no UI semantic markers. This reduces the accuracy of Use Case identification and architecture recommendations in `archivolt-advisor`.

### Step B1 — Start proxy

\```bash
archivolt record start --target localhost:3306
\```

### Step B2 — Operate the application

Point the application's DB connection at the proxy port (13306). Perform representative workflows.

### Step B3 — Stop proxy

\```bash
archivolt record stop
\```

---

## Output artifacts

- Recording session stored in Archivolt data directory
- `markers.jsonl` in the session directory (Path A only)

## Next step

Run `/archivolt-analyze` to generate the optimization report and ER export.
```

- [ ] **Step 2: Verify file created**

```bash
wc -l skills/archivolt-record.md
```
Expected: > 80 lines

- [ ] **Step 3: Commit**

```bash
git add skills/archivolt-record.md
git commit -m "feat: [skills] archivolt-record skill — Chrome extension + proxy recording"
```

---

## Task 3: `skills/archivolt-analyze.md`

**Files:**
- Create: `skills/archivolt-analyze.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: archivolt-analyze
description: Run the Archivolt analysis pipeline on a recorded session to produce an optimization report and ER export. Use after completing a recording session.
triggers:
  - 分析側錄結果
  - 產生報告
  - run analysis
  - generate optimization report
  - 跑優化分析
---

# archivolt-analyze

Run the full analysis pipeline on a recorded session. This produces the optimization report (`optimize-report.md`) and ER export that `archivolt-advisor` uses to recommend an architecture.

## When to use

Run this skill after completing a recording session with `archivolt-record`.

## Prerequisites

- A completed recording session exists (`archivolt record status` shows a session)
- `schema.sql` exists in the current directory (from `archivolt-schema`)

---

## Step 1 — Run optimization report

\```bash
archivolt analyze --format optimize-md --ddl schema.sql > optimize-report.md
\```

This runs the full Layer 1 + Layer 2 pipeline:
- **Layer 1:** ReadWriteRatioAnalyzer, N1QueryDetector, QueryFragmentationDetector
- **Layer 2a:** IndexCoverageGapAnalyzer (using `schema.sql`)
- **Layer 2b:** ExplainAnalyzer (requires live DB connection)

**Expected output:** `optimize-report.md` written. Verify:

\```bash
head -20 optimize-report.md
\```

Should show a Markdown report with `## Read/Write Ratio` or similar section headings.

**If Layer 2b fails** (no live DB): Run without EXPLAIN:

\```bash
archivolt analyze --format optimize-md --ddl schema.sql --no-explain > optimize-report.md
\```

## Step 2 — Export ER relationships

\```bash
archivolt export er
\```

**Expected output:** ER export file created. Note the path printed to stdout.

## Step 3 — Review query chunks (recommended)

Open the web UI to review semantic chunk labels:

\```bash
bun run dev:all
\```

Navigate to **Timeline Panel** in the web UI. Review the query chunks — each chunk should correspond to a user action (if Chrome extension was used). Verify the chunk labels match your mental model of the application's workflows.

This step is optional but improves the accuracy of `archivolt-advisor`'s Use Case identification.

---

## Output artifacts

- `optimize-report.md` — Layer 1+2 findings (read/write ratio, N+1, index gaps, EXPLAIN analysis)
- ER export file — Table relationships including confirmed VFKs

## Next step

Run `/archivolt-advisor` to receive architecture recommendations.
```

- [ ] **Step 2: Verify file created**

```bash
wc -l skills/archivolt-analyze.md
```
Expected: > 60 lines

- [ ] **Step 3: Commit**

```bash
git add skills/archivolt-analyze.md
git commit -m "feat: [skills] archivolt-analyze skill — optimization report + ER export"
```

---

## Task 4: `skills/archivolt-advisor.md`

**Files:**
- Create: `skills/archivolt-advisor.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: archivolt-advisor
description: Read Archivolt analysis artifacts, ask key questions about team and project context, and produce a targeted architecture recommendation for refactoring a legacy system. Use when ready to plan a refactor or migration.
triggers:
  - 幫我規劃重構架構
  - 這個舊系統要用什麼架構
  - 我有個 legacy 系統要遷移
  - recommend architecture
  - help me migrate this old codebase
  - 逆向工程完了，下一步怎麼重構
---

# archivolt-advisor

Read Archivolt reverse-engineering artifacts and produce an architecture recommendation for refactoring or migrating a legacy system. Combines data-driven signals from Archivolt with developer context to recommend the right architecture — not over-engineer, not under-engineer.

## When to use

After completing the `archivolt-schema` → `archivolt-record` → `archivolt-analyze` flow, or when the developer already has an `optimize-report.md` to share.

---

## Entry points

**Full flow:** All three prior skills have been run. Artifacts exist locally:
- `optimize-report.md`
- `schema.sql`
- `archivolt.json` (with confirmed VFKs)

**Manual entry:** Ask the developer to paste the content of `optimize-report.md` directly into the chat. Proceed without ER data if unavailable — note reduced confidence.

---

## Step 1 — Collect artifacts

Ask the developer:

> "請確認以下檔案存在：`optimize-report.md`、`schema.sql`、`archivolt.json`。如果有其中一個不存在，請先執行對應的 skill，或把報告內容直接貼到這裡。"

Read the available artifacts. Extract:
- Read/write ratio (from optimize-report.md)
- N+1 detection results
- Index gap findings
- Table count and VFK cluster structure (from archivolt.json)
- Query chunk count and semantic labels (if available)

---

## Step 2 — Ask supplementary questions (one at a time)

Ask these four questions sequentially. Wait for each answer before asking the next.

**Question 1 — Team size:**
> "你們的開發團隊有多大？
> a) 獨立開發者（1人）
> b) 小團隊（2–9人）
> c) 中大型團隊（10人以上）"

**Question 2 — Codebase state:**
> "這個專案的現況是？
> a) 全新開始，完全重寫
> b) 漸進遷移，舊系統仍在運作中
> c) 局部重構，只改特定模組"

**Question 3 — Business domain count:**
> "這個系統的業務邊界是？
> a) 單一業務域（例如：純電商、純 CMS）
> b) 多業務域但共用同一個資料庫
> c) 明顯可以拆分的子系統（例如：訂單、庫存、通知各自獨立）"

**Question 4 — Traffic scale:**
> "預期的流量規模是？
> a) 低（DAU < 10k，或內部工具）
> b) 中（DAU 10k–100k）
> c) 高（DAU > 100k，或需要水平擴展）"

---

## Step 3 — Interpret Archivolt signals

Cross-reference the artifacts with the developer's answers using this table:

| Signal | Threshold | Architectural Implication |
|--------|-----------|--------------------------|
| Read/write ratio | > 8:1 | Consider CQRS — separate read model reduces DB pressure |
| N+1 density | > 3 distinct patterns | Avoid Active Record ORM; use explicit Repository pattern |
| Table count + VFK clusters | > 50 tables with distinct clusters | DDD Bounded Contexts likely map to VFK cluster boundaries |
| Query chunk semantic markers | Present | Core Use Cases identifiable → map to Application Services |
| Heavy cross-domain JOINs | > 20% of queries join across VFK clusters | Microservices split will require event-driven consistency — warn |
| Low query diversity + simple schema | < 20 tables, < 5 distinct query patterns | Slim MVC is sufficient — do not over-engineer |

---

## Step 4 — Select architecture

Use this decision matrix combining signals and developer answers:

| Condition | Recommended Architecture |
|-----------|-------------------------|
| Single domain + small team + low traffic | **Slim MVC** (Laravel / Rails conventions) |
| Multi-domain + testability needed + medium team | **Hexagonal / Clean Architecture** |
| Complex domain logic + distinct VFK clusters + medium-large team | **DDD + DCI** |
| Multiple domains + not ready for distributed systems | **Modular Monolith** |
| High traffic + independent scaling + large team + clean data boundaries | **Microservices** |

Default to the **simplest architecture that fits** — only escalate complexity when signals clearly justify it.

---

## Step 5 — Output architecture recommendation report

Produce a Markdown report with this structure:

\```markdown
# Architecture Recommendation: [Project Name or DB Name]

## Recommended Architecture: [Architecture Name]

### Why — Based on Archivolt Findings
[List 3–5 specific signals from optimize-report.md and archivolt.json that drove this decision.
Be concrete: "Read/write ratio of X:1 detected" not "high read traffic".]

### Architecture Comparison

| Architecture | Fit | Reason |
|-------------|-----|--------|
| [Recommended] | ✅ Best fit | [Why] |
| [Alternative 1] | ⚠️ Possible | [Trade-off] |
| [Alternative 2] | ❌ Over-engineered | [Why not] |

### Bounded Context Map (if DDD or Modular Monolith)
[List suggested context boundaries based on VFK cluster groups from archivolt.json.
Each context: name, core tables, key operations identified from query chunks.]

### First Action Checklist
- [ ] [Specific first step — e.g., "Create `src/Modules/Order/` directory structure"]
- [ ] [Second step]
- [ ] [Third step]
(5–8 concrete, executable steps to start the refactor)

### Data Quality Note
[Only include if artifacts were incomplete. Example:
"Chrome extension markers were not available. Use Case identification is based on 500 ms silence-based chunking only. Consider re-running archivolt-record with the Chrome extension for higher confidence."]
\```

---

## Architecture reference

### Slim MVC
Thin controllers, fat models with business logic, shared DB. Works well for single-domain CRUD-heavy apps with a small team. Laravel / Rails out-of-the-box conventions.

### Hexagonal / Clean Architecture
Core domain isolated from infrastructure (DB, HTTP). Ports and Adapters pattern. Good for testability and when multiple delivery mechanisms are needed. Medium complexity.

### DDD + DCI
Strategic design (Bounded Contexts, Aggregates, Domain Events) plus role-based interaction modeling (DCI). Best for complex domains with rich behavior. Higher learning curve.

### Modular Monolith
Multiple modules in one deployable unit with strict module boundaries (no cross-module direct calls — only through public interfaces). Good migration path: start monolith, extract to services later.

### Microservices
Independent deployable services per domain. Requires event-driven consistency, distributed tracing, and a mature DevOps team. Only justified at scale with clear domain boundaries.
```

- [ ] **Step 2: Verify file created**

```bash
wc -l skills/archivolt-advisor.md
```
Expected: > 100 lines

- [ ] **Step 3: Commit**

```bash
git add skills/archivolt-advisor.md
git commit -m "feat: [skills] archivolt-advisor skill — architecture recommendation from reverse-engineering artifacts"
```

---

## Task 5: `InstallSkillCommand.ts` + tests + wire

**Files:**
- Create: `src/CLI/InstallSkillCommand.ts`
- Create: `test/unit/Recording/CLI/InstallSkillCommand.test.ts`
- Modify: `src/index.ts` (add dispatch branch for `install-skill`)

### Step 1: Write failing tests

- [ ] **Step 1: Write the failing tests**

Create `test/unit/Recording/CLI/InstallSkillCommand.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseInstallSkillArgs } from '@/CLI/InstallSkillCommand'

describe('parseInstallSkillArgs', () => {
  it('defaults to claude format', () => {
    const args = parseInstallSkillArgs(['install-skill'])
    expect(args.format).toBe('claude')
  })

  it('parses --cursor flag', () => {
    const args = parseInstallSkillArgs(['install-skill', '--cursor'])
    expect(args.format).toBe('cursor')
  })

  it('parses --codex flag', () => {
    const args = parseInstallSkillArgs(['install-skill', '--codex'])
    expect(args.format).toBe('codex')
  })

  it('--cursor takes precedence if both flags given', () => {
    const args = parseInstallSkillArgs(['install-skill', '--cursor', '--codex'])
    expect(args.format).toBe('cursor')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test test/unit/Recording/CLI/InstallSkillCommand.test.ts
```

Expected: FAIL — `Cannot find module '@/CLI/InstallSkillCommand'`

- [ ] **Step 3: Implement `InstallSkillCommand.ts`**

Create `src/CLI/InstallSkillCommand.ts`:

```typescript
import path from 'node:path'
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export interface InstallSkillArgs {
  readonly format: 'claude' | 'cursor' | 'codex'
}

export function parseInstallSkillArgs(argv: string[]): InstallSkillArgs {
  if (argv.includes('--cursor')) return { format: 'cursor' }
  if (argv.includes('--codex')) return { format: 'codex' }
  return { format: 'claude' }
}

function resolveSkillsDir(): string {
  // Walk up from this file's directory to find skills/
  const candidates = [
    path.resolve(import.meta.dir, '../..', 'skills'),   // src/CLI -> project root
    path.resolve(process.cwd(), 'skills'),               // CWD fallback
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('skills/ directory not found. Is Archivolt installed correctly?')
}

export async function runInstallSkillCommand(argv: string[]): Promise<void> {
  const { format } = parseInstallSkillArgs(argv)
  const skillsDir = resolveSkillsDir()
  const files = (await readdir(skillsDir)).filter((f) => f.endsWith('.md'))

  if (files.length === 0) {
    console.error('❌ No skill files found in skills/')
    process.exit(1)
  }

  if (format === 'claude') {
    const home = process.env.HOME
    if (!home) throw new Error('HOME environment variable not set')
    const targetDir = path.join(home, '.claude', 'plugins', 'archivolt', 'skills')
    await mkdir(targetDir, { recursive: true })
    for (const file of files) {
      await copyFile(path.join(skillsDir, file), path.join(targetDir, file))
      console.log(`✅ Installed: ${file}`)
    }
    console.log(`\n🎉 Skills installed to ${targetDir}`)
    console.log('Restart Claude Code to activate.')
    return
  }

  if (format === 'cursor') {
    const targetDir = path.join(process.cwd(), '.cursor', 'rules')
    await mkdir(targetDir, { recursive: true })
    for (const file of files) {
      const mdcName = file.replace('.md', '.mdc')
      await copyFile(path.join(skillsDir, file), path.join(targetDir, mdcName))
      console.log(`✅ Written: .cursor/rules/${mdcName}`)
    }
    console.log('\n🎉 Skills written to .cursor/rules/')
    return
  }

  if (format === 'codex') {
    const parts: string[] = ['# Archivolt Skills\n']
    for (const file of files) {
      const content = await readFile(path.join(skillsDir, file), 'utf-8')
      parts.push(`---\n\n${content}`)
    }
    const outPath = path.join(process.cwd(), 'archivolt-skills-system-prompt.md')
    await writeFile(outPath, parts.join('\n'), 'utf-8')
    console.log(`✅ Written: archivolt-skills-system-prompt.md`)
    console.log('Prepend this file\'s content to your Codex or ChatGPT system prompt.')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test test/unit/Recording/CLI/InstallSkillCommand.test.ts
```

Expected: PASS — all 4 tests green

- [ ] **Step 5: Wire into `src/index.ts`**

Add the following dispatch branch in `src/index.ts`, after the `diff` branch and before the `--input` handling:

```typescript
  if (args[0] === 'install-skill') {
    const { runInstallSkillCommand } = await import('@/CLI/InstallSkillCommand')
    await runInstallSkillCommand(args)
    process.exit(0)
  }
```

- [ ] **Step 6: Smoke test the command**

```bash
bun src/index.ts install-skill --help 2>&1 || true
bun src/index.ts install-skill 2>&1 | head -5
```

Expected second command: prints `✅ Installed: archivolt-schema.md` (or similar) and exits cleanly. If `skills/` does not exist yet, it prints the error message cleanly without a stack trace.

- [ ] **Step 7: Run full test suite**

```bash
bun run check
```

Expected: typecheck + lint + all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/CLI/InstallSkillCommand.ts \
        test/unit/Recording/CLI/InstallSkillCommand.test.ts \
        src/index.ts
git commit -m "feat: [cli] install-skill command — copy archivolt skills to Claude/Cursor/Codex"
```

---

## Self-Review

**Spec coverage:**
- ✅ `archivolt-schema.md` — doctor, DDL, VFK review, confirmation gate
- ✅ `archivolt-record.md` — Chrome extension Path A + proxy Path B, quality warning
- ✅ `archivolt-analyze.md` — optimize-md, ER export, chunk review
- ✅ `archivolt-advisor.md` — entry points, 4 questions, signal table, decision matrix, report template
- ✅ `install-skill` CLI command — claude/cursor/codex formats, tests

**Placeholder scan:** No TBD/TODO in any task. All code blocks are complete.

**Type consistency:** `InstallSkillArgs.format` is `'claude' | 'cursor' | 'codex'` throughout. `parseInstallSkillArgs` and `runInstallSkillCommand` both use the same type.
