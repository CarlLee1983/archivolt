# Layer 3 LLM Optimization Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Layer 3 LLM analysis tier to `archivolt analyze --format optimize-md` that picks the top-N highest-impact query findings and gets Claude Haiku recommendations for each one.

**Architecture:** `TopNSlowQueryExtractor` ranks findings into three categories (full-scan → N+1 → fragmentation) and distributes N slots proportionally. `LlmOptimizationService` calls `claude-haiku-4-5-20251001` once per finding with a structured prompt, invoking a callback after each result so output is streamed live. A new `LlmSuggestionsRenderer` produces the Markdown section, which is either appended to the existing report or written to a separate `.llm.md` file.

**Tech Stack:** Bun runtime, TypeScript, `@anthropic-ai/sdk` (Anthropic Messages API), Vitest-compatible test runner (`bun test`), existing `OptimizationReportData` pipeline.

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts` |
| Create | `src/Modules/Recording/Application/Services/LlmOptimizationService.ts` |
| Create | `src/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer.ts` |
| Modify | `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts` |
| Modify | `src/CLI/AnalyzeCommand.ts` |
| Create | `test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts` |
| Create | `test/unit/Recording/Application/LlmOptimizationService.test.ts` |
| Create | `test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts` |

---

## Task 1: Install SDK + Shared Types

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Create: `src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts` (types only)
- Modify: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts` (extend types)
- Modify: `src/CLI/AnalyzeCommand.ts` (extend `AnalyzeArgs`)

- [ ] **Step 1: Install @anthropic-ai/sdk**

```bash
bun add @anthropic-ai/sdk
```

Expected output: `bun add v1.x ... + @anthropic-ai/sdk`

- [ ] **Step 2: Create TopNSlowQueryExtractor.ts with shared types**

Create `src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts`:

```typescript
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

export type FindingType = 'full-scan' | 'n1' | 'fragmentation'

export interface LlmSuggestion {
  readonly findingType: FindingType
  readonly queryHash: string
  readonly exampleSql: string
  readonly aiRecommendation: string
}

export interface TopNEntry {
  readonly findingType: FindingType
  readonly queryHash: string
  readonly exampleSql: string
  readonly context: string
}

export function extractTopN(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  fullScanFindings: readonly FullScanFinding[],
  topN: number,
): readonly TopNEntry[] {
  const slotSize = Math.ceil(topN / 3)

  const fullScanEntries: TopNEntry[] = [...fullScanFindings]
    .sort((a, b) => b.estimatedRows - a.estimatedRows)
    .slice(0, slotSize)
    .map(f => ({
      findingType: 'full-scan',
      queryHash: f.queryHash,
      exampleSql: f.sql,
      context: `Full table scan on \`${f.table}\` (~${f.estimatedRows.toLocaleString()} rows estimated). Suggested index: ${f.suggestedIndex}`,
    }))

  const n1Entries: TopNEntry[] = [...n1Findings]
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, slotSize)
    .map(f => ({
      findingType: 'n1',
      queryHash: f.repeatedQueryHash,
      exampleSql: f.exampleSql,
      context: `N+1 query on \`${f.affectedTable}\` repeated ${f.occurrences} times per API call to ${f.apiPath}. Suggested fix: ${f.suggestion}. Batch SQL: ${f.batchSql}`,
    }))

  const fragmentationEntries: TopNEntry[] = [...fragmentationFindings]
    .sort((a, b) => b.callsPerRequest - a.callsPerRequest)
    .slice(0, slotSize)
    .map(f => ({
      findingType: 'fragmentation',
      queryHash: '',
      exampleSql: f.exampleSql,
      context: `Query fragmentation on ${f.apiPath}: ${f.callsPerRequest} calls/request. Pattern: ${f.queryPattern}. Strategy: ${f.suggestion}`,
    }))

  // Fill unused slots from smaller categories (full-scan priority)
  const combined = [...fullScanEntries, ...n1Entries, ...fragmentationEntries]

  // If we have fewer than topN, that's fine — return all of them
  // If more than topN (because ceil rounds up), trim to topN
  return combined.slice(0, topN)
}
```

- [ ] **Step 3: Add LlmSuggestion + EnabledLayer to OptimizationReportRenderer.ts**

In `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`, make these changes:

Add import at top (after existing imports):
```typescript
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
```

Change `EnabledLayer` type (line 7):
```typescript
export type EnabledLayer = 'pattern' | 'ddl' | 'explain' | 'llm'
```

Add `llmSuggestions` field to `OptimizationReportData` interface (after `explainWarning?`):
```typescript
  readonly llmSuggestions?: readonly LlmSuggestion[]
  readonly llmInterrupted?: boolean
  readonly llmTotal?: number
