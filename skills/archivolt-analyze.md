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

```bash
archivolt analyze --format optimize-md --ddl schema.sql > optimize-report.md
```

This runs the full Layer 1 + Layer 2 pipeline:
- **Layer 1:** ReadWriteRatioAnalyzer, N1QueryDetector, QueryFragmentationDetector
- **Layer 2a:** IndexCoverageGapAnalyzer (using `schema.sql`)
- **Layer 2b:** ExplainAnalyzer (requires live DB connection)

**Expected output:** `optimize-report.md` written. Verify:

```bash
head -20 optimize-report.md
```

Should show a Markdown report with section headings like `## Read/Write Ratio`.

**If Layer 2b fails** (no live DB): Run without EXPLAIN:

```bash
archivolt analyze --format optimize-md --ddl schema.sql --no-explain > optimize-report.md
```

## Step 2 — Export ER relationships

```bash
archivolt export er
```

**Expected output:** ER export file created. Note the file path printed to stdout.

## Step 3 — Review query chunks (recommended)

Open the web UI to review semantic chunk labels:

```bash
bun run dev:all
```

Navigate to **Timeline Panel** in the web UI (`http://localhost:5173`). Review the query chunks — each chunk should correspond to a user action (if Chrome extension was used during recording). Verify the chunk labels match the workflows you performed.

This step is optional but improves the accuracy of `archivolt-advisor`'s Use Case identification.

---

## Output artifacts

- `optimize-report.md` — Layer 1+2 findings (read/write ratio, N+1, index gaps, EXPLAIN analysis)
- ER export file — Table relationships including confirmed VFKs

## Next step

Run `/archivolt-advisor` to receive architecture recommendations based on these reports.
