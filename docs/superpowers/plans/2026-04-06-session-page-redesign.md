# Session Page Terminal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Session page to display richer pre-analysis data (op distribution, duration, QPS) and more visual post-analysis results (severity bar, read/write mini bars, suggestions).

**Architecture:** Four targeted file changes, no API or backend changes. All new data comes from fields already present in `SessionSummary`. Frontend-only: TypeScript type checks (`cd web && bun run build`) serve as the verification gate since the web package has no unit test setup.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (inline CSS custom properties), Vite

---

## File Map

| File | Change |
|------|--------|
| `web/src/components/Report/FindingCard.tsx` | Add `blue` severity variant |
| `web/src/components/Session/SessionHeader.tsx` | Redesign: stats grid + Op Distribution bars, new props |
| `web/src/pages/SessionPage.tsx` | Pass `endedAt`, `httpChunkCount`, `byOperation` to `SessionHeader` |
| `web/src/components/Session/ReportContent.tsx` | Add Severity Bar, visual read/write bar, Suggestions section |

---

## Task 1: Add `blue` severity to `FindingCard`

**Files:**
- Modify: `web/src/components/Report/FindingCard.tsx`

- [ ] **Step 1: Add `blue` to the severity union and style map**

Open `web/src/components/Report/FindingCard.tsx`. Replace the existing interface and style map:

```tsx
interface Props {
  severity: 'red' | 'orange' | 'yellow' | 'blue'
  title: string
  subtitle?: string
  sql?: string
  extraSql?: string
  extraSqlLabel?: string
}

const severityStyles: Record<Props['severity'], string> = {
  red: 'border-red-500/20 bg-red-500/5 text-red-300 hover:border-red-500/30',
  orange: 'border-orange-500/20 bg-orange-500/5 text-orange-300 hover:border-orange-500/30',
  yellow: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300 hover:border-yellow-500/30',
  blue: 'border-blue-500/20 bg-blue-500/5 text-blue-300 hover:border-blue-500/30',
}
```

Everything else in the file stays identical.

- [ ] **Step 2: Type-check**

```bash
cd web && bun run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Report/FindingCard.tsx
git commit -m "feat: [web] add blue severity variant to FindingCard"
```

---

## Task 2: Redesign `SessionHeader`

**Files:**
- Modify: `web/src/components/Session/SessionHeader.tsx`

The new header has two parts:
1. A two-column top block: left = identity (status dot + ID + time range), right = 2×2 stats grid
2. An Op Distribution block below: horizontal bar rows for each SQL operation type

- [ ] **Step 1: Replace the entire file**

