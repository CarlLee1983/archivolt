# archivolt-implement Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `archivolt-implement` orchestrator skill plus architecture playbooks and framework command tables that guide engineers step-by-step through scaffolding a project from Archivolt analysis artifacts.

**Architecture:** Single orchestrator skill reads two types of playbook files at runtime — architecture playbooks define ordered build phases, framework command tables define the actual commands. The orchestrator cross-references them, fills `{{Variable}}` placeholders from Archivolt artifacts, and walks the developer through each phase interactively.

**Tech Stack:** Markdown skill files (no runtime code except `InstallSkillCommand.ts` update in TypeScript/Bun)

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `skills/archivolt-implement.md` | Orchestrator skill — entry point |
| `skills/playbooks/slim-mvc.md` | Phase sequence for Slim MVC |
| `skills/playbooks/ddd-dci.md` | Phase sequence for DDD+DCI |
| `skills/playbooks/hexagonal.md` | Phase sequence for Hexagonal/Clean Architecture |
| `skills/playbooks/modular-monolith.md` | Phase sequence for Modular Monolith |
| `skills/playbooks/microservices.md` | Phase sequence for Microservices |
| `skills/playbooks/commands-laravel.md` | Laravel artisan command table |
| `skills/playbooks/commands-express.md` | Node.js + Express command table |
| `skills/playbooks/commands-django.md` | Python + Django command table |

### Modified files

| File | Change |
|------|--------|
| `src/CLI/InstallSkillCommand.ts` | Add recursive subdirectory copy for `playbooks/` |
| `test/unit/Recording/CLI/InstallSkillCommand.test.ts` | Add tests for subdirectory copy |
| `docs/commands.md` | Document install-skill now copies playbooks/ |
| `docs/plugin-install.md` | Note playbooks are installed alongside skills |

---

## Task 1: Update InstallSkillCommand to copy playbooks/ subdirectory (TDD)

**Files:**
- Modify: `src/CLI/InstallSkillCommand.ts`
- Test: `test/unit/Recording/CLI/InstallSkillCommand.test.ts`

Current `runInstallSkillCommand` only copies top-level `.md` files. `skills/playbooks/` will not be installed without this change.

The refactor: extract a testable `copySkillsToDir(sourceSkillsDir, targetDir, format)` function, and add a `copyDirRecursive(src, dest)` helper. The `runInstallSkillCommand` calls `copySkillsToDir`.

- [ ] **Step 1: Write failing test for subdirectory copy**

Add to `test/unit/Recording/CLI/InstallSkillCommand.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseInstallSkillArgs, copySkillsToDir } from '@/CLI/InstallSkillCommand'
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// keep existing describe block for parseInstallSkillArgs...

describe('copySkillsToDir', () => {
  let tmpSource: string
  let tmpTarget: string

  beforeEach(async () => {
    const base = path.join(os.tmpdir(), `archivolt-test-${Date.now()}`)
    tmpSource = path.join(base, 'skills')
    tmpTarget = path.join(base, 'target')
    await mkdir(path.join(tmpSource, 'playbooks'), { recursive: true })
    await mkdir(tmpTarget, { recursive: true })
    await writeFile(path.join(tmpSource, 'archivolt-schema.md'), '# schema')
    await writeFile(path.join(tmpSource, 'playbooks', 'slim-mvc.md'), '# slim-mvc')
    await writeFile(path.join(tmpSource, 'playbooks', 'commands-laravel.md'), '# laravel')
  })

  it('copies top-level .md files to target (claude format)', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'claude')
    expect(existsSync(path.join(tmpTarget, 'archivolt-schema.md'))).toBe(true)
  })

  it('copies playbooks/ subdirectory to target (claude format)', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'claude')
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'slim-mvc.md'))).toBe(true)
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'commands-laravel.md'))).toBe(true)
  })

  it('copies playbooks/ to cursor rules subdirectory', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'cursor')
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'slim-mvc.mdc'))).toBe(true)
  })

  it('embeds playbook contents in codex combined file', async () => {
    const outDir = path.join(os.tmpdir(), `archivolt-codex-${Date.now()}`)
    await mkdir(outDir, { recursive: true })
    await copySkillsToDir(tmpSource, outDir, 'codex')
    const outFile = path.join(outDir, 'archivolt-skills-system-prompt.md')
    const content = await import('node:fs/promises').then(fs => fs.readFile(outFile, 'utf-8'))
    expect(content).toContain('# slim-mvc')
    expect(content).toContain('# laravel')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test test/unit/Recording/CLI/InstallSkillCommand.test.ts
```

