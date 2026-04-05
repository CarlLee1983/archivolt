# Archivolt Skills Design

**Date:** 2026-04-05  
**Status:** Approved  
**Purpose:** Define a family of Claude Code skills that guide developers through reverse-engineering a legacy database and recommending a target architecture for refactoring/migration.

---

## Context

Archivolt is a reverse-engineering tool for legacy projects. Developers who inherit or need to refactor old systems typically:
1. Don't fully understand the existing DB schema and relationships
2. Don't know which queries represent core business logic
3. Need help deciding what architecture fits their refactored system

The skill family bridges the gap between raw Archivolt CLI output and actionable architectural decisions.

---

## Skill Family: `archivolt-*`

Four skills with distinct responsibilities and independent trigger points.

### Usage Flow

```
archivolt-schema  →  archivolt-record  →  archivolt-analyze  →  archivolt-advisor
  (one-time)           (repeatable)         (post-recording)       (decision point)
```

Each skill is independently invocable. `archivolt-advisor` can also accept manually pasted reports.

---

## Skill 1: `archivolt-schema`

**Purpose:** Environment setup, DDL collection, VFK review  
**Trigger phrases:** "分析我的舊資料庫 schema"、"設定 Archivolt"、"review VFK"、"set up archivolt"

### Steps

1. **Doctor check**
   ```bash
   archivolt doctor
   ```
   Verify CLI version, DB connectivity, required dependencies.

2. **DB connection setup**  
   Guide user to configure connection string. Confirm `archivolt doctor` passes.

3. **DDL collection**
   ```bash
   archivolt analyze --ddl schema.sql
   ```
   Export full schema DDL to `schema.sql`.

4. **VFK review**  
   Open the Archivolt web UI (`bun run dev:all`). Guide user through the Review page:
   - Confirm auto-detected Virtual Foreign Keys (Pending → Confirmed)
   - Ignore false positives (Pending → Ignored)
   - Add manual VFKs if needed

5. **Confirmation gate**  
   Agent asks: "VFK 審查完成了嗎？Pending 數量是否歸零或剩餘都是你決定忽略的？"  
   Only proceeds when user confirms.

### Output Artifacts
- `schema.sql` — DDL snapshot
- `archivolt.json` — Updated with confirmed/ignored VFKs

---

## Skill 2: `archivolt-record`

**Purpose:** Capture query behavior via Chrome extension (primary) or DB proxy (fallback)  
**Trigger phrases:** "幫我側錄操作行為"、"開始錄製"、"capture queries"、"record session"

### Path A: Chrome Extension (Primary — ★★★★★)

Provides full UI semantic context: navigate/submit/click events become operation markers that annotate query chunks.

1. **Build extension**
   ```bash
   cd extension && bun run build
   ```
   Agent executes this automatically.

2. **Install in Chrome** (manual — `chrome://extensions` is protected)
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click "Load unpacked" → select `extension/dist/`

3. **Start recording**
   - Click extension popup → select target tab → click Start
   - Also start DB proxy: `archivolt proxy start`

4. **Operate the app**  
   User performs representative workflows (login, create, search, checkout, etc.).  
   Chrome extension auto-sends UI markers to proxy.

5. **Stop recording**
   - Click extension popup → Stop
   - `archivolt proxy stop`

⚠️ **If user skips Chrome extension:** Proceed with Path B and inform:
> "Without the Chrome extension, query chunks will lack UI source and interaction context. This reduces the accuracy of business-flow detection and architecture recommendations."

### Path B: DB Proxy Only (Fallback — ★★★)

```bash
archivolt proxy start
# user operates app
archivolt proxy stop
```

No UI markers. Query chunking uses 500ms silence-based splitting only.

### Output Artifacts
- Recording session in Archivolt data directory
- `markers.jsonl` (Path A only)

---

## Skill 3: `archivolt-analyze`

**Purpose:** Run analysis pipeline on recorded session, produce optimization report and ER export  
**Trigger phrases:** "分析側錄結果"、"產生報告"、"run analysis"、"generate optimization report"

### Steps