```

- [ ] **Step 4: Add --top-n and --llm-separate to AnalyzeArgs**

In `src/CLI/AnalyzeCommand.ts`, update `AnalyzeArgs` interface (the `llm` field already exists at line 31):
```typescript
export interface AnalyzeArgs {
  readonly sessionId?: string
  readonly fromFormat?: ImportFormat
  readonly fromPath?: string
  readonly output?: string
  readonly format: 'md' | 'json' | 'optimize-md'
  readonly stdout: boolean
  readonly ddlPath?: string
  readonly explainDbUrl?: string
  readonly llm: boolean
  readonly topN: number
  readonly llmSeparate: boolean
  readonly minRows: number
  readonly explainConcurrency: number
}
```

In `parseAnalyzeArgs`, after the existing `llm` line (line 89):
```typescript
  const topNIdx = rest.indexOf('--top-n')
  const topN = topNIdx !== -1 ? Number(rest[topNIdx + 1]) : 5

  const llmSeparate = rest.includes('--llm-separate')
```

Update the return statement:
```typescript
  return { sessionId, fromFormat, fromPath, output, format, stdout, ddlPath, explainDbUrl, llm, topN, llmSeparate, minRows, explainConcurrency }
```

- [ ] **Step 5: Verify types compile**

```bash
bun run typecheck
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts \
        src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts \
        src/CLI/AnalyzeCommand.ts \
        package.json bun.lockb
git commit -m "feat: [layer3] add shared types, install @anthropic-ai/sdk, extend CLI args"
```

---

## Task 2: TopNSlowQueryExtractor — Tests + Implementation

**Files:**
- Modify: `src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts`
- Create: `test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractTopN } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { N1Finding } from '@/Modules/Recording/Application/Strategies/N1QueryDetector'
import type { FragmentationFinding } from '@/Modules/Recording/Application/Strategies/QueryFragmentationDetector'
import type { FullScanFinding } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

const makeFullScan = (table: string, estimatedRows: number): FullScanFinding => ({
  sql: `SELECT * FROM ${table}`,
  queryHash: `hash_${table}`,
  table,
  estimatedRows,
  suggestedIndex: `CREATE INDEX idx_${table} ON ${table} (id)`,
})

const makeN1 = (path: string, occurrences: number): N1Finding => ({
  apiPath: path,
  repeatedQueryHash: `hash_n1_${path}`,
  occurrences,
  exampleSql: `SELECT * FROM products WHERE id = ?`,
  affectedTable: 'products',
  suggestion: 'Use IN query',
  batchSql: `SELECT * FROM products WHERE id IN (?)`,
})

const makeFragmentation = (path: string, callsPerRequest: number): FragmentationFinding => ({
  apiPath: path,
  queryPattern: 'SELECT * FROM orders',
  callsPerRequest,
  suggestion: 'batch',
  exampleSql: 'SELECT * FROM orders WHERE user_id = ?',
})