Expected: FAIL — `copySkillsToDir` is not exported from `InstallSkillCommand`.

- [ ] **Step 3: Implement `copyDirRecursive` and `copySkillsToDir`**

Replace `src/CLI/InstallSkillCommand.ts` with:

```typescript
import path from 'node:path'
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export interface InstallSkillArgs {
  readonly format: 'claude' | 'cursor' | 'codex'
}

export function parseInstallSkillArgs(argv: string[]): InstallSkillArgs {
  if (argv.includes('--cursor')) return { format: 'cursor' }
  if (argv.includes('--codex')) return { format: 'codex' }
  return { format: 'claude' }
}

async function copyDirRecursive(
  src: string,
  dest: string,
  transform?: (filename: string) => string
): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destName = transform ? transform(entry.name) : entry.name
    const destPath = path.join(dest, destName)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, transform)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

export async function copySkillsToDir(
  sourceSkillsDir: string,
  targetDir: string,
  format: 'claude' | 'cursor' | 'codex'
): Promise<void> {
  const files = (await readdir(sourceSkillsDir)).filter((f) => f.endsWith('.md'))

  if (format === 'claude') {
    for (const file of files) {
      await copyFile(path.join(sourceSkillsDir, file), path.join(targetDir, file))
      console.log(`Installed: ${file}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      await copyDirRecursive(playbooksDir, path.join(targetDir, 'playbooks'))
      console.log('Installed: playbooks/')
    }
    return
  }

  if (format === 'cursor') {
    for (const file of files) {
      const mdcName = file.replace('.md', '.mdc')
      await copyFile(path.join(sourceSkillsDir, file), path.join(targetDir, mdcName))
      console.log(`Written: ${mdcName}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      await copyDirRecursive(
        playbooksDir,
        path.join(targetDir, 'playbooks'),
        (name) => name.replace('.md', '.mdc')
      )
      console.log('Written: playbooks/')
    }
    return
  }

  if (format === 'codex') {
    const parts: string[] = ['# Archivolt Skills\n']
    for (const file of files) {
      const content = await readFile(path.join(sourceSkillsDir, file), 'utf-8')
      parts.push(`---\n\n${content}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      const playbookFiles = (await readdir(playbooksDir)).filter((f) => f.endsWith('.md'))
      for (const file of playbookFiles) {
        const content = await readFile(path.join(playbooksDir, file), 'utf-8')
        parts.push(`---\n\n${content}`)
      }
    }
    const outPath = path.join(targetDir, 'archivolt-skills-system-prompt.md')
    await writeFile(outPath, parts.join('\n'), 'utf-8')
    console.log('Written: archivolt-skills-system-prompt.md')
    console.log("Prepend this file's content to your Codex or ChatGPT system prompt.")
  }
}

