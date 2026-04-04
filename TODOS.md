# Archivolt TODOs

## Optimization Report Generator

### TODO-1: Corpus-based DDL fixtures for DdlSchemaParser tests
**What:** Add 5-10 fixture files under `test/fixtures/ddl/` with real-world MySQL dump
output (mysqldump format), not handcrafted minimal cases.
**Why:** Regex DDL parsing will silently fail on real schema dumps with charset/collation
options, AUTO_INCREMENT, backtick identifiers, and multi-line formatting. Handcrafted
test fixtures won't exercise these cases until a customer hits them.
**Where to start:** `test/fixtures/ddl/` — use actual mysqldump output from a toy Laravel
or Rails project as the first fixture.
**Depends on:** DdlSchemaParser v1 shipping

### TODO-2: LlmOptimizationService — Layer 3, deferred to v2
**What:** `TopNSlowQueryExtractor`, `LlmOptimizationService`, `@anthropic-ai/sdk`, `--llm`
and `--top-n` CLI flags.
**Why:** LLM tier needs reliable signal input. Layer 1 + 2 findings must be validated
against real sessions before adding LLM amplification. Cut from v1 per Codex
cross-model review (2026-04-04).
**Where to start:** After Layer 1 + 2 produce validated findings. Use Haiku 4.5 as
the model; re-read the design doc prompt template.
**Blocked by:** Layer 1 + 2 shipping and producing trusted findings

### TODO-3: ExplainAnalyzer concurrency configurability
**What:** `--explain-concurrency <n>` flag in `AnalyzeArgs`, default 5.
**Why:** batch-5 is arbitrary. Remote DBs over VPN need lower concurrency; local fast
DBs can handle higher. 5 lines of change, config-driven.
**Where to start:** `src/CLI/AnalyzeCommand.ts` AnalyzeArgs + `ExplainAnalyzer.ts`

### TODO-4: Wire ReadWriteRatioAnalyzer into AnalyzeCommand (`--format optimize-md`)
**What:** Add `'optimize-md'` as a valid `--format` value in `AnalyzeArgs`. When selected,
call `analyzeReadWriteRatio(queries)` and render suggestions as a Markdown report.
**Why:** `ReadWriteRatioAnalyzer` (Layer 1) is fully implemented and tested but not yet
exposed via CLI. The `--format optimize-md` surface is the planned entry point for the
full optimization report pipeline.
**Where to start:** `src/CLI/AnalyzeCommand.ts` — extend `format` union type and add a
render branch that calls `analyzeReadWriteRatio` + writes Markdown output.
**Depends on:** Nothing — Layer 1 is already complete.
