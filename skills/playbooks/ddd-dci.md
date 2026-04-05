# DDD + DCI — Phase Sequence

Suitable for: complex domain logic, distinct VFK clusters, medium-to-large team needing testability.

## Phase 1: Bounded Contexts
source: archivolt.json (VFK clusters)
action: create-modules
description: Each VFK cluster becomes one Bounded Context (module directory). Create the directory scaffold for each context: Domain/, Application/, Infrastructure/, Presentation/.

## Phase 2: Domain Entities
source: schema.sql + archivolt.json
action: create-entities
description: For each primary table in a cluster, create a Domain Entity. Entities contain identity, invariants, and domain methods — no framework dependencies.

## Phase 3: Domain Events
source: http-recording (write operations: POST/PUT/DELETE)
action: create-events
description: Each write HTTP endpoint corresponds to a Domain Event (e.g. POST /orders → OrderPlaced). Create event classes with the data payload needed downstream.

## Phase 4: Application Services (Use Cases)
source: http-recording (semantic chunks)
action: create-use-cases
description: Each semantic chunk from HTTP recording becomes one Use Case class in Application/. Use Cases orchestrate Entities and emit Domain Events.

## Phase 5: Repository Interfaces
source: schema.sql (per cluster)
action: create-repository-interfaces
description: Define IRepository interfaces in each Bounded Context's Domain/ layer. No implementation yet — only the interface contract.

## Phase 6: Repository Implementations
source: schema.sql
action: create-repositories
description: Implement each IRepository in the Infrastructure/ layer. Implementation depends on the framework ORM or query builder — Domain layer stays pure.

## Phase 7: DCI Roles and Contexts
source: archivolt.json (VFK clusters) + http-recording (semantic chunks)
action: create-dci-contexts
description: Identify recurring interaction patterns from query chunks. Create Role interfaces and DCI Context classes that assign roles to entities for each interaction.

## Phase 8: API Controllers
source: http-recording
action: create-controllers
description: Thin controllers in Presentation/. Each controller method calls one Use Case and returns the HTTP response. No business logic in controllers.
