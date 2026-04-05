# Slim MVC — Phase Sequence

Suitable for: single business domain, small team, CRUD-heavy application.

## Phase 1: Routes
source: http-recording
action: create-routes
description: Extract all HTTP endpoints from recording. Group by resource prefix (e.g. /orders → OrderController). Create route file with one route per recorded endpoint.

## Phase 2: Controllers
source: http-recording
action: create-controllers
description: Create one Controller per route group. Controllers stay thin — delegate all logic to Services. One method per HTTP action (index, show, store, update, destroy).

## Phase 3: Models
source: schema.sql + archivolt.json
action: create-models
description: Create one Model per primary table. Use VFK clusters to add relationship declarations ($hasMany, $belongsTo, etc.) to each Model.

## Phase 4: Service Layer
source: archivolt.json (VFK clusters)
action: create-services
description: Create one Service class per VFK cluster or per major resource. Services contain business logic; Controllers call Service methods and return responses.

## Phase 5: Repository Layer
source: schema.sql
action: create-repositories
description: Create one Repository per Model. Repositories encapsulate all DB queries. Services call Repositories, never Models directly. Inject Repository into Service via constructor.
