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

> **Language rule:** Detect the user's language from the conversation. Ask all quoted questions and confirmations in that language.

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

```markdown
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
```

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