describe('extractTopN', () => {
  it('returns empty array when all findings are empty', () => {
    expect(extractTopN([], [], [], 5)).toEqual([])
  })

  it('returns all findings when fewer than topN total', () => {
    const result = extractTopN(
      [makeN1('/api/products', 3)],
      [],
      [makeFullScan('orders', 10000)],
      5,
    )
    expect(result).toHaveLength(2)
  })

  it('prioritizes full-scan findings first', () => {
    const result = extractTopN(
      [makeN1('/api/a', 5)],
      [makeFragmentation('/api/b', 4)],
      [makeFullScan('orders', 50000)],
      3,
    )
    expect(result[0].findingType).toBe('full-scan')
  })

  it('sorts full-scans by estimatedRows descending', () => {
    const result = extractTopN(
      [],
      [],
      [makeFullScan('small', 100), makeFullScan('large', 99999)],
      2,
    )
    expect(result[0].exampleSql).toContain('large')
    expect(result[1].exampleSql).toContain('small')
  })

  it('sorts N+1 findings by occurrences descending', () => {
    const result = extractTopN(
      [makeN1('/api/low', 2), makeN1('/api/high', 100)],
      [],
      [],
      2,
    )
    expect(result[0].context).toContain('100 times')
    expect(result[1].context).toContain('2 times')
  })

  it('sorts fragmentation by callsPerRequest descending', () => {
    const result = extractTopN(
      [],
      [makeFragmentation('/api/low', 3), makeFragmentation('/api/high', 20)],
      [],
      2,
    )
    expect(result[0].context).toContain('20 calls')
    expect(result[1].context).toContain('3 calls')
  })

  it('distributes slots: ceil(topN/3) per category', () => {
    // topN=5 → ceil(5/3)=2 per category
    const result = extractTopN(
      [makeN1('/a', 5), makeN1('/b', 3), makeN1('/c', 1)],
      [makeFragmentation('/d', 10), makeFragmentation('/e', 8), makeFragmentation('/f', 2)],
      [makeFullScan('t1', 9000), makeFullScan('t2', 5000), makeFullScan('t3', 1000)],
      5,
    )
    expect(result).toHaveLength(5)
    const types = result.map(r => r.findingType)
    expect(types.filter(t => t === 'full-scan').length).toBeLessThanOrEqual(2)
    expect(types.filter(t => t === 'n1').length).toBeLessThanOrEqual(2)
    expect(types.filter(t => t === 'fragmentation').length).toBeLessThanOrEqual(2)
  })

  it('fills unused slots from smaller categories (full-scan priority)', () => {
    // Only full-scan findings exist, topN=5 → should return all 5 full-scans
    const scans = Array.from({ length: 5 }, (_, i) => makeFullScan(`t${i}`, 1000 * (5 - i)))
    const result = extractTopN([], [], scans, 5)
    expect(result).toHaveLength(5)
    expect(result.every(r => r.findingType === 'full-scan')).toBe(true)
  })

  it('includes context string for full-scan entries', () => {
    const result = extractTopN([], [], [makeFullScan('orders', 42000)], 1)
    expect(result[0].context).toContain('orders')
    expect(result[0].context).toContain('42,000')
  })

  it('includes context string for N+1 entries', () => {
    const result = extractTopN([makeN1('/api/products', 7)], [], [], 1)
    expect(result[0].context).toContain('7 times')
    expect(result[0].context).toContain('/api/products')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts
```

Expected: some tests FAIL (the slot-filling logic needs to handle the overflow correctly).

- [ ] **Step 3: Fix slot-filling logic in TopNSlowQueryExtractor.ts**

The current `extractTopN` does `.slice(0, slotSize)` per category and then `.slice(0, topN)`. This doesn't redistribute unused slots. Update the function body:

```typescript
export function extractTopN(
  n1Findings: readonly N1Finding[],
  fragmentationFindings: readonly FragmentationFinding[],
  fullScanFindings: readonly FullScanFinding[],
  topN: number,
): readonly TopNEntry[] {
  const slotSize = Math.ceil(topN / 3)

  const sortedFullScans = [...fullScanFindings].sort((a, b) => b.estimatedRows - a.estimatedRows)
  const sortedN1 = [...n1Findings].sort((a, b) => b.occurrences - a.occurrences)
  const sortedFragmentation = [...fragmentationFindings].sort((a, b) => b.callsPerRequest - a.callsPerRequest)

  // Allocate slots: each category gets up to slotSize, unused slots flow forward
  const fsCount = Math.min(slotSize, sortedFullScans.length)
  const n1Count = Math.min(slotSize + (slotSize - fsCount), sortedN1.length)
  const fragCount = Math.min(slotSize + (slotSize - fsCount) + (slotSize - n1Count), sortedFragmentation.length)

  const fullScanEntries: TopNEntry[] = sortedFullScans.slice(0, fsCount).map(f => ({
    findingType: 'full-scan' as const,
    queryHash: f.queryHash,
    exampleSql: f.sql,
    context: `Full table scan on \`${f.table}\` (~${f.estimatedRows.toLocaleString()} rows estimated). Suggested index: ${f.suggestedIndex}`,
  }))

  const n1Entries: TopNEntry[] = sortedN1.slice(0, n1Count).map(f => ({
    findingType: 'n1' as const,
    queryHash: f.repeatedQueryHash,
    exampleSql: f.exampleSql,
    context: `N+1 query on \`${f.affectedTable}\` repeated ${f.occurrences} times per API call to ${f.apiPath}. Suggested fix: ${f.suggestion}. Batch SQL: ${f.batchSql}`,
  }))

  const fragmentationEntries: TopNEntry[] = sortedFragmentation.slice(0, fragCount).map(f => ({
    findingType: 'fragmentation' as const,
    queryHash: '',
    exampleSql: f.exampleSql,
    context: `Query fragmentation on ${f.apiPath}: ${f.callsPerRequest} calls/request. Pattern: ${f.queryPattern}. Strategy: ${f.suggestion}`,
  }))

  return [...fullScanEntries, ...n1Entries, ...fragmentationEntries].slice(0, topN)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bun test test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor.ts \
        test/unit/Recording/Application/TopNSlowQueryExtractor.test.ts
git commit -m "feat: [layer3] TopNSlowQueryExtractor — categorized slot-filling, full test coverage"
```

---

## Task 3: LlmOptimizationService — Tests + Implementation

**Files:**
- Create: `src/Modules/Recording/Application/Services/LlmOptimizationService.ts`
- Create: `test/unit/Recording/Application/LlmOptimizationService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/Recording/Application/LlmOptimizationService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TopNEntry } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'

// Mock @anthropic-ai/sdk before importing the service
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Use an index on the status column.' }],
      }),
    }
  },
}))

