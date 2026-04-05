# Log Input Sources Design

**Date:** 2026-04-05  
**Status:** Approved

## Problem

Archivolt currently only analyzes data captured via its own TCP/HTTP proxy. In practice, log data often needs to be collected on a remote or production host and brought to local for analysis — the tool needs to accept pre-existing log files as input.

## Goal

Define a canonical query event format and a `--from` CLI flag so Archivolt can analyze MySQL general logs, slow query logs, or any canonical JSONL file using the existing analysis pipeline unchanged.

## Non-Goals

- Web UI file upload (log files can be large; CLI is the right tool)
- Real-time remote streaming
- Building a remote collector agent (any tool that produces the canonical format works)

## Canonical Query Event Schema

All parsers output this format. External tools targeting Archivolt should produce JSONL where each line is one `QueryEvent`:

```typescript
interface QueryEvent {
  timestamp: number      // Unix ms, required
  sql: string            // raw SQL, required
  connectionId?: string  // used for flow grouping (general log provides this)
  durationMs?: number    // execution time in ms (slow log provides this)
  rowsExamined?: number  // rows scanned (slow log provides this)
  database?: string      // target database
}
```

**Example canonical JSONL:**
```
{"timestamp":1712300000000,"sql":"SELECT * FROM users WHERE id=1","connectionId":"42"}
{"timestamp":1712300000010,"sql":"SELECT * FROM orders WHERE user_id=1","connectionId":"42"}
```

**Flow grouping strategy (no HTTP data available):**
- If `connectionId` present → group by connection (one connection ≈ one request/job)
- If absent → 500ms time window (same as existing correlation logic)

## Parsers

New adapter layer under `src/Modules/Recording/Infrastructure/Parsers/`:

```
IQueryLogParser.ts          // interface: stream-based, emits QueryEvent per line
MysqlGeneralLogParser.ts    // parses MySQL general log
MysqlSlowQueryLogParser.ts  // parses MySQL slow query log
CanonicalJsonlParser.ts     // reads canonical JSONL directly (pass-through)
```

**Large file handling (critical):** Parsers must use streaming line-by-line reads (`readline` / `Bun.file().stream()`), never loading the full file into memory. Each parsed `QueryEvent` is written to the output JSONL incrementally via `RecordingRepository`'s existing `WriteStream` pattern. This keeps memory usage O(1) regardless of file size.

## CLI Syntax

New `--from` flag selects the parser. All existing flags remain valid.

```bash
# MySQL general log
archivolt analyze --from general-log /path/to/mysql-general.log

# MySQL slow query log (durationMs available → better analysis quality)
archivolt analyze --from slow-log /path/to/slow.log

# Canonical JSONL (any external tool output)
archivolt analyze --from canonical /path/to/queries.jsonl

# Combine with existing output flags
archivolt analyze --from slow-log /path/to/slow.log --format optimize-md
archivolt analyze --from slow-log /path/to/slow.log --format optimize-md --top-n 10
```

**Without `--from`:** existing behavior (requires `--session <id>`).

## Data Flow

```
log file
    └─ IQueryLogParser.parse()
           └─ QueryEvent[]
                  └─ write to data/recordings/ (virtual session)
                         └─ AnalyzeCommand (unchanged)
                                └─ OptimizationReportRenderer
```

## What Changes

| Component | Change |
|-----------|--------|
| `src/Modules/Recording/Infrastructure/Parsers/` | New directory with 3 parsers + interface |
| `src/CLI/RecordCommand.ts` (or `AnalyzeCommand`) | Add `--from` flag dispatch |
| `data/recordings/` | Virtual sessions created by import (tagged `source: imported`) |
| Everything else | Unchanged |
