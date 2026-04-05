# Modular Monolith — Phase Sequence

Suitable for: multi-domain application not yet ready for distributed systems, medium team, migration path to microservices later.

## Phase 1: Module Boundaries
source: archivolt.json (VFK clusters)
action: create-modules
description: Each VFK cluster becomes one Module directory. Modules must not import each other's internals — only their public API. Create the top-level Module directory structure.

## Phase 2: Module Public API
source: http-recording (grouped by VFK cluster)
action: create-module-contracts
description: Define the public interface for each Module — the methods other modules may call. This becomes the cross-module communication contract. Store as an interface file in each Module.

## Phase 3: Domain Models per Module
source: schema.sql (tables per cluster)
action: create-models
description: Create Models inside each Module for the tables belonging to that VFK cluster. Models are not shared across modules.

## Phase 4: Intra-Module Services
source: archivolt.json + http-recording
action: create-services
description: Create Service classes inside each Module for its business logic. Services implement the Module's public API interface.

## Phase 5: Module Repositories
source: schema.sql (per cluster)
action: create-repositories
description: Create Repositories inside each Module for DB access to that Module's tables. Repositories are never accessed from outside the Module.

## Phase 6: Cross-Module Events
source: http-recording (cross-cluster query patterns from archivolt.json)
action: create-events
description: For cross-cluster queries identified in the optimize report, replace direct module calls with Domain Events. Define event classes and a simple in-process event dispatcher.

## Phase 7: API Controllers
source: http-recording
action: create-controllers
description: Thin HTTP controllers that delegate to the Module's public Service API. One controller per HTTP resource group.
