# Microservices — Phase Sequence

Suitable for: high traffic, independent scaling required, large team, clean data boundaries confirmed by VFK cluster analysis.

⚠️ Warning: Only proceed if VFK cluster analysis shows minimal cross-cluster joins. Heavy cross-cluster joins will require significant event-driven consistency work.

## Phase 1: Service Boundaries
source: archivolt.json (VFK clusters)
action: create-modules
description: Each VFK cluster becomes one independent Service. Create one project directory per Service. Each Service owns its data — no shared DB tables.

## Phase 2: Per-Service API Contract
source: http-recording (grouped by cluster)
action: create-input-ports
description: Define the API contract for each Service (OpenAPI or interface file). Only endpoints from that Service's VFK cluster belong here.

## Phase 3: Per-Service Domain Model
source: schema.sql (tables per cluster)
action: create-entities
description: Each Service has its own Models for its tables. No cross-service model imports. Shared data is replicated via events, not via shared tables.

## Phase 4: Per-Service Repositories
source: schema.sql (per cluster)
action: create-repositories
description: Repositories inside each Service. Each Service connects to its own DB schema or DB instance.

## Phase 5: Per-Service Controllers
source: http-recording (per cluster)
action: create-controllers
description: HTTP controllers inside each Service. Routes only cover endpoints from that Service's VFK cluster.

## Phase 6: Inter-Service Communication
source: archivolt.json (cross-cluster JOIN patterns)
action: create-events
description: For each cross-cluster JOIN found in the optimize report, define an integration event. Create event publisher and subscriber stubs. Note: full event infrastructure (message broker) is out of scope — stubs only.

## Phase 7: API Gateway Routes
source: http-recording (all endpoints)
action: create-routes
description: Create the API gateway routing table mapping all endpoints to their owning Service. Format depends on gateway choice (Nginx, Kong, Express proxy).
