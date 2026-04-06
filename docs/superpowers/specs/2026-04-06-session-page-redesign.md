# Session Page Redesign — Terminal Dashboard

**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** `web/src/components/Session/SessionHeader.tsx`, `web/src/components/Session/ReportContent.tsx`, `web/src/pages/SessionPage.tsx`

---

## Problem

The session page shows too little information:
- `SessionHeader` only displays session ID, status, start time, and total query count
- In the `idle` state (pre-analysis), there is nothing useful to read beyond those four fields
- After analysis, `readWriteReport.suggestions` is silently dropped — never rendered
- The read/write ratio table is a plain number table with no visual affordance
- `stats.byOperation` (SELECT/INSERT/UPDATE/DELETE breakdown) is available in `SessionSummary` but never shown anywhere

The user opening a session page may want to know: "Is this session worth analyzing?", "What's the query pattern of this legacy system?", or "Are there performance findings I need to act on?" — all three questions are currently underserved.

---

## Design Decision: Terminal Dashboard (Option C)

Preserve the existing monospace terminal aesthetic while maximising information density. No API changes required — all new data comes from fields already present in `SessionSummary`.

---

## Architecture

### 1. SessionHeader Redesign

**File:** `web/src/components/Session/SessionHeader.tsx`

**Layout:** Two-column grid
- **Left column:** session ID, status indicator (dot + label), time range (`startedAt → endedAt`)
- **Right column:** 2×2 stats grid

**Stats grid cells:**
| Label | Value | Source |
|-------|-------|--------|
| QUERIES | `stats.totalQueries` | `SessionSummary.stats.totalQueries` |
| DURATION | `endedAt - startedAt` formatted as `Xm` or `Xh Ym` | `SessionSummary.endedAt` (optional — omit cell if absent) |
| QPS AVG | `totalQueries / durationSecs` rounded to 2 dp | Derived |
| HTTP | `httpChunkCount` + `c` suffix | `SessionSummary.httpChunkCount` |

**Conditional logic:**
- If `status === 'recording'` and `endedAt` is absent: show elapsed time live (seconds since `startedAt`) in place of DURATION; hide QPS AVG
- If `status === 'stopped'` and `endedAt` is absent: omit DURATION and QPS AVG cells, show 2×1 grid

**New sub-section: Op Distribution** (always visible below the two-column block)

Renders `stats.byOperation` as horizontal bar rows. Each row: label (SELECT / INSERT / UPDATE / DELETE) + proportional fill bar + count and percentage.

Color mapping (reuse existing design tokens):
- SELECT → `#388bfd` (primary/blue)
- INSERT → `#3fb950` (success/green)
- UPDATE → `#f0883e` (warning/orange)
- DELETE → `#f85149` (error/red)

Percentage = `count / totalQueries * 100`. Bar width = percentage as CSS `flex` value.

Unknown operation types (e.g. `CALL`, `SET`) are grouped as `OTHER` in a neutral gray.

**Props change:** Add `endedAt?: number`, `httpChunkCount: number`, `byOperation: Record<string, number>` to `SessionHeader` props. `SessionPage` already has all these from `SessionSummary`.

---

### 2. Findings Severity Bar

**File:** `web/src/components/Session/ReportContent.tsx`

A new bar rendered at the top of `ReportContent`, visible only when at least one finding category has results.

**Layout:** One-line summary
```
[colored proportion bar]
■ N+1  3   ■ Index gaps  2   ■ Full scans  1   ■ Fragmented  5
```

The proportion bar is a flex row of colored segments, widths proportional to finding counts. Colors match existing section headings in `ReportContent`:
- N+1 → `red-400` / `#f85149`
- Index gaps → `orange-400` / `#f0883e`
- Full scans → `red-400` / `#f85149`
- Fragmented → `yellow-400` / `d29922`

If all findings are zero (no issues found), the bar is omitted entirely.

---

### 3. Read/Write Table — Visual Bar Column

**File:** `web/src/components/Session/ReportContent.tsx`

Replace the plain `readRatio` percentage text with a two-color mini bar + percentage label below it.

- Green segment = read ratio (`readRatio * 100%` flex width)
- Orange segment = write ratio (`(1 - readRatio) * 100%` flex width)
- Label below bar: `{Math.round(readRatio * 100)}% R`

Column header renamed from `讀佔比` to `Ratio`.

---

### 4. Suggestions Section

**File:** `web/src/components/Session/ReportContent.tsx`

`readWriteReport.suggestions` is currently ignored. Render it as a new section below the read/write table, using `FindingCard` with `severity="muted"` (or a new `"blue"` variant).

Each suggestion card shows:
- Title: `{suggestion.table} — {suggestion.type}`
- Body: `suggestion.reason`
- SQL block: `suggestion.sql` (copy-ready, same style as existing FindingCard SQL)

Add a `blue` severity variant to `FindingCard` (border/bg/text in blue tones, parallel to existing red/orange/yellow). Use `severity="blue"` for suggestions — they are informational, not critical findings.

Only render this section if `suggestions.length > 0`.

---

## Data Flow

```
SessionSummary (existing API)
  └─ stats.byOperation       → Op Distribution bars  (no analysis needed)
  └─ stats.totalQueries      → QUERIES stat cell
  └─ endedAt, startedAt      → DURATION + QPS stat cells
  └─ httpChunkCount          → HTTP stat cell

OptimizationReportJson (existing API, post-analysis)
  └─ n1Findings              → N+1 section + severity bar
  └─ indexGapFindings        → Index gaps section + severity bar
  └─ fullScanFindings        → Full scans section + severity bar
  └─ fragmentationFindings   → Fragmented section + severity bar
  └─ readWriteReport.tables  → Read/write table (visual bar)
  └─ readWriteReport.suggestions → NEW Suggestions section
```

No API changes. No new backend endpoints. No new state in `SessionPage`.

---

## Error Handling

- `endedAt` absent: DURATION and QPS cells simply omit — grid collapses to 2×1
- `byOperation` empty or all zeros: Op Distribution section hidden
- `suggestions` empty: Suggestions section hidden
- `readWriteReport.tables` empty: existing "沒有發現效能問題" message unchanged

---

## Files to Change

| File | Change |
|------|--------|
| `web/src/components/Session/SessionHeader.tsx` | Redesign to two-column layout with stats grid + Op Distribution bars |
| `web/src/pages/SessionPage.tsx` | Pass new props (`endedAt`, `httpChunkCount`, `byOperation`) to `SessionHeader` |
| `web/src/components/Session/ReportContent.tsx` | Add Severity Bar, add visual bar to read/write table, add Suggestions section |
| `web/src/components/Report/FindingCard.tsx` | Add `blue` severity variant for informational suggestions |

No new files needed.

---

## Out of Scope

- Live QPS polling during recording (would require SSE changes)
- "Top tables by query frequency" (requires new backend aggregation)
- Sparkline charts for query rate over time (requires time-series data not currently captured)
