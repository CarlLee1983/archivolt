# Hexagonal / Clean Architecture — Phase Sequence

Suitable for: applications needing high testability, multiple delivery mechanisms (HTTP + CLI + queue), medium team.

## Phase 1: Core Domain
source: schema.sql + archivolt.json
action: create-entities
description: Create Entities and Value Objects in the Core layer. No framework imports. One Entity per primary table; Value Objects for fields with domain meaning (Money, Email, Status).

## Phase 2: Input Ports (Use Case Interfaces)
source: http-recording
action: create-input-ports
description: Define one interface per Use Case in Core/Ports/In/. Each HTTP endpoint corresponds to one input port. Interface declares the method signature only.

## Phase 3: Output Ports (Repository Interfaces)
source: schema.sql
action: create-output-ports
description: Define one interface per Repository in Core/Ports/Out/. These are the contracts the Infrastructure layer must implement.

## Phase 4: Application Services (Use Case Implementations)
source: http-recording (semantic chunks)
action: create-use-cases
description: Implement each input port interface as an Application Service in Core/Application/. Services call output ports (repositories) via injected interfaces — never concrete classes.

## Phase 5: HTTP Adapter (Input)
source: http-recording
action: create-controllers
description: Create HTTP controllers in Adapters/In/Http/. Each controller maps the HTTP request to a Use Case call via the input port interface.

## Phase 6: Database Adapter (Output)
source: schema.sql
action: create-repositories
description: Implement each output port interface in Adapters/Out/Persistence/. These are the only classes that touch the ORM or raw DB.
