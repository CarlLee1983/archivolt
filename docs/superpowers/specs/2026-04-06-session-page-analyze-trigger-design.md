# Design: Session Page with In-Browser Analysis Trigger

**Date:** 2026-04-06
**Status:** Approved

## Overview

Add a `/session/:id` page that serves as a single entry point for every recording session. All session list rows become clickable. The page shows session metadata and, depending on state, either triggers analysis (Manifest or Optimization Report) or displays the resulting report. Analysis is streamed back via SSE so users get live progress feedback — no CLI commands required.

## Goals

- Remove the need to manually run `archivolt analyze` from the terminal
- All session rows are clickable, even those without reports yet
- Live progress feedback during analysis (SSE)
- Phase 1: Manifest + Optimization Report only (DDL/Explain/LLM deferred)

## Routing Changes

| Before | After |
|--------|-------|
| `/report/:id` | `/session/:id` (canonical URL) |
| `/report/:id` | redirect → `/session/:id` |
| Session list rows (with report only) | all rows → `/session/:id` |

## Page State Machine

```
IDLE
  hasManifest=false, hasOptimizationReport=false
  Shows: SessionHeader + AnalyzeActions (two buttons)

ANALYZING
  POST sent, SSE connected
  Shows: SessionHeader + ProgressLog (live SSE append)

DONE_MANIFEST
  SSE event:done received, manifest JSON loaded
  Shows: SessionHeader + ReportContent (manifest view) + ReAnalyzeButton

DONE_OPTIMIZE
  SSE event:done received, optimize JSON loaded
  Shows: SessionHeader + ReportContent (optimize view) + ReAnalyzeButton
```

On page load, `GET /api/recordings/:id` is called. `hasManifest` / `hasOptimizationReport` fields determine the initial state (skip IDLE if a report already exists, render the most complete report available: optimize > manifest).

## Backend API

### POST /api/recordings/:id/analyze

Triggers analysis in the background. Returns immediately.

```
Request body: { type: 'manifest' | 'optimize' }
Response 202: { jobId: sessionId }
Response 409: { error: 'ALREADY_RUNNING' }  — if analysis already in progress
```

Internally:
1. Registers job in `AnalysisJobStore` (in-memory Map, keyed by sessionId)
2. Calls `runAnalysis(sessionId, type, onProgress)` in a detached async block
3. `onProgress` appends log messages to the job's `logs[]` array

### GET /api/recordings/:id/analyze/stream

SSE stream. Client connects after POST 202. Pushes buffered logs first, then live events.

```
event: progress   data: { message: string }
event: done       data: { type: 'manifest' | 'optimize' }
event: error      data: { message: string }
```

Stream closes on `done` or `error`. Pattern matches existing `/api/recording/live` implementation (ReadableStream + TextEncoder).

### AnalysisJobStore

Simple in-memory singleton:

```ts
type AnalysisJob = {
  status: 'running' | 'done' | 'error'
  type: 'manifest' | 'optimize'
  logs: string[]
  error?: string
}
// Map<sessionId, AnalysisJob>
```

Stored on the `RecordingController` instance (no separate DI needed for now).

## AnalysisService

New file: `src/Modules/Recording/Application/Services/AnalysisService.ts`

```ts
export async function runAnalysis(
  sessionId: string,
  type: 'manifest' | 'optimize',
  onProgress: (message: string) => void,
): Promise<void>
```

Internally reuses the same logic as `AnalyzeCommand.ts` (shared helper functions), inserting `onProgress(...)` calls at key steps:

- Session loaded: `"Loaded session — N queries"`
- Chunks built: `"Built M chunks"`
- N+1 detection: `"N+1 detection complete — X found"`
- Fragmentation: `"Fragmentation detection complete — Y found"`
- Read/write: `"Read/write analysis complete"`
- Write: `"Report written"`

`AnalyzeCommand.ts` (CLI path) is unchanged — it continues to use `console.log` directly.

## Frontend

### New files

```
web/src/pages/SessionPage.tsx
web/src/components/Session/SessionHeader.tsx
web/src/components/Session/AnalyzeActions.tsx
web/src/components/Session/ProgressLog.tsx
```

### Modified files

```
web/src/App.tsx (or router file)   — add /session/:id, redirect /report/:id
web/src/api/dashboard.ts           — add runAnalysis(), analyzeStreamUrl()
web/src/components/Dashboard/SessionList.tsx — navigate to /session/:id (already partially done)
web/src/pages/ReportViewer.tsx     — extract ReportContent into shared component
```

### SessionPage logic

```tsx
// On mount: GET /api/recordings/:id → determine initial state
// On "Run" button click:
//   1. POST /api/recordings/:id/analyze { type }
//   2. Open EventSource to /api/recordings/:id/analyze/stream
//   3. On progress: append to logs[]
//   4. On done: close SSE, GET /api/report/:id/optimize (or manifest), render report
//   5. On error: show error message, return to idle
```

### API additions (dashboard.ts)

```ts
runAnalysis: (sessionId: string, type: 'manifest' | 'optimize') =>
  fetch(`/api/recordings/${sessionId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  }).then(r => r.json())

analyzeStreamUrl: (sessionId: string) =>
  `/api/recordings/${sessionId}/analyze/stream`
```

## Report Content Rendering

The existing `ReportViewer.tsx` contains the rendering logic for both manifest and optimize reports. This will be extracted into `web/src/components/Session/ReportContent.tsx` and used by both `SessionPage` and (temporarily) `ReportViewer` during the transition.

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Session not found | 404 page with back link |
| Analysis already running | POST returns 409, UI shows "Analysis in progress" |
| Analysis fails mid-stream | SSE `error` event, page shows message + retry button |
| SSE disconnects unexpectedly | `EventSource.onerror` → show warning, offer manual refresh |

## Out of Scope (Phase 1)

- DDL path input (Layer 2a)
- Explain DB URL input (Layer 2b)
- LLM analysis trigger (Layer 3)
- Concurrent analysis of multiple sessions
- Analysis job persistence across server restarts