1. **Optimization report**
   ```bash
   archivolt analyze \
     --format optimize-md \
     --ddl schema.sql \
     > optimize-report.md
   ```
   Runs: ReadWriteRatioAnalyzer, N1QueryDetector, QueryFragmentationDetector,  
   IndexCoverageGapAnalyzer, ExplainAnalyzer.

2. **ER export**
   ```bash
   archivolt export er
   ```

3. **Review chunks** (optional but recommended)  
   Open web UI → Timeline Panel → review query chunks with semantic labels.

### Output Artifacts
- `optimize-report.md` — Layer 1+2 optimization findings
- ER export file

---

## Skill 4: `archivolt-advisor`

**Purpose:** Read all collected artifacts, ask key questions, produce architecture recommendation  
**Trigger phrases:** "幫我規劃重構架構"、"這個舊系統要用什麼架構"、"我有個 legacy 系統要遷移"、"recommend architecture"、"help me migrate this old codebase"

### Entry Points

- **Full flow:** User ran all three prior skills → artifacts exist locally
- **Manual:** User pastes `optimize-report.md` content directly into chat

### Supplementary Questions (3–4, one at a time)

1. **Team size** — Solo / Small (<10) / Medium (10+)
2. **Codebase state** — Greenfield / Incremental migration of legacy / Partial refactor
3. **Business domain count** — Single domain / Multi-domain shared DB / Clearly separable subsystems
4. **Traffic scale expectation** — Low / Medium / High

### Auto-Signal Interpretation

| Signal from Archivolt | Architectural Implication |
|----------------------|---------------------------|
| Read/write ratio > 8:1 | Suggest CQRS with separate read model |
| High N+1 density | Avoid Active Record; recommend Repository pattern |
| Table count > 50 + VFK clusters | Identify DDD Bounded Context boundaries |
| Query chunk semantic markers | Identify core Use Cases → Application Services |
| Heavy cross-domain JOINs | Warn about data consistency risk in microservices split |
| Low query diversity + simple schema | Slim MVC is sufficient; avoid over-engineering |

### Architecture Options Considered

| Architecture | When to recommend |
|-------------|-------------------|
| Slim MVC (e.g., Laravel / Rails conventions) | Single domain, small team, low complexity |
| Hexagonal / Clean Architecture | Multi-domain, testability required, medium team |
| DDD + DCI | Complex domain logic, distinct bounded contexts, medium-large team |
| Modular Monolith | Multiple domains but not ready for distributed systems |
| Microservices | High traffic, independent scaling needs, large team — only if data boundaries are clean |

### Output Report Structure

```markdown
## Recommended Architecture: [Name]

### Why — Based on Archivolt Findings
[Specific signals from optimize-report.md and ER that drove this decision]

### Architecture Comparison
[Table: options considered, pros/cons, why this one wins]

### Bounded Context Map (if DDD)
[Suggested context boundaries based on VFK clusters and query chunks]

### First Action Checklist
- [ ] Specific, executable next steps

### Data Quality Note (if applicable)
> To improve recommendation accuracy, consider: [what's missing]
```

---

## Distribution

### Local Development
Skills live in `.claude/plugins/archivolt/skills/`:
```
archivolt-schema.md
archivolt-record.md
archivolt-analyze.md
archivolt-advisor.md
```

### Bundled with Archivolt
npm package includes `skills/` directory. Install command:
```bash
archivolt install-skill           # copies skills to ~/.claude/plugins/
archivolt install-skill --cursor  # outputs Cursor rules format
archivolt install-skill --codex   # outputs system prompt format
```

### Cross-Platform
Same Markdown content adapts to:
- **Claude Code:** `.claude/plugins/archivolt/skills/*.md`
- **Cursor:** Paste into `.cursor/rules/archivolt.mdc`
- **Codex / ChatGPT:** Prepend as system prompt

---

## Out of Scope

- LLM Layer 3 (`LlmOptimizationService`) — separate TODO in TODOS.md
- Advanced VFK Inference Engine — separate backlog item
- Automated Chrome extension installation (browser security restriction)
