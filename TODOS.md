# Archivolt TODOs

## Pending Tasks

### TODO-1: LlmOptimizationService — Layer 3
**What:** `TopNSlowQueryExtractor`, `LlmOptimizationService`, `@anthropic-ai/sdk`, `--llm` and `--top-n` CLI flags.
**Why:** LLM tier needs reliable signal input. Layer 1 + 2 findings must be validated against real sessions before adding LLM amplification.
**Current Status:** Layer 1 + 2 are now complete and validated. Ready for implementation.
**Where to start:** Use Haiku 4.5 as the model; re-read the design doc prompt template.

### TODO-2: Advanced VFK Inference Engine
**What:** Enhance `RelationInferrer` to use data-profile analysis (e.g., checking if values in column A exist in column B) instead of just name-based matching.
**Status:** Backlog.

---

## Completed Tasks

### Optimization Report Generator (Layer 1 & 2)
- **✅ DONE — Corpus-based DDL fixtures for DdlSchemaParser tests**: 5 fixture files in `test/fixtures/ddl/` + 5 corpus tests.
- **✅ DONE — ExplainAnalyzer concurrency configurability**: `--explain-concurrency <n>` flag in `AnalyzeArgs`, default 5.
- **✅ DONE — Wire ReadWriteRatioAnalyzer into AnalyzeCommand (`--format optimize-md`)**: Full Layer 1 (ReadWriteRatio + N+1 + Fragmentation) + Layer 2 (DDL & Explain) pipeline.

### VFK Review UX
- **✅ DONE — Review Dashboard**: Added `ReviewPage` with Pending/Confirmed/Ignored tabs.
- **✅ DONE — Navigation Badges**: Real-time pending count in sidebar/navbar.
- **✅ DONE — API Correlation**: Integrated `restoreVirtualFK` and error handling.
