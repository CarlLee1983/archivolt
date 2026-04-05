# Design: archivolt-implement Skill

**Date:** 2026-04-05
**Status:** Approved

## Design Principle

`archivolt-advisor` and `archivolt-implement` are **optional guidance tools**, not mandatory steps. They target engineers who lack architectural direction or hands-on experience. Experienced developers may skip these skills entirely and use the raw Archivolt artifacts directly.

## Problem

After `archivolt-advisor` recommends an architecture, developers with little architectural experience have no guided path to actually scaffold the project. Creating one skill per architecture × framework combination would cause combinatorial explosion (5 architectures × N frameworks).

## Solution

A single orchestrator skill (`archivolt-implement`) that dynamically composes behaviour at runtime by reading two types of playbook files from disk:

- **Architecture playbooks** — define the ordered phase sequence (what to build)
- **Framework command tables** — define the actual commands for each action (how to build it)

## File Structure

```
skills/
├── archivolt-implement.md          ← Orchestrator (entry skill)
└── playbooks/
    ├── slim-mvc.md                 ← Phase sequence
    ├── ddd-dci.md
    ├── hexagonal.md
    ├── modular-monolith.md
    ├── microservices.md
    ├── commands-laravel.md         ← Framework command tables
    ├── commands-express.md
    └── commands-django.md
```

Distributed via the existing `archivolt install-skill` mechanism, which already supports directory-level copying.

## Data Flow

```
archivolt-advisor output
  optimize-report.md   ─┐
  archivolt.json        ├─ Input artifacts
  http-recording.json  ─┘

          │
          ▼
  archivolt-implement (orchestrator)
    1. Read architecture name from optimize-report.md
    2. Ask developer: which framework?
    3. Read playbooks/<arch>.md       ← phase sequence
       Read playbooks/commands-<fw>.md ← command syntax
    4. Walk phases interactively:
       show command → confirm → execute → verify
    5. Write SCAFFOLD.md (summary of what was generated)
```

**Artifact priority for variable resolution:**

| Variable | Source |
|----------|--------|
| Module / Context boundaries | `archivolt.json` VFK clusters |
| Route / Controller list | HTTP recording endpoints |
| Model fields / Repository schema | `schema.sql` |

## Orchestrator Steps

**Step 1 — Read artifacts**
Extract the recommended architecture from the first `## Recommended Architecture:` heading in `optimize-report.md`. Read VFK clusters from `archivolt.json`. Extract endpoint list from HTTP recording.

**Step 2 — Confirm framework**
Ask the developer (multiple choice):
> "Your tech stack?
> a) PHP + Laravel
> b) Node.js + Express
> c) Python + Django
> d) Other (describe)"

**Step 3 — Compose playbook**
Use the `Read` tool to load `playbooks/<arch>.md` and `playbooks/commands-<fw>.md`. Cross-reference to produce an ordered, command-annotated phase list.

**Step 4 — Walk phases**
For each phase:
1. Explain what this phase does and why
2. Show the concrete commands with variables filled in
3. Wait for developer confirmation
4. Execute (Bash / Write tools)
5. Verify output (file existence check, or run artisan tinker for schema check)
6. Ask "Phase complete — continue?"

**Step 5 — Produce SCAFFOLD.md**
Record: files generated, phases skipped (with reason), recommended next steps.

## Playbook Format

### Architecture Playbook (`playbooks/slim-mvc.md`)

```markdown
# Slim MVC — Phase Sequence

## Phase 1: Routes
source: http-recording
action: create-routes
description: Extract endpoints from HTTP recording, create route file

## Phase 2: Controllers
source: http-recording
action: create-controllers
description: One Controller per route group

## Phase 3: Models
source: schema.sql + archivolt.json
action: create-models
description: One Model per primary table; VFK clusters as relationship hints

## Phase 4: Service Layer
source: archivolt.json (VFK clusters)
action: create-services
description: Business logic in Services; Controllers stay thin

## Phase 5: Repository Layer
source: schema.sql
action: create-repositories
description: DB access encapsulated in Repositories; Models handle Eloquent only
```

### Framework Command Table (`playbooks/commands-laravel.md`)

```markdown
# Laravel — Command Table

## create-routes
command: "Edit routes/api.php, add:"
template: |
  Route::{{method}}('/{{path}}', [{{Controller}}::class, '{{action}}']);

## create-controllers
command: php artisan make:controller {{Controller}} --api
verify: file_exists(app/Http/Controllers/{{Controller}}.php)

## create-models
command: php artisan make:model {{Model}} -m
verify: file_exists(app/Models/{{Model}}.php)

## create-repositories
# Note: Laravel has no built-in make:repository. Use stub or manual creation.
command: mkdir -p app/Repositories && cp stubs/repository.stub app/Repositories/{{Model}}Repository.php
verify: file_exists(app/Repositories/{{Model}}Repository.php)
```

The orchestrator cross-references both files: phase defines **what**, command table defines **how**, variables (`{{Controller}}` etc.) are filled from artifacts.

## Extensibility

| Change | Cost |
|--------|------|
| Add a new framework | Add one `commands-<fw>.md` file |
| Add a new architecture | Add one `<arch>.md` playbook file |
| Update Laravel commands | Edit `commands-laravel.md` only |

No changes to the orchestrator are needed for new frameworks or architectures.

## Boundary Conditions

| Situation | Handling |
|-----------|---------|
| HTTP recording missing | Warn, skip Route/Controller phases, continue from Model phase |
| Framework not in list | Ask developer to provide command templates inline; execute dynamically |
| Phase execution fails | Show error, offer diagnosis, allow retry or skip |
| Developer wants to skip a phase | Record in SCAFFOLD.md, continue |
| `optimize-report.md` missing | Fall back to interactive architecture selection |
| File already exists | Show diff, do not overwrite without explicit confirmation |

## Out of Scope

- Test generation (delegated to TDD skill)
- Deployment configuration
- CI/CD setup