function resolveSkillsDir(): string {
  const candidates = [
    path.resolve(import.meta.dir, '../..', 'skills'),
    path.resolve(process.cwd(), 'skills'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('skills/ directory not found. Is Archivolt installed correctly?')
}

export async function runInstallSkillCommand(argv: string[]): Promise<void> {
  const { format } = parseInstallSkillArgs(argv)
  const skillsDir = resolveSkillsDir()
  const files = (await readdir(skillsDir)).filter((f) => f.endsWith('.md'))

  if (files.length === 0) {
    console.error('No skill files found in skills/')
    process.exit(1)
  }

  if (format === 'claude') {
    const home = process.env.HOME
    if (!home) throw new Error('HOME environment variable not set')
    const targetDir = path.join(home, '.claude', 'plugins', 'archivolt', 'skills')
    await mkdir(targetDir, { recursive: true })
    await copySkillsToDir(skillsDir, targetDir, format)
    console.log(`\nSkills installed to ${targetDir}`)
    console.log('Restart Claude Code to activate.')
    return
  }

  if (format === 'cursor') {
    const targetDir = path.join(process.cwd(), '.cursor', 'rules')
    await mkdir(targetDir, { recursive: true })
    await copySkillsToDir(skillsDir, targetDir, format)
    console.log('\nSkills written to .cursor/rules/')
    return
  }

  if (format === 'codex') {
    await copySkillsToDir(skillsDir, process.cwd(), format)
    console.log("Prepend this file's content to your Codex or ChatGPT system prompt.")
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test test/unit/Recording/CLI/InstallSkillCommand.test.ts
```

Expected: All tests PASS (4 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/CLI/InstallSkillCommand.ts test/unit/Recording/CLI/InstallSkillCommand.test.ts
git commit -m "feat: [install-skill] copy playbooks/ subdirectory recursively"
```

---

## Task 2: Create orchestrator skill

**Files:**
- Create: `skills/archivolt-implement.md`

- [ ] **Step 1: Create orchestrator skill**

Create `skills/archivolt-implement.md`:

```markdown
---
name: archivolt-implement
description: >
  Guided scaffolding skill — reads Archivolt analysis artifacts and an architecture
  recommendation, asks for the target framework, then walks the developer phase-by-phase
  through generating controllers, routes, models, services, and repositories.
  Optional: skip this skill entirely if you already know your architecture and tooling.
triggers:
  - 幫我實作架構
  - 開始 scaffold
  - 帶我建立框架結構
  - implement the architecture
  - scaffold from archivolt
  - 我想要開始重構
---

# archivolt-implement

> **Language rule:** Detect the user's language from the conversation. Ask all quoted questions and confirmations in that language.

> **Optional tool:** This skill is intended for engineers who want guided scaffolding. Experienced developers may skip it and work directly from Archivolt artifacts.

Guide the developer from Archivolt analysis artifacts to a scaffolded project using their chosen architecture and framework.

---

## Step 1 — Read artifacts

Check for the following files in the current directory:

| File | Required? | Used for |
|------|-----------|---------|
| `optimize-report.md` | Preferred | Architecture name lookup |
| `archivolt.json` | Preferred | VFK cluster → module boundaries |
| `http-recording.json` | Optional | Route + Controller list |
| `schema.sql` | Preferred | Model fields, Repository schema |

Read each file that exists. If `optimize-report.md` is present, extract the architecture name from the first line matching `## Recommended Architecture:`.

If `optimize-report.md` is missing, ask:

> "找不到 `optimize-report.md`。請告訴我要用哪種架構？
> a) Slim MVC
> b) Hexagonal / Clean Architecture
> c) DDD + DCI
> d) Modular Monolith
> e) Microservices"

---

## Step 2 — Confirm framework

Ask the developer:

> "你的技術棧是？
> a) PHP + Laravel
> b) Node.js + Express
> c) Python + Django
> d) 其他（請說明）"

If the developer answers (d), ask them to provide a command table in the same format as `playbooks/commands-laravel.md`. Proceed using their inline table.

---

## Step 3 — Load playbooks

Use the Read tool to load:

1. `~/.claude/plugins/archivolt/skills/playbooks/<arch-slug>.md`
   - `slim-mvc.md` for Slim MVC
   - `ddd-dci.md` for DDD + DCI
   - `hexagonal.md` for Hexagonal / Clean Architecture
   - `modular-monolith.md` for Modular Monolith
   - `microservices.md` for Microservices

