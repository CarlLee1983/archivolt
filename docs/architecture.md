# Architecture

The codebase uses a **DDD (Domain-Driven Design)** layered architecture with a framework-agnostic design. Each module follows strict layering: Domain → Application → Infrastructure → Presentation.

## Backend (`src/`)

```
src/
  index.ts               Entry: CLI dispatch (export, record, doctor) and server startup
  app.ts                 Express-like app setup and port configuration
  bootstrap.ts           PlanetCore init, ServiceProvider registration, global error handling
  routes.ts              Module route registration (Schema + Recording)

  Modules/
    Schema/
      Domain/            ERModel types, RelationInferrer inference, GroupingStrategy
      Application/       ImportSchemaService, ExportService, VirtualFKService
      Infrastructure/
        Persistence/     JsonFileRepository (read/write archivolt.json)
        Exporters/       IExporter + implementations (Eloquent, Prisma, DBML, Mermaid)
        Writers/         IFileWriter + implementations (Directory, Stdout, LaravelArtisan)
        Providers/       SchemaServiceProvider
      Presentation/      SchemaController, Schema.routes.ts

    Recording/
      Domain/            Session entity, OperationMarker, ProtocolParser interface, QueryChunk
      Application/       RecordingService, QueryAnalyzer (SQL parsing and relation hints)
      Infrastructure/
        Proxy/           TcpProxy (TCP proxy), MysqlProtocolParser
        Persistence/     RecordingRepository
        Providers/       RecordingServiceProvider
      Presentation/      RecordingController, Recording.routes.ts

    Doctor/
      Domain/            IHealthCheck, IPrompter interfaces
      Application/       DoctorService (orchestrates checks and fixes)
      Infrastructure/
        Checks/
          Environment/   BunVersion, DbcliAvailable, PortAvailable,
                         Dependencies, WebDependencies, RecordingsDir
          Data/          ArchivoltJson, SchemaStructure, VirtualFkIntegrity,
                         TableGroupIntegrity, RecordingIntegrity
        DoctorReporter   Formatted output
        InteractivePrompter  Interactive repair prompts
      Presentation/      DoctorCommand (CLI entry)

  CLI/
    ExportCommand.ts     export subcommand handling
    RecordCommand.ts     record subcommand handling

  Shared/
    Presentation/        IHttpContext, IModuleRouter, ApiResponse, routerHelpers
    Infrastructure/      IServiceProvider, GravitoModuleRouter, GravitoServiceProviderAdapter

  wiring/                Module route registration (Schema + Recording routes)
```

## Frontend (`web/src/`)

```
web/src/
  main.tsx               Entry point
  App.tsx                Main app shell (Navbar, side panel, Canvas, Timeline)

  components/
    Canvas/
      ERCanvas.tsx       ReactFlow wrapper (LOD level-of-detail toggles)
      TableNode.tsx      Table node visual component
      edges.ts           Edge generation (FK + VFK)
      layoutEngine.ts    Dagre auto-layout
    Timeline/
      TimelinePanel.tsx  Recording session timeline UI
      PlaybackControls.tsx  Playback controls (speed, play/pause)
      ChunkCard.tsx      Query chunk card component

  stores/
    schemaStore.ts       Schema state (Zustand): filters, group visibility
    recordingStore.ts    Recording sessions, chunks, playback state
    playbackUtils.ts     Playback timing helpers

  api/
    schema.ts            Schema REST API client
    recording.ts         Recording REST API client

  types/
    er-model.ts          ERModel TypeScript interfaces
```

## Chrome extension (`extension/`)

```
extension/
  manifest.json          V3 manifest (all tabs + localhost permissions)
  src/
    api.ts               Talks to Archivolt server (status, sendMarker)
    background.ts        Background script (lifecycle)
    content.ts           Content script injected into pages
    popup.ts             Popup UI
    types.ts             TypeScript interfaces
  build.ts               Bun build script
```

Captures browser events (clicks, form submits, etc.) and sends them as **operation markers** to the Recording API (default http://localhost:3100).

## Data flow

1. `dbcli schema --format json` export → `ImportSchemaService` converts to ERModel
2. `JsonFileRepository` persists to `archivolt.json`
3. Frontend loads schema via REST API; ReactFlow renders it
4. **Query recording**: `TcpProxy` intercepts SQL → `MysqlProtocolParser` parses → `RecordingService` stores → `QueryAnalyzer` suggests implicit relations
5. **Browser markers**: Chrome extension captures events → Recording API → correlated with SQL queries
6. User annotates vFK → SchemaController API → `JsonFileRepository` persists
7. CLI `export` → `ExportService` → `IExporter` → `IFileWriter`
8. `doctor` command → `DoctorService` runs each `IHealthCheck` → report or interactive repair

## Persistence

- **`archivolt.json`**: Primary schema file (tables, columns, FK, VFK, groups, source metadata)
- **`data/recordings/`**: Directory for recorded session data