const makeEntry = (type: TopNEntry['findingType'], sql: string): TopNEntry => ({
  findingType: type,
  queryHash: `hash_${sql}`,
  exampleSql: sql,
  context: `Issue with ${sql}`,
})

const emptyReport: ReadWriteReport = { tables: [], suggestions: [] }

describe('runLlmOptimization', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  })

  it('throws if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    await expect(runLlmOptimization({
      topNEntries: [makeEntry('n1', 'SELECT 1')],
      readWriteReport: emptyReport,
      onResult: () => {},
    })).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('returns one suggestion per entry', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const entries = [makeEntry('full-scan', 'SELECT * FROM orders'), makeEntry('n1', 'SELECT * FROM products WHERE id = ?')]
    const results = await runLlmOptimization({ topNEntries: entries, readWriteReport: emptyReport, onResult: () => {} })
    expect(results).toHaveLength(2)
  })

  it('calls onResult callback after each entry', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const calls: string[] = []
    const entries = [makeEntry('full-scan', 'SELECT * FROM a'), makeEntry('n1', 'SELECT * FROM b')]
    await runLlmOptimization({
      topNEntries: entries,
      readWriteReport: emptyReport,
      onResult: s => calls.push(s.findingType),
    })
    expect(calls).toEqual(['full-scan', 'n1'])
  })

  it('stops early when AbortSignal is aborted', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const controller = new AbortController()
    const entries = [
      makeEntry('full-scan', 'SELECT * FROM a'),
      makeEntry('n1', 'SELECT * FROM b'),
      makeEntry('fragmentation', 'SELECT * FROM c'),
    ]
    const calls: string[] = []
    // Abort after first result
    const wrappedOnResult = (s: Parameters<typeof runLlmOptimization>[0]['onResult'] extends (s: infer S) => void ? S : never) => {
      calls.push(s.findingType)
      controller.abort()
    }
    const results = await runLlmOptimization({
      topNEntries: entries,
      readWriteReport: emptyReport,
      onResult: wrappedOnResult,
      signal: controller.signal,
    })
    expect(results).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('maps findingType and exampleSql into suggestion', async () => {
    const { runLlmOptimization } = await import('@/Modules/Recording/Application/Services/LlmOptimizationService')
    const results = await runLlmOptimization({
      topNEntries: [makeEntry('full-scan', 'SELECT * FROM orders')],
      readWriteReport: emptyReport,
      onResult: () => {},
    })
    expect(results[0].findingType).toBe('full-scan')
    expect(results[0].exampleSql).toBe('SELECT * FROM orders')
    expect(results[0].aiRecommendation).toBe('Use an index on the status column.')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test test/unit/Recording/Application/LlmOptimizationService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement LlmOptimizationService.ts**

Create `src/Modules/Recording/Application/Services/LlmOptimizationService.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { TopNEntry, LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { ReadWriteReport } from '@/Modules/Recording/Application/Strategies/ReadWriteRatioAnalyzer'
import type { ParsedSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

export interface LlmOptimizationOptions {
  readonly topNEntries: readonly TopNEntry[]
  readonly readWriteReport: ReadWriteReport
  readonly ddlSchema?: ParsedSchema
  readonly onResult: (suggestion: LlmSuggestion) => void
  readonly signal?: AbortSignal
}

function buildReadWriteSummary(report: ReadWriteReport): string {
  if (report.tables.length === 0) return 'No read/write data available.'
  const lines = report.tables
    .slice(0, 10)
    .map(t => `- \`${t.table}\`: ${Math.round(t.readRatio * 100)}% reads, ${t.reads + t.writes} total queries`)
  const suggestions = report.suggestions.map(s => `- \`${s.table}\`: ${s.type} recommended (${s.reason})`).join('\n')
  return lines.join('\n') + (suggestions ? '\n\nCache/replica candidates:\n' + suggestions : '')
}

function buildSchemaContext(sql: string, schema?: ParsedSchema): string {
  if (!schema) return ''
  const tableMatches = sql.match(/\bFROM\s+`?(\w+)`?|\bJOIN\s+`?(\w+)`?/gi) ?? []
  const tableNames = new Set(
    tableMatches.map(m => m.replace(/^(FROM|JOIN)\s+`?/i, '').replace(/`$/, '').toLowerCase())
  )
  const relevantTables = schema.tables.filter(t => tableNames.has(t.name.toLowerCase()))
  if (relevantTables.length === 0) return ''
  return relevantTables.map(t => t.raw).join('\n\n')
}

function buildPrompt(entry: TopNEntry, report: ReadWriteReport, schema?: ParsedSchema): string {
  const schemaSection = buildSchemaContext(entry.exampleSql, schema)
  return [
    'You are a MySQL performance expert. Given the following query issue,',
    'provide a concise, actionable recommendation (max 200 words).',
    '',
    '## Query',
    entry.exampleSql,
    '',
    '## Issue',
    entry.context,
    ...(schemaSection ? ['', '## Schema Context', schemaSection] : []),
    '',
    '## Read/Write Profile',
    buildReadWriteSummary(report),
    '',
    'Respond with: 1) root cause, 2) recommended fix with example SQL if applicable.',
  ].join('\n')
}

export async function runLlmOptimization(options: LlmOptimizationOptions): Promise<readonly LlmSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Export it before using --llm.\n  export ANTHROPIC_API_KEY=sk-ant-...'
    )
  }

  const client = new Anthropic({ apiKey })
  const results: LlmSuggestion[] = []

  for (const entry of options.topNEntries) {
    if (options.signal?.aborted) break

    const prompt = buildPrompt(entry, options.readWriteReport, options.ddlSchema)
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const suggestion: LlmSuggestion = {
      findingType: entry.findingType,
      queryHash: entry.queryHash,
      exampleSql: entry.exampleSql,
      aiRecommendation: text,
    }

    results.push(suggestion)
    options.onResult(suggestion)
  }

  return results
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bun test test/unit/Recording/Application/LlmOptimizationService.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Application/Services/LlmOptimizationService.ts \
        test/unit/Recording/Application/LlmOptimizationService.test.ts