2. `~/.claude/plugins/archivolt/skills/playbooks/commands-<fw>.md`
   - `commands-laravel.md` for Laravel
   - `commands-express.md` for Express
   - `commands-django.md` for Django

Cross-reference the two files to build the execution plan:
- For each Phase in the architecture playbook, look up the `action:` key in the command table.
- Fill `{{Variable}}` placeholders using artifact data:
  - `{{Controller}}` — derived from HTTP recording endpoint groups or VFK cluster names
  - `{{Model}}` — derived from `schema.sql` table names
  - `{{method}}` / `{{path}}` — derived from HTTP recording

---

## Step 4 — Walk phases

For each Phase in order:

1. **Announce the phase:**
   > "Phase N: [Phase Name] — [description from playbook]"

2. **Show the commands** with all variables filled in. Example:
   ```
   php artisan make:controller OrderController --api
   php artisan make:controller ProductController --api
   ```

3. **Wait for confirmation:**
   > "以上指令準備執行，確認繼續？（輸入 'skip' 跳過這個 Phase）"

4. **Execute** using the Bash tool (one command at a time).

5. **Verify** using the `verify:` expression from the command table (file existence check or equivalent).

6. **Report result** and ask:
   > "Phase N 完成。繼續到 Phase N+1？"

**On failure:** Show the error output, suggest a fix based on the verify condition, and offer retry or skip.

**On skip:** Record the skipped phase in the SCAFFOLD.md output.

---

## Step 5 — Write SCAFFOLD.md

After all phases are complete (or skipped), write `SCAFFOLD.md` in the current directory:

```markdown
# Scaffold Summary

**Architecture:** [name]
**Framework:** [name]
**Date:** [YYYY-MM-DD]

## Files Generated

[List every file created during this session, one per line]

## Phases Skipped

| Phase | Reason |
|-------|--------|
[List any skipped phases and the reason given]

## Recommended Next Steps

- Run your test suite to verify the scaffold compiles
- Review generated files and fill in business logic
- Use `/tdd` or `/tdd-workflow` to write tests for each Service method
- Use `/archivolt-advisor` if you want a second opinion on architecture fit
```

---

## Artifact variable resolution reference

