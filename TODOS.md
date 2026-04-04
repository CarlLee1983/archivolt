# Archivolt TODOs

## Optimization Report Generator

### TODO-1: ✅ DONE — Corpus-based DDL fixtures for DdlSchemaParser tests
**Completed in:** feat/optimization-report branch
**Delivered:** 5 fixture files in `test/fixtures/ddl/` (laravel_ecommerce, rails_blog, mysql_charset_collation, composite_indexes, wordpress_core) + 5 corpus tests in DdlSchemaParser.test.ts

### TODO-2: LlmOptimizationService — Layer 3, deferred to v2
**What:** `TopNSlowQueryExtractor`, `LlmOptimizationService`, `@anthropic-ai/sdk`, `--llm`
and `--top-n` CLI flags.
**Why:** LLM tier needs reliable signal input. Layer 1 + 2 findings must be validated
against real sessions before adding LLM amplification. Cut from v1 per Codex
cross-model review (2026-04-04).
**Where to start:** Layer 1 + 2 are now complete and validated. Use Haiku 4.5 as
the model; re-read the design doc prompt template.
**Blocked by:** ~~Layer 1 + 2 shipping~~ — unblocked. Ready when LLM analysis is prioritized.

### TODO-3: ✅ DONE — ExplainAnalyzer concurrency configurability
**Completed in:** feat/optimization-report branch
**Delivered:** `--explain-concurrency <n>` flag in `AnalyzeArgs`, default 5. Passed to `runExplainAnalysis()`.

### TODO-4: ✅ DONE — Wire ReadWriteRatioAnalyzer into AnalyzeCommand (`--format optimize-md`)
**Completed in:** feat/optimization-report branch
**Delivered:** Full `--format optimize-md` pipeline: Layer 1 (ReadWriteRatio + N+1 + Fragmentation), Layer 2a (--ddl), Layer 2b (--explain-db), all wired in AnalyzeCommand.
