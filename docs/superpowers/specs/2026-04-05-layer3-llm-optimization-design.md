# Layer 3 LLM Optimization Service — Design Spec

**Date:** 2026-04-05  
**Status:** Approved  
**Model:** claude-haiku-4-5-20251001  

---

## Overview

Add a Layer 3 LLM analysis tier to the existing `--format optimize-md` pipeline. After Layer 1 (pattern analysis) and Layer 2 (DDL + EXPLAIN), select the Top-N highest-impact query findings and send each to Claude Haiku for actionable, context-aware recommendations.

---

## Architecture

### New Files (4)

```
src/Modules/Recording/Application/Strategies/
  TopNSlowQueryExtractor.ts          — pure function, categorized ranking of findings

src/Modules/Recording/Application/Services/
  LlmOptimizationService.ts          — per-finding Haiku calls, streaming output via callback

src/Modules/Recording/Infrastructure/Renderers/
  LlmSuggestionsRenderer.ts          — renders LlmSuggestion[] as Markdown section
```

### Modified Files (3)

```
src/Modules/Recording/Infrastructure/Renderers/
  OptimizationReportRenderer.ts      — add renderLlmSection() for integrated mode

src/CLI/AnalyzeCommand.ts            — add --llm / --top-n / --llm-separate flags
                                       wire Layer 3, handle partial writes on interrupt

OptimizationReportData (existing type location)
                                     — add llmSuggestions?: readonly LlmSuggestion[]
```

---

## New Types

```typescript
interface LlmSuggestion {
  readonly findingType: 'full-scan' | 'n1' | 'fragmentation'
  readonly queryHash: string
  readonly exampleSql: string
  readonly aiRecommendation: string
}

interface TopNEntry {
  readonly findingType: 'full-scan' | 'n1' | 'fragmentation'
  readonly queryHash: string
  readonly exampleSql: string
  readonly context: string   // problem description + existing suggestion for LLM
}
```

---

## TopNSlowQueryExtractor

### Function Signature

```typescript
function extractTopN(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  fullScanFindings: readonly FullScanFinding[],
  topN: number
): readonly TopNEntry[]
```

### Categorized Ranking Logic

Each category receives `Math.ceil(topN / 3)` slots. Unused slots from smaller categories flow to the next (full-scan priority).

| Priority | Category | Sort Key |
|----------|----------|----------|
| 1 | Full Scans (Layer 2b) | `estimatedRows` descending |
| 2 | N+1 Queries (Layer 1) | `occurrences` descending |
| 3 | Fragmentation (Layer 1) | `callsPerRequest` descending |

---

## LlmOptimizationService

### Interface

```typescript
interface LlmOptimizationOptions {
  readonly topNEntries: readonly TopNEntry[]
  readonly readWriteReport: ReadWriteReport
  readonly ddlSchema?: ParsedSchema
  readonly onResult: (suggestion: LlmSuggestion) => void
  readonly signal?: AbortSignal
}

async function runLlmOptimization(options: LlmOptimizationOptions): Promise<readonly LlmSuggestion[]>
```

### Per-Finding Call Flow

```
for each TopNEntry:
  1. Check signal.aborted → stop loop if interrupted
  2. Build prompt (see below)
  3. Call Anthropic SDK: claude-haiku-4-5-20251001, max_tokens 512
  4. Invoke onResult(suggestion) → AnalyzeCommand writes partial result immediately
  5. Continue to next entry
```

### Prompt Template

```
You are a MySQL performance expert. Given the following query issue,
provide a concise, actionable recommendation (max 200 words).

## Query
{exampleSql}

## Issue
{context}

## Schema Context
{relevant CREATE TABLE statements — only tables referenced in exampleSql}

## Read/Write Profile
{readWriteReport summary: tables with high read ratio (cache candidates),
 tables with high write ratio (index candidates)}

Respond with: 1) root cause, 2) recommended fix with example SQL if applicable.
```

### Interrupt Behavior

- Ctrl+C triggers `AbortSignal` via `AbortController` + `process.on('SIGINT')`
- Completed suggestions are written to output immediately (not lost)
- Report includes `⚠ Interrupted after N/M findings` notice when partial

### API Key

`ANTHROPIC_API_KEY` environment variable. If missing when `--llm` is used, fail early with:
```
Error: ANTHROPIC_API_KEY is not set. Export it before using --llm.
  export ANTHROPIC_API_KEY=sk-ant-...
```

---

## CLI Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--llm` | boolean | false | Enable Layer 3 LLM analysis |
| `--top-n <n>` | number | 5 | Number of findings to send to LLM |
| `--llm-separate` | boolean | false | Write LLM output to separate `.llm.md` file |

### AnalyzeCommand Integration Point

After Layer 2 completes, if `args.llm`:

```
1. extractTopN(n1Findings, fragmentationFindings, fullScanFindings, args.topN)
2. Create AbortController, attach SIGINT listener
3. runLlmOptimization({ ..., onResult: writePartialResult })
4. Route output: --llm-separate → {sessionId}-optimize.llm.md
                  default      → append to existing optimize.md
5. Add 'llm' to enabledLayers in OptimizationReportData
```

---

## Output Modes

### Integrated (default)

Appended to existing `optimize-md` report:

```markdown
## AI Recommendations (Layer 3 — claude-haiku-4-5)

### [Full Scan] SELECT * FROM orders WHERE status = 'pending'
> Add a composite index on (status, created_at). The current full scan
> reads ~42,000 rows. A covering index will reduce this to an index range scan.
> ```sql
> CREATE INDEX idx_orders_status_created ON orders (status, created_at);
> ```

### [N+1] SELECT * FROM products WHERE id = ?
> Batch this query using WHERE id IN (...). In your ORM, use eager loading
> for the products relationship.
```

### Separate (`--llm-separate`)

Written to `{sessionId}-optimize.llm.md`. Same format, standalone file.

---

## Testing

- `TopNSlowQueryExtractor`: pure function — unit test all slot-distribution edge cases (empty categories, topN not divisible by 3, fewer findings than N)
- `LlmOptimizationService`: mock Anthropic SDK — test AbortSignal handling, partial result delivery, missing API key error
- `LlmSuggestionsRenderer`: snapshot test rendered Markdown output
- Integration: mock LLM in AnalyzeCommand tests, verify `enabledLayers` includes `'llm'`
