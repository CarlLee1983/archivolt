# Archivolt TODOs

## Pending Tasks

### TODO-2: Advanced VFK Inference Engine
**What:** Enhance `RelationInferrer` to use data-profile analysis (e.g., checking if values in column A exist in column B) instead of just name-based matching.
**Status:** Backlog.

---

## Completed Tasks

### Layer 3 LLM Optimization (v0.7.0)
- **✅ DONE — TopNSlowQueryExtractor**: Categorized ranking (full-scan → N+1 → fragmentation) with proportional slot distribution.
- **✅ DONE — LlmOptimizationService**: Per-finding `claude-haiku-4-5-20251001` calls with AbortSignal support, prompt context includes DDL schema + read/write profile.
- **✅ DONE — `--llm` / `--top-n` / `--llm-separate` CLI flags**: Integrated into `--format optimize-md` pipeline with SIGINT-safe partial output.

### Optimization Report Generator (Layer 1 & 2)
- **✅ DONE — Corpus-based DDL fixtures for DdlSchemaParser tests**: 5 fixture files in `test/fixtures/ddl/` + 5 corpus tests.
- **✅ DONE — ExplainAnalyzer concurrency configurability**: `--explain-concurrency <n>` flag in `AnalyzeArgs`, default 5.
- **✅ DONE — Wire ReadWriteRatioAnalyzer into AnalyzeCommand (`--format optimize-md`)**: Full Layer 1 (ReadWriteRatio + N+1 + Fragmentation) + Layer 2 (DDL & Explain) pipeline.

### VFK Review UX
- **✅ DONE — Review Dashboard**: Added `ReviewPage` with Pending/Confirmed/Ignored tabs.
- **✅ DONE — Navigation Badges**: Real-time pending count in sidebar/navbar.
- **✅ DONE — API Correlation**: Integrated `restoreVirtualFK` and error handling.
