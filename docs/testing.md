# Testing

## 結構

```
test/unit/               鏡射 src/ 目錄結構
  Modules/
    Schema/              ExportService, ImportSchemaService, VirtualFKService,
                         所有 Exporters, Writers, Repository, Controller, Routes
    Recording/           QueryAnalyzer, RecordingService, Session, OperationMarker,
                         QueryChunk, Protocol/TCP, Repository, Controller, Routes
    Doctor/              所有 13 個 Check、DoctorService, DoctorReporter, DoctorCommand
  Domain/                ERModel, GroupingStrategy, RelationInferrer
  CLI/                   ExportCommand, RecordCommand
  Extension/             api.test.ts
  Web/                   PlaybackControls.test.ts
```

## 慣例

- 使用 **Vitest** 搭配 globals（不需 import `describe`/`it`/`expect`）
- 測試檔案命名：`*.test.ts`
- Path alias：`@/` → `./src/`、`@web/` → `./web/src/`
