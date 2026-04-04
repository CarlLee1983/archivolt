# Testing

## Layout

```
test/unit/               Mirrors src/ layout
  Modules/
    Schema/              ExportService, ImportSchemaService, VirtualFKService,
                         all Exporters, Writers, Repository, Controller, Routes
    Recording/           QueryAnalyzer, RecordingService, Session, OperationMarker,
                         QueryChunk, Protocol/TCP, Repository, Controller, Routes,
                         FlowGrouper, HttpFlowGrouper, NoiseTableDetector, UnifiedCorrelationService,
                         ReadWriteRatioAnalyzer
    Doctor/              All 13 checks, DoctorService, DoctorReporter, DoctorCommand
  Domain/                ERModel, GroupingStrategy, RelationInferrer
  CLI/                   ExportCommand, RecordCommand
  Extension/             api.test.ts
  Web/                   PlaybackControls.test.ts
```

## Conventions

- **Vitest** with globals enabled (no `import` for `describe` / `it` / `expect`)
- Test files: `*.test.ts`
- Path aliases: `@/` → `./src/`, `@web/` → `./web/src/`