| Playbook variable | Resolved from |
|-------------------|--------------|
| `{{Controller}}` | HTTP recording endpoint groups (e.g. `/orders/*` → `OrderController`) |
| `{{Model}}` | `schema.sql` table names (singular, PascalCase) |
| `{{method}}` | HTTP recording HTTP method (GET/POST/PUT/DELETE) |
| `{{path}}` | HTTP recording URL path |
| `{{Module}}` | VFK cluster name from `archivolt.json` |
| `{{Repository}}` | `{{Model}}Repository` |
| `{{Service}}` | `{{Model}}Service` or cluster-level name |
```

- [ ] **Step 2: Verify file exists and frontmatter is valid**

```bash
head -15 skills/archivolt-implement.md
```

Expected: Shows `name: archivolt-implement` in frontmatter.

- [ ] **Step 3: Commit**

```bash
git add skills/archivolt-implement.md
git commit -m "feat: [skills] add archivolt-implement orchestrator skill"
```

---

## Task 3: Create architecture playbooks

**Files:**
- Create: `skills/playbooks/slim-mvc.md`
- Create: `skills/playbooks/ddd-dci.md`
- Create: `skills/playbooks/hexagonal.md`
- Create: `skills/playbooks/modular-monolith.md`
- Create: `skills/playbooks/microservices.md`

- [ ] **Step 1: Create `skills/playbooks/slim-mvc.md`**

```markdown
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
```

- [ ] **Step 2: Create `skills/playbooks/ddd-dci.md`**

```markdown
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
```

- [ ] **Step 3: Create `skills/playbooks/hexagonal.md`**

```markdown
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
```

- [ ] **Step 4: Create `skills/playbooks/modular-monolith.md`**

```markdown
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
```

- [ ] **Step 5: Create `skills/playbooks/microservices.md`**

```markdown
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
```

- [ ] **Step 6: Verify all playbook files exist**

```bash
ls skills/playbooks/*.md
```

Expected:
```
skills/playbooks/slim-mvc.md
skills/playbooks/ddd-dci.md
skills/playbooks/hexagonal.md
skills/playbooks/modular-monolith.md
skills/playbooks/microservices.md
```

- [ ] **Step 7: Commit**

```bash
git add skills/playbooks/
git commit -m "feat: [skills] add architecture playbooks for all 5 supported patterns"
```

---

## Task 4: Create framework command tables

**Files:**
- Create: `skills/playbooks/commands-laravel.md`
- Create: `skills/playbooks/commands-express.md`
- Create: `skills/playbooks/commands-django.md`

- [ ] **Step 1: Create `skills/playbooks/commands-laravel.md`**

```markdown
# Laravel — Command Table

Maps playbook action keys to PHP artisan commands and file creation steps.
Variables use {{PascalCase}} for class names, {{kebab-case}} for paths.

## create-modules
command: |
  mkdir -p app/Modules/{{Module}}/{Domain,Application,Infrastructure,Presentation}
verify: is_dir(app/Modules/{{Module}}/Domain)

## create-routes
command: |
  # Append to routes/api.php:
  Route::{{method}}('/{{path}}', [{{Controller}}::class, '{{action}}']);
verify: grep -q "{{Controller}}" routes/api.php

## create-controllers
command: php artisan make:controller {{Controller}} --api
verify: file_exists(app/Http/Controllers/{{Controller}}.php)

## create-models
command: php artisan make:model {{Model}} -m
verify: file_exists(app/Models/{{Model}}.php)

## create-services
command: php artisan make:class App/Services/{{Service}}
# If make:class is unavailable (no package), use:
# mkdir -p app/Services && touch app/Services/{{Service}}.php
verify: file_exists(app/Services/{{Service}}.php)

## create-repositories
# Laravel has no built-in make:repository.
command: |
  mkdir -p app/Repositories
  cat > app/Repositories/{{Repository}}.php << 'PHP'
  <?php
  namespace App\Repositories;
  use App\Models\{{Model}};
  class {{Repository}} {
      public function all(): \Illuminate\Database\Eloquent\Collection {
          return {{Model}}::all();
      }
      public function find(int $id): ?{{Model}} {
          return {{Model}}::find($id);
      }
      public function create(array $data): {{Model}} {
          return {{Model}}::create($data);
      }
      public function update(int $id, array $data): {{Model}} {
          $record = {{Model}}::findOrFail($id);
          $record->update($data);
          return $record;
      }
      public function delete(int $id): void {
          {{Model}}::destroy($id);
      }
  }
  PHP
verify: file_exists(app/Repositories/{{Repository}}.php)

## create-entities
command: php artisan make:class App/Domain/{{Module}}/{{Model}}
verify: file_exists(app/Domain/{{Module}}/{{Model}}.php)

## create-events
command: php artisan make:event {{Model}}Event
verify: file_exists(app/Events/{{Model}}Event.php)

## create-use-cases
command: php artisan make:class App/Application/{{Module}}/{{Model}}UseCase
verify: file_exists(app/Application/{{Module}}/{{Model}}UseCase.php)

## create-input-ports
command: php artisan make:interface App/Ports/In/I{{Model}}UseCase
# If make:interface unavailable:
# touch app/Ports/In/I{{Model}}UseCase.php
verify: file_exists(app/Ports/In/I{{Model}}UseCase.php)

## create-output-ports
command: php artisan make:interface App/Ports/Out/I{{Repository}}
verify: file_exists(app/Ports/Out/I{{Repository}}.php)

## create-module-contracts
command: php artisan make:interface App/Modules/{{Module}}/I{{Module}}Service
verify: file_exists(app/Modules/{{Module}}/I{{Module}}Service.php)

## create-dci-contexts
command: php artisan make:class App/DCI/{{Module}}Context
verify: file_exists(app/DCI/{{Module}}Context.php)
```

- [ ] **Step 2: Create `skills/playbooks/commands-express.md`**

```markdown
# Node.js + Express — Command Table

Maps playbook action keys to file creation commands for a Node.js + Express project.
Assumes TypeScript. Variables use {{PascalCase}} for class names, {{kebab-case}} for paths.

## create-modules
command: mkdir -p src/modules/{{module}}/{domain,application,infrastructure,presentation}
verify: is_dir(src/modules/{{module}}/domain)

## create-routes
command: |
  # Append to src/routes/{{module}}.routes.ts:
  router.{{method}}('/{{path}}', {{controller}}.{{action}});
verify: grep -q "{{controller}}" src/routes/{{module}}.routes.ts

## create-controllers
command: |
  mkdir -p src/controllers
  cat > src/controllers/{{Controller}}.ts << 'TS'
  import { Request, Response } from 'express';
  export class {{Controller}} {
    async index(req: Request, res: Response): Promise<void> {
      res.json([]);
    }
    async show(req: Request, res: Response): Promise<void> {
      res.json({});
    }
    async store(req: Request, res: Response): Promise<void> {
      res.status(201).json({});
    }
    async update(req: Request, res: Response): Promise<void> {
      res.json({});
    }
    async destroy(req: Request, res: Response): Promise<void> {
      res.status(204).send();
    }
  }
  TS
verify: file_exists(src/controllers/{{Controller}}.ts)

## create-models
command: |
  mkdir -p src/models
  cat > src/models/{{Model}}.ts << 'TS'
  export interface {{Model}} {
    id: number;
    createdAt: Date;
    updatedAt: Date;
  }
  TS
verify: file_exists(src/models/{{Model}}.ts)

## create-services
command: |
  mkdir -p src/services
  cat > src/services/{{Service}}.ts << 'TS'
  export class {{Service}} {}
  TS
verify: file_exists(src/services/{{Service}}.ts)

## create-repositories
command: |
  mkdir -p src/repositories
  cat > src/repositories/{{Repository}}.ts << 'TS'
  import { {{Model}} } from '../models/{{Model}}';
  export class {{Repository}} {
    async findAll(): Promise<{{Model}}[]> { return []; }
    async findById(id: number): Promise<{{Model}} | null> { return null; }
    async create(data: Partial<{{Model}}>): Promise<{{Model}}> { return {} as {{Model}}; }
    async update(id: number, data: Partial<{{Model}}>): Promise<{{Model}}> { return {} as {{Model}}; }
    async delete(id: number): Promise<void> {}
  }
  TS
verify: file_exists(src/repositories/{{Repository}}.ts)

## create-entities
command: |
  mkdir -p src/domain/{{module}}
  cat > src/domain/{{module}}/{{Model}}.ts << 'TS'
  export class {{Model}} {
    constructor(public readonly id: number) {}
  }
  TS
verify: file_exists(src/domain/{{module}}/{{Model}}.ts)

## create-events
command: |
  mkdir -p src/events
  cat > src/events/{{Model}}Event.ts << 'TS'
  export interface {{Model}}Event { type: string; payload: unknown; }
  TS
verify: file_exists(src/events/{{Model}}Event.ts)

## create-use-cases
command: |
  mkdir -p src/application/{{module}}
  cat > src/application/{{module}}/{{Model}}UseCase.ts << 'TS'
  export class {{Model}}UseCase {}
  TS
verify: file_exists(src/application/{{module}}/{{Model}}UseCase.ts)

## create-input-ports
command: |
  mkdir -p src/ports/in
  cat > src/ports/in/I{{Model}}UseCase.ts << 'TS'
  export interface I{{Model}}UseCase {}
  TS
verify: file_exists(src/ports/in/I{{Model}}UseCase.ts)

## create-output-ports
command: |
  mkdir -p src/ports/out
  cat > src/ports/out/I{{Repository}}.ts << 'TS'
  export interface I{{Repository}} {}
  TS
verify: file_exists(src/ports/out/I{{Repository}}.ts)

## create-module-contracts
command: |
  mkdir -p src/modules/{{module}}
  cat > src/modules/{{module}}/I{{Module}}Service.ts << 'TS'
  export interface I{{Module}}Service {}
  TS
verify: file_exists(src/modules/{{module}}/I{{Module}}Service.ts)

## create-dci-contexts
command: |
  mkdir -p src/dci
  cat > src/dci/{{Module}}Context.ts << 'TS'
  export class {{Module}}Context {}
  TS
verify: file_exists(src/dci/{{Module}}Context.ts)
```

- [ ] **Step 3: Create `skills/playbooks/commands-django.md`**

```markdown
# Python + Django — Command Table

Maps playbook action keys to Django management commands and file creation steps.
Assumes Django REST Framework. Variables use {{PascalCase}} for class names.

## create-modules
command: python manage.py startapp {{module}}
verify: is_dir({{module}})

## create-routes
command: |
  # Append to {{module}}/urls.py:
  path('{{path}}/', views.{{Controller}}.as_view({'{{method}}': '{{action}}'})),
verify: grep -q "{{Controller}}" {{module}}/urls.py

## create-controllers
# Django calls these ViewSets in DRF
command: |
  cat >> {{module}}/views.py << 'PY'
  from rest_framework import viewsets
  from .models import {{Model}}
  from .serializers import {{Model}}Serializer

  class {{Controller}}(viewsets.ModelViewSet):
      queryset = {{Model}}.objects.all()
      serializer_class = {{Model}}Serializer
  PY
verify: grep -q "{{Controller}}" {{module}}/views.py

## create-models
command: |
  cat >> {{module}}/models.py << 'PY'
  from django.db import models
  class {{Model}}(models.Model):
      created_at = models.DateTimeField(auto_now_add=True)
      updated_at = models.DateTimeField(auto_now=True)
      class Meta:
          db_table = '{{table}}'
  PY
  python manage.py makemigrations
verify: file_exists({{module}}/models.py)

## create-services
command: |
  touch {{module}}/services.py
  cat >> {{module}}/services.py << 'PY'
  class {{Service}}:
      pass
  PY
verify: file_exists({{module}}/services.py)

## create-repositories
command: |
  touch {{module}}/repositories.py
  cat >> {{module}}/repositories.py << 'PY'
  from .models import {{Model}}
  class {{Repository}}:
      def all(self): return {{Model}}.objects.all()
      def find(self, id): return {{Model}}.objects.filter(pk=id).first()
      def create(self, data): return {{Model}}.objects.create(**data)
      def update(self, id, data):
          {{Model}}.objects.filter(pk=id).update(**data)
          return self.find(id)
      def delete(self, id): {{Model}}.objects.filter(pk=id).delete()
  PY
verify: file_exists({{module}}/repositories.py)

## create-entities
command: |
  mkdir -p {{module}}/domain
  cat > {{module}}/domain/{{Model}}.py << 'PY'
  class {{Model}}Entity:
      def __init__(self, id: int): self.id = id
  PY
verify: file_exists({{module}}/domain/{{Model}}.py)

## create-events
command: |
  touch {{module}}/events.py
  cat >> {{module}}/events.py << 'PY'
  from dataclasses import dataclass
  @dataclass
  class {{Model}}Event:
      type: str
      payload: dict
  PY
verify: file_exists({{module}}/events.py)

## create-use-cases
command: |
  touch {{module}}/use_cases.py
  cat >> {{module}}/use_cases.py << 'PY'
  class {{Model}}UseCase:
      pass
  PY
verify: file_exists({{module}}/use_cases.py)

## create-input-ports
command: |
  touch {{module}}/ports_in.py
  cat >> {{module}}/ports_in.py << 'PY'
  from abc import ABC, abstractmethod
  class I{{Model}}UseCase(ABC):
      pass
  PY
verify: file_exists({{module}}/ports_in.py)

## create-output-ports
command: |
  touch {{module}}/ports_out.py
  cat >> {{module}}/ports_out.py << 'PY'
  from abc import ABC, abstractmethod
  class I{{Repository}}(ABC):
      pass
  PY
verify: file_exists({{module}}/ports_out.py)

## create-module-contracts
command: |
  touch {{module}}/contract.py
  cat >> {{module}}/contract.py << 'PY'
  from abc import ABC
  class I{{Module}}Service(ABC):
      pass
  PY
verify: file_exists({{module}}/contract.py)

## create-dci-contexts
command: |
  mkdir -p dci
  cat > dci/{{Module}}Context.py << 'PY'
  class {{Module}}Context:
      pass
  PY
verify: file_exists(dci/{{Module}}Context.py)
```

- [ ] **Step 4: Verify all command table files exist**

```bash
ls skills/playbooks/commands-*.md
```

Expected:
```
skills/playbooks/commands-laravel.md
skills/playbooks/commands-express.md
skills/playbooks/commands-django.md
```

- [ ] **Step 5: Commit**

```bash
git add skills/playbooks/commands-*.md
git commit -m "feat: [skills] add framework command tables for Laravel, Express, Django"
```

---

## Task 5: Update documentation

**Files:**
- Modify: `docs/commands.md`
- Modify: `docs/plugin-install.md`

- [ ] **Step 1: Read current docs/commands.md**

Read `docs/commands.md` to find the install-skill section.

- [ ] **Step 2: Update install-skill entry in docs/commands.md**

Find the existing `install-skill` documentation block and add a note about playbooks:

```
# Install AI skills (copies skills/ + skills/playbooks/ to AI tool config)
archivolt install-skill            # Claude Code (~/.claude/plugins/archivolt/skills/)
archivolt install-skill --cursor   # Cursor (.cursor/rules/)
archivolt install-skill --codex    # Codex (archivolt-skills-system-prompt.md)
```

- [ ] **Step 3: Update docs/plugin-install.md**

Add a note after the install-skill instructions:

```markdown
## What gets installed

`archivolt install-skill` copies:
- `archivolt-schema.md`, `archivolt-record.md`, `archivolt-analyze.md`, `archivolt-advisor.md` — core workflow skills
- `archivolt-implement.md` — optional guided scaffolding skill
- `playbooks/` — architecture phase sequences and framework command tables (used by `archivolt-implement`)

The `archivolt-implement` skill and playbooks are **optional**. Experienced developers
who already know their architecture and tooling can use the other four skills without
ever invoking `archivolt-implement`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/commands.md docs/plugin-install.md
git commit -m "docs: document install-skill copies playbooks/ and note archivolt-implement is optional"
```

---

## Self-Review

**Spec coverage:**
- ✅ Orchestrator skill (`archivolt-implement.md`) — Task 2
- ✅ Architecture playbooks (all 5) — Task 3
- ✅ Framework command tables (3 frameworks) — Task 4
- ✅ `InstallSkillCommand` recursive copy — Task 1
- ✅ Optional/non-mandatory design principle — noted in skill frontmatter description and docs
- ✅ Boundary conditions (missing artifacts, unknown framework, phase skip, file exists) — handled in orchestrator Step 4 and Step 1

**Placeholder scan:** All steps contain actual code or commands. No TBDs.

**Type consistency:** No cross-task type references — skill files are Markdown, not code.