git commit -m "feat: [layer3] LlmOptimizationService — per-finding Haiku calls with AbortSignal support"
```

---

## Task 4: LlmSuggestionsRenderer — Tests + Implementation

**Files:**
- Create: `src/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer.ts`
- Create: `test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderLlmSection } from '@/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer'
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'

const makeSuggestion = (type: LlmSuggestion['findingType'], sql: string, rec: string): LlmSuggestion => ({
  findingType: type,
  queryHash: 'abc123',
  exampleSql: sql,
  aiRecommendation: rec,
})

describe('renderLlmSection', () => {
  it('renders section header', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Use batch')], false, 1)
    expect(result).toContain('## AI Recommendations')
    expect(result).toContain('claude-haiku-4-5')
  })

  it('renders each suggestion with findingType label', () => {
    const result = renderLlmSection([
      makeSuggestion('full-scan', 'SELECT * FROM orders', 'Add index on status'),
    ], false, 1)
    expect(result).toContain('[Full Scan]')
    expect(result).toContain('SELECT * FROM orders')
    expect(result).toContain('Add index on status')
  })

  it('uses correct label for n1 type', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch it')], false, 1)
    expect(result).toContain('[N+1]')
  })

  it('uses correct label for fragmentation type', () => {
    const result = renderLlmSection([makeSuggestion('fragmentation', 'SELECT 1', 'Use cache')], false, 1)
    expect(result).toContain('[Fragmentation]')
  })

  it('shows interrupted notice when interrupted is true', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch')], true, 3)
    expect(result).toContain('Interrupted after 1/3')
  })

  it('does not show interrupted notice when not interrupted', () => {
    const result = renderLlmSection([makeSuggestion('n1', 'SELECT 1', 'Batch')], false, 1)
    expect(result).not.toContain('Interrupted')
  })

  it('returns empty string for empty suggestions', () => {
    expect(renderLlmSection([], false, 0)).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement LlmSuggestionsRenderer.ts**

Create `src/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer.ts`:

```typescript
import type { LlmSuggestion, FindingType } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'

const FINDING_LABEL: Record<FindingType, string> = {
  'full-scan': 'Full Scan',
  'n1': 'N+1',
  'fragmentation': 'Fragmentation',
}

export function renderLlmSection(
  suggestions: readonly LlmSuggestion[],
  interrupted: boolean,
  totalRequested: number,
): string {
  if (suggestions.length === 0) return ''

  const lines: string[] = [
    '## AI Recommendations (Layer 3 — claude-haiku-4-5)',
    '',
  ]

  if (interrupted) {
    lines.push(`> ⚠ Interrupted after ${suggestions.length}/${totalRequested} findings`)
    lines.push('')
  }

  for (const s of suggestions) {
    const label = FINDING_LABEL[s.findingType]
    lines.push(`### [${label}] ${s.exampleSql}`)
    lines.push('')
    // Indent each line of the recommendation as a blockquote
    for (const line of s.aiRecommendation.split('\n')) {
      lines.push(`> ${line}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bun test test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer.ts \
        test/unit/Recording/Infrastructure/LlmSuggestionsRenderer.test.ts
git commit -m "feat: [layer3] LlmSuggestionsRenderer — Markdown section with interrupted notice"
```

---

## Task 5: Wire Layer 3 into AnalyzeCommand + OptimizationReportRenderer

**Files:**
- Modify: `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`
- Modify: `src/CLI/AnalyzeCommand.ts`
- Modify: `test/unit/Recording/CLI/AnalyzeCommand.test.ts`

- [ ] **Step 1: Write failing tests for new CLI flags**

Add to `test/unit/Recording/CLI/AnalyzeCommand.test.ts` (append at end of file):

```typescript
describe('parseAnalyzeArgs — llm flags', () => {
  it('defaults llm to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.llm).toBe(false)
  })

  it('parses --llm flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--llm'])
    expect(args.llm).toBe(true)
  })

  it('defaults topN to 5', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.topN).toBe(5)
  })

  it('parses --top-n value', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--top-n', '10'])
    expect(args.topN).toBe(10)
  })

  it('defaults llmSeparate to false', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123'])
    expect(args.llmSeparate).toBe(false)
  })

  it('parses --llm-separate flag', () => {
    const args = parseAnalyzeArgs(['analyze', 'rec_123', '--llm-separate'])
    expect(args.llmSeparate).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
bun test test/unit/Recording/CLI/AnalyzeCommand.test.ts
```

Expected: new `parseAnalyzeArgs — llm flags` tests FAIL (topN and llmSeparate not yet in return value).

- [ ] **Step 3: Add renderOptimizationReport LLM section to OptimizationReportRenderer.ts**

In `src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts`, add the import at top:

```typescript
import { renderLlmSection } from '@/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer'
```

In the `renderOptimizationReport` function, before `sections.push(renderFooter(...))`, add:

```typescript
  if (data.llmSuggestions && data.llmSuggestions.length > 0) {
    sections.push(renderLlmSection(
      data.llmSuggestions,
      data.llmInterrupted ?? false,
      data.llmTotal ?? data.llmSuggestions.length,
    ))
  }
```

- [ ] **Step 4: Wire Layer 3 into runAnalyzeCommand**

In `src/CLI/AnalyzeCommand.ts`, add imports at top (after existing imports):

```typescript
import { extractTopN } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import type { LlmSuggestion } from '@/Modules/Recording/Application/Strategies/TopNSlowQueryExtractor'
import { runLlmOptimization } from '@/Modules/Recording/Application/Services/LlmOptimizationService'
import { renderLlmSection } from '@/Modules/Recording/Infrastructure/Renderers/LlmSuggestionsRenderer'
```

In `runAnalyzeCommand`, after the `reportData` object is built (after line 205) and before `renderOptimizationReport(reportData)`, add:

```typescript
    // Layer 3: LLM analysis
    let llmSuggestions: readonly LlmSuggestion[] | undefined
    let llmInterrupted = false

    if (args.llm) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('Error: ANTHROPIC_API_KEY is not set. Export it before using --llm.\n  export ANTHROPIC_API_KEY=sk-ant-...')
        process.exit(1)
      }

      enabledLayers.push('llm')
      const topNEntries = extractTopN(
        [...n1Findings],
        [...fragmentationFindings],
        fullScanFindings ? [...fullScanFindings] : [],
        args.topN,
      )

      const controller = new AbortController()
      const sigintHandler = () => {
        console.log('\n⚠ Interrupted — saving partial results...')
        controller.abort()
      }
      process.once('SIGINT', sigintHandler)

      const collected: LlmSuggestion[] = []
      console.log(`Running Layer 3 LLM analysis (${topNEntries.length} findings)...`)

      try {
        await runLlmOptimization({
          topNEntries,
          readWriteReport,
          ddlSchema: args.ddlPath ? parseDdlSchema(await readFile(args.ddlPath, 'utf-8')) : undefined,
          onResult: (s) => {
            collected.push(s)
            console.log(`  [${collected.length}/${topNEntries.length}] ${s.findingType}: done`)
          },
          signal: controller.signal,
        })
        llmInterrupted = controller.signal.aborted
      } finally {
        process.removeListener('SIGINT', sigintHandler)
      }

      llmSuggestions = collected.length > 0 ? collected : undefined
    }
```

Update the `reportData` object to include LLM fields. Replace the `reportData` declaration with:

```typescript
    const reportData: OptimizationReportData = {
      sessionId: sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers,
      readWriteReport,
      n1Findings: [...n1Findings],
      fragmentationFindings: [...fragmentationFindings],
      indexGapFindings,
      fullScanFindings,
      explainWarning,
      llmSuggestions,
      llmInterrupted: llmInterrupted || undefined,
      llmTotal: args.llm ? extractTopN(
        [...n1Findings],
        [...fragmentationFindings],
        fullScanFindings ? [...fullScanFindings] : [],
        args.topN,
      ).length : undefined,
    }
```

> **Note:** To avoid calling `extractTopN` twice, save the `topNEntries.length` before the LLM block and use it here. Refactor: declare `let topNCount = 0` before the LLM block, set `topNCount = topNEntries.length` inside, then use `topNCount` in `reportData`.

**Corrected approach** — replace the LLM block and `reportData` as a unified block:

```typescript
    // Layer 3: LLM analysis
    let llmSuggestions: readonly LlmSuggestion[] | undefined
    let llmInterrupted = false
    let llmTotal = 0

    if (args.llm) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('Error: ANTHROPIC_API_KEY is not set. Export it before using --llm.\n  export ANTHROPIC_API_KEY=sk-ant-...')
        process.exit(1)
      }

      enabledLayers.push('llm')
      const topNEntries = extractTopN(
        [...n1Findings],
        [...fragmentationFindings],
        fullScanFindings ? [...fullScanFindings] : [],
        args.topN,
      )
      llmTotal = topNEntries.length

      const controller = new AbortController()
      const sigintHandler = () => {
        console.log('\n⚠ Interrupted — saving partial results...')
        controller.abort()
      }
      process.once('SIGINT', sigintHandler)

      const collected: LlmSuggestion[] = []
      console.log(`Running Layer 3 LLM analysis (${topNEntries.length} findings)...`)

      try {
        await runLlmOptimization({
          topNEntries,
          readWriteReport,
          ddlSchema: args.ddlPath ? parseDdlSchema(await readFile(args.ddlPath, 'utf-8')) : undefined,
          onResult: (s) => {
            collected.push(s)
            console.log(`  [${collected.length}/${topNEntries.length}] ${s.findingType}: done`)
          },
          signal: controller.signal,
        })
        llmInterrupted = controller.signal.aborted
      } finally {
        process.removeListener('SIGINT', sigintHandler)
      }

      llmSuggestions = collected.length > 0 ? collected : undefined
    }

    const reportData: OptimizationReportData = {
      sessionId: sessionId,
      generatedAt: new Date().toISOString(),
      enabledLayers,
      readWriteReport,
      n1Findings: [...n1Findings],
      fragmentationFindings: [...fragmentationFindings],
      indexGapFindings,
      fullScanFindings,
      explainWarning,
      llmSuggestions,
      llmInterrupted: llmInterrupted || undefined,
      llmTotal: llmTotal > 0 ? llmTotal : undefined,
    }
```

- [ ] **Step 5: Handle --llm-separate output**

In `runAnalyzeCommand`, find the current output block (around line 207–220):

```typescript
    const md = renderOptimizationReport(reportData)
    ...
    await writeFile(outPath, md, 'utf-8')
```

Replace with:

```typescript
    let md = renderOptimizationReport(reportData)

    if (args.stdout) {
      console.log(md)
      return
    }

    const outPath = args.output ?? path.resolve(process.cwd(), `data/analysis/${sessionId}/optimization-report.md`)
    const dir = path.dirname(outPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    if (args.llm && args.llmSeparate && llmSuggestions && llmSuggestions.length > 0) {
      // Write LLM section to separate file — remove it from the main report
      const reportDataWithoutLlm: OptimizationReportData = { ...reportData, llmSuggestions: undefined, llmInterrupted: undefined, llmTotal: undefined }
      md = renderOptimizationReport(reportDataWithoutLlm)
      const llmOutPath = outPath.replace('.md', '.llm.md')
      const llmMd = renderLlmSection(llmSuggestions, llmInterrupted, llmTotal)
      await writeFile(llmOutPath, llmMd, 'utf-8')
      console.log(`LLM recommendations written to: ${llmOutPath}`)
    }

    await writeFile(outPath, md, 'utf-8')
    const jsonOutPath = outPath.replace('.md', '.json')
    await writeFile(jsonOutPath, renderOptimizationReportJson(reportData), 'utf-8')
    console.log(`Optimization report written to: ${outPath}`)
    return
```

- [ ] **Step 6: Run all tests**

```bash
bun test test/unit/Recording/CLI/AnalyzeCommand.test.ts
```

Expected: all tests PASS including new `llm flags` describe block.

- [ ] **Step 7: Run full test suite**

```bash
bun run test
```

Expected: all tests PASS. Fix any type errors found by `bun run typecheck`.

- [ ] **Step 8: Commit**

```bash
git add src/CLI/AnalyzeCommand.ts \
        src/Modules/Recording/Infrastructure/Renderers/OptimizationReportRenderer.ts \
        test/unit/Recording/CLI/AnalyzeCommand.test.ts
git commit -m "feat: [layer3] wire LLM pipeline into AnalyzeCommand — --llm, --top-n, --llm-separate"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Full typecheck + lint + test**

```bash
bun run check
```

Expected: no errors, no warnings, all tests pass.

- [ ] **Step 2: Manual smoke test (optional, requires API key)**

If `ANTHROPIC_API_KEY` is set in your environment:

```bash
# Create a minimal test fixture first
echo '{"tables":[],"suggestions":[]}' > /tmp/empty-session.json
# Then with a real session:
ANTHROPIC_API_KEY=sk-ant-... bun run src/index.ts analyze <your-session-id> \
  --format optimize-md --llm --top-n 2 --stdout
```

Expected output: the Markdown report ends with an `## AI Recommendations (Layer 3 — claude-haiku-4-5)` section with at least one entry.

- [ ] **Step 3: Test --llm-separate**

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run src/index.ts analyze <your-session-id> \
  --format optimize-md --llm --llm-separate --output /tmp/test-report.md
ls /tmp/test-report.md /tmp/test-report.llm.md
```

Expected: both files exist. `test-report.md` has no `## AI Recommendations` section. `test-report.llm.md` has only the AI section.

- [ ] **Step 4: Commit final**

```bash
git add -p  # review any remaining changes
git commit -m "feat: [layer3] complete Layer 3 LLM optimization pipeline"
```