```tsx
interface Props {
  sessionId: string
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopped'
  totalQueries: number
  httpChunkCount: number
  byOperation: Record<string, number>
}

function formatTimeRange(startedAt: number, endedAt?: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString('zh-TW', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  if (endedAt) return `${fmt(startedAt)} → ${fmt(endedAt).slice(-5)}`
  return fmt(startedAt)
}

function formatDuration(startedAt: number, endedAt: number): string {
  const secs = Math.floor((endedAt - startedAt) / 1000)
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

const OP_COLORS: Record<string, string> = {
  SELECT: 'bg-primary',
  INSERT: 'bg-success',
  UPDATE: 'bg-warning',
  DELETE: 'bg-error',
}

const OP_TEXT_COLORS: Record<string, string> = {
  SELECT: 'text-primary',
  INSERT: 'text-success',
  UPDATE: 'text-warning',
  DELETE: 'text-error',
}

export function SessionHeader({
  sessionId,
  startedAt,
  endedAt,
  status,
  totalQueries,
  httpChunkCount,
  byOperation,
}: Props) {
  const duration = endedAt ? formatDuration(startedAt, endedAt) : null
  const qps =
    endedAt && endedAt > startedAt
      ? (totalQueries / ((endedAt - startedAt) / 1000)).toFixed(2)
      : null

  // Normalise operation keys to uppercase; group unknowns as OTHER
  const known = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  const opEntries: { op: string; count: number }[] = []
  let otherCount = 0
  for (const [op, count] of Object.entries(byOperation)) {
    if (known.includes(op.toUpperCase())) {
      opEntries.push({ op: op.toUpperCase(), count })
    } else {
      otherCount += count
    }
  }
  // Sort by known order
  opEntries.sort((a, b) => known.indexOf(a.op) - known.indexOf(b.op))
  if (otherCount > 0) opEntries.push({ op: 'OTHER', count: otherCount })

  const hasOps = opEntries.length > 0 && totalQueries > 0

  return (
    <div className="border border-border rounded-xl p-4 space-y-4">
      {/* Top: identity + stats grid */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === 'recording'
                  ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(87,171,90,0.4)]'
                  : 'bg-slate-600'
              }`}
            />
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">
              {status === 'recording' ? 'Recording' : 'Stopped'}
            </span>
          </div>
          <h1 className="font-mono text-sm font-black text-text break-all">{sessionId}</h1>
          <p className="text-[10px] text-text-muted font-mono">
            {formatTimeRange(startedAt, endedAt)}
          </p>
        </div>

        {/* Right: stats grid — 2×2 when endedAt present, 1×2 otherwise */}
        <div className={`grid gap-1.5 flex-shrink-0 ${duration ? 'grid-cols-2' : 'grid-cols-2'}`}>
          <StatCell label="QUERIES" value={totalQueries.toLocaleString()} color="text-warning" />
          <StatCell label="HTTP" value={`${httpChunkCount}c`} />
          {duration && <StatCell label="DURATION" value={duration} />}
          {qps && <StatCell label="QPS AVG" value={qps} />}
        </div>
      </div>

      {/* Op Distribution */}
      {hasOps && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
            Op Distribution
          </p>
          {opEntries.map(({ op, count }) => {
            const pct = Math.round((count / totalQueries) * 100)
            const barColor = OP_COLORS[op] ?? 'bg-slate-600'
            const textColor = OP_TEXT_COLORS[op] ?? 'text-muted'
            return (
              <div key={op} className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted w-11 text-right uppercase">
                  {op}
                </span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`font-mono text-[9px] font-black w-14 ${textColor}`}>
                  {count.toLocaleString()} · {pct}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCell({
  label,
  value,
  color = 'text-text',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-panel border border-border rounded px-2.5 py-1.5 min-w-[60px]">
      <p className="text-[8px] font-mono text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`font-mono font-black text-base leading-tight ${color}`}>{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && bun run build 2>&1 | tail -20
```

Expected: build succeeds. If TypeScript errors appear, they will point to `SessionPage.tsx` (which still passes the old props) — that is expected and will be fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Session/SessionHeader.tsx
git commit -m "feat: [web] redesign SessionHeader with stats grid and op distribution bars"
```

---

## Task 3: Update `SessionPage` to pass new props

**Files:**
- Modify: `web/src/pages/SessionPage.tsx:162-167`

The `<SessionHeader>` call currently passes four props. Replace it with seven.

- [ ] **Step 1: Update the SessionHeader call**

Find this block in `SessionPage.tsx` (around line 162):

```tsx
<SessionHeader
  sessionId={session.id}
  startedAt={session.startedAt}
  status={session.status}
  totalQueries={session.stats.totalQueries}
/>
```

Replace with:

```tsx
<SessionHeader
  sessionId={session.id}
  startedAt={session.startedAt}
  endedAt={session.endedAt}
  status={session.status}
  totalQueries={session.stats.totalQueries}
  httpChunkCount={session.httpChunkCount}
  byOperation={session.stats.byOperation}
/>
```

No other changes to `SessionPage.tsx`.

- [ ] **Step 2: Type-check**

```bash
cd web && bun run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/SessionPage.tsx
git commit -m "feat: [web] pass endedAt, httpChunkCount, byOperation to SessionHeader"
```

---

## Task 4: Add Severity Bar to `ReportContent`

**Files:**
- Modify: `web/src/components/Session/ReportContent.tsx`

Add a `<SeverityBar>` component at the top of `ReportContent`, rendered only when at least one finding exists.

- [ ] **Step 1: Add `SeverityBar` helper and insert it into `ReportContent`**

Add the following `SeverityBar` component **before** the `ReportContent` export (after the imports):

```tsx
interface SeverityCount {
  n1: number
  indexGap: number
  fullScan: number
  fragmented: number
}

function SeverityBar({ counts }: { counts: SeverityCount }) {
  const total = counts.n1 + counts.indexGap + counts.fullScan + counts.fragmented
  if (total === 0) return null

  return (
    <div className="border border-border rounded-xl p-4 space-y-2">
      <p className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
        Analysis Results
      </p>
      {/* proportion bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
        {counts.n1 > 0 && (
          <div className="bg-red-500" style={{ flex: counts.n1 }} />
        )}
        {counts.indexGap > 0 && (
          <div className="bg-orange-400" style={{ flex: counts.indexGap }} />
        )}
        {counts.fullScan > 0 && (
          <div className="bg-yellow-400" style={{ flex: counts.fullScan }} />
        )}
        {counts.fragmented > 0 && (
          <div className="bg-slate-600" style={{ flex: counts.fragmented }} />
        )}
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
        {counts.n1 > 0 && (
          <span>
            <span className="text-red-400">■</span>{' '}
            <span className="text-text-muted">N+1</span>{' '}
            <strong className="text-red-400">{counts.n1}</strong>
          </span>
        )}
        {counts.indexGap > 0 && (
          <span>
            <span className="text-orange-400">■</span>{' '}
            <span className="text-text-muted">Index gaps</span>{' '}
            <strong className="text-orange-400">{counts.indexGap}</strong>
          </span>
        )}
        {counts.fullScan > 0 && (
          <span>
            <span className="text-yellow-400">■</span>{' '}
            <span className="text-text-muted">Full scans</span>{' '}
            <strong className="text-yellow-400">{counts.fullScan}</strong>
          </span>
        )}
        {counts.fragmented > 0 && (
          <span>
            <span className="text-slate-500">■</span>{' '}
            <span className="text-text-muted">Fragmented</span>{' '}
            <strong className="text-muted">{counts.fragmented}</strong>
          </span>
        )}
      </div>
    </div>
  )
}
```

Then inside `ReportContent`, compute the counts and render the bar at the very top of the returned JSX, before the existing sections:

```tsx
export function ReportContent({ report }: Props) {
  const hasFindings =
    (report.n1Findings?.length ?? 0) > 0 ||
    (report.indexGapFindings?.length ?? 0) > 0 ||
    (report.fragmentationFindings?.length ?? 0) > 0 ||
    (report.fullScanFindings?.length ?? 0) > 0

  const severityCounts: SeverityCount = {
    n1: report.n1Findings?.length ?? 0,
    indexGap: report.indexGapFindings?.length ?? 0,
    fullScan: report.fullScanFindings?.length ?? 0,
    fragmented: report.fragmentationFindings?.length ?? 0,
  }

  return (
    <div className="space-y-8">
      <SeverityBar counts={severityCounts} />

      {/* ... rest of existing sections unchanged ... */}
```

Keep all existing `<section>` blocks below the `<SeverityBar />` exactly as they are.

- [ ] **Step 2: Type-check**

```bash
cd web && bun run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Session/ReportContent.tsx
git commit -m "feat: [web] add findings severity bar to ReportContent"
```

---

## Task 5: Visual read/write bar + Suggestions section

**Files:**
- Modify: `web/src/components/Session/ReportContent.tsx`

Two additions to the existing read/write section: replace the `readRatio` percentage text cell with a mini dual-color bar, and add a Suggestions section that renders `readWriteReport.suggestions`.

- [ ] **Step 1: Replace the read/write table section**

Find the read/write `<section>` block in `ReportContent.tsx` (starts with `{report.readWriteReport && report.readWriteReport.tables.length > 0 && (`). Replace only this section:

```tsx
{report.readWriteReport && report.readWriteReport.tables.length > 0 && (
  <section>
    <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">
      讀寫比分析
    </h2>
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-[10px] text-muted uppercase">
            <th className="px-4 py-2 text-left font-semibold">資料表</th>
            <th className="px-4 py-2 text-right font-semibold">讀</th>
            <th className="px-4 py-2 text-right font-semibold">寫</th>
            <th className="px-4 py-2 text-left font-semibold w-24">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {report.readWriteReport.tables.map((t, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="px-4 py-2 font-mono">{t.table}</td>
              <td className="px-4 py-2 text-right text-emerald-400">{t.reads}</td>
              <td className="px-4 py-2 text-right text-amber-400">{t.writes}</td>
              <td className="px-4 py-2">
                <div className="flex h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${Math.round(t.readRatio * 100)}%` }}
                  />
                  <div
                    className="bg-amber-500 flex-1"
                  />
                </div>
                <p className="text-[9px] text-muted mt-0.5 font-mono">
                  {Math.round(t.readRatio * 100)}% R
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)}
```

- [ ] **Step 2: Add Suggestions section after the read/write table section**

After the read/write `</section>` closing tag, add:

```tsx
{report.readWriteReport?.suggestions && report.readWriteReport.suggestions.length > 0 && (
  <section>
    <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">
      Suggestions ({report.readWriteReport.suggestions.length})
    </h2>
    <div className="space-y-2">
      {report.readWriteReport.suggestions.map((s, i) => (
        <FindingCard
          key={i}
          severity="blue"
          title={`${s.table} — ${s.type}`}
          subtitle={s.reason}
          sql={s.sql}
        />
      ))}
    </div>
  </section>
)}
```

Make sure `FindingCard` is imported at the top of `ReportContent.tsx`. It should already be there:

```tsx
import { FindingCard } from '@/components/Report/FindingCard'
```

- [ ] **Step 3: Type-check**

```bash
cd web && bun run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Session/ReportContent.tsx
git commit -m "feat: [web] add visual read/write bar and suggestions section to ReportContent"
```

---

## Task 6: Visual Verification

- [ ] **Step 1: Start the dev server**

```bash
bun run dev:all
```

Open `http://localhost:5173` in a browser.

- [ ] **Step 2: Verify idle state**

Click any session in the session list. While in `idle` state (no analysis run yet), confirm:
- Header shows 2×2 stats grid (QUERIES, DURATION or HTTP, QPS or fallback)
- Op Distribution bars appear with correct colors (SELECT=blue, INSERT=green, UPDATE=orange, DELETE=red)
- No regressions in the Analyze buttons below

- [ ] **Step 3: Verify done state**

Run an optimization analysis on a session. After analysis completes, confirm:
- Severity Bar appears at the top of results (only if at least one finding exists)
- Read/write table shows dual-color mini bars in the Ratio column
- Suggestions section appears if `readWriteReport.suggestions` is non-empty

- [ ] **Step 4: Final type-check + build**

```bash
cd web && bun run build
```

Expected: zero errors, successful build output.
