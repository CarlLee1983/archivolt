# Eloquent Artisan Stub Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `LaravelArtisanWriter` respect the artisan-generated stub's namespace and traits instead of blindly overwriting them, so Eloquent export is immune to Laravel version differences.

**Architecture:** After running `artisan make:model`, the writer reads the generated stub to extract `namespace` and existing traits (e.g. `HasFactory`). It then applies that context to the already-rendered PHP content via string patching — replacing the namespace and injecting any missing trait imports and `use` statements — before writing the final file. All logic is self-contained in `LaravelArtisanWriter.ts` with no changes to `IExporter`, `EloquentExporter`, or `ExportService`.

**Tech Stack:** Bun, TypeScript, `bun:test` (Vitest-compatible), Node.js `fs` module

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts` | Modify | Add `StubContext`, `parseStubContext`, `applyStubContext`; refactor `write()` |
| `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts` | Create | Unit tests for parsing and patching logic |

---

### Task 1: Write failing tests for `parseStubContext`

**Files:**
- Create: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'bun:test'
import { parseStubContext, applyStubContext } from './LaravelArtisanWriter'

const L8_STUB = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    use HasFactory;
}
`

const L11_STUB = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class Order extends Model
{
    use HasFactory;
}
`

const CUSTOM_NS_STUB = `<?php

namespace App\\Domain\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Product extends Model
{
}
`

describe('parseStubContext', () => {
  it('extracts namespace from L8 stub', () => {
    const ctx = parseStubContext(L8_STUB, '/path/to/User.php')
    expect(ctx.namespace).toBe('App\\Models')
  })

  it('extracts HasFactory trait from L8 stub', () => {
    const ctx = parseStubContext(L8_STUB, '/path/to/User.php')
    expect(ctx.existingTraits).toContain('HasFactory')
  })

  it('extracts custom namespace', () => {
    const ctx = parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php')
    expect(ctx.namespace).toBe('App\\Domain\\Models')
  })

  it('returns empty traits when class body has none', () => {
    const ctx = parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php')
    expect(ctx.existingTraits).toHaveLength(0)
  })

  it('stores filePath', () => {
    const ctx = parseStubContext(L8_STUB, '/var/www/app/Models/User.php')
    expect(ctx.filePath).toBe('/var/www/app/Models/User.php')
  })

  it('falls back to App\\Models when namespace regex fails', () => {
    const ctx = parseStubContext('<?php // no namespace', '/path/file.php')
    expect(ctx.namespace).toBe('App\\Models')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts
```

Expected: FAIL — `parseStubContext` not exported yet.

---

### Task 2: Implement `StubContext` and `parseStubContext`

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts`

- [ ] **Step 1: Add `StubContext` interface and `parseStubContext` function**

Add after the existing imports in `LaravelArtisanWriter.ts`:

```typescript
export interface StubContext {
  readonly namespace: string
  readonly existingTraits: string[]
  readonly filePath: string
}

export function parseStubContext(content: string, filePath: string): StubContext {
  const nsMatch = content.match(/^namespace\s+([\w\\]+);/m)
  const namespace = nsMatch?.[1] ?? 'App\\Models'

  const traitMatches = [...content.matchAll(/^\s+use\s+(\w+);/gm)]
  const existingTraits = traitMatches.map((m) => m[1])

  return { namespace, existingTraits, filePath }
}
```

- [ ] **Step 2: Run the parseStubContext tests**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts --reporter=verbose 2>&1 | head -40
```

Expected: all `parseStubContext` tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts
git commit -m "feat: [exporter] add StubContext type and parseStubContext"
```

---

### Task 3: Write failing tests for `applyStubContext`

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts`

- [ ] **Step 1: Add `applyStubContext` tests to the test file**

Append to `LaravelArtisanWriter.test.ts`:

```typescript
// Minimal PHP as EloquentExporter currently generates for a model without soft deletes
const BASE_PHP = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    protected $table = 'users';

    protected $fillable = ['name', 'email'];

}
`

describe('applyStubContext', () => {
  it('replaces namespace', () => {
    const ctx: StubContext = {
      namespace: 'App\\Domain\\Models',
      existingTraits: [],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('namespace App\\Domain\\Models;')
    expect(result).not.toContain('namespace App\\Models;')
  })

  it('keeps namespace unchanged when stub has same namespace', () => {
    const ctx: StubContext = {
      namespace: 'App\\Models',
      existingTraits: [],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('namespace App\\Models;')
  })

  it('injects HasFactory import before Model import', () => {
    const ctx: StubContext = {
      namespace: 'App\\Models',
      existingTraits: ['HasFactory'],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    const factoryIdx = result.indexOf('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    const modelIdx = result.indexOf('use Illuminate\\Database\\Eloquent\\Model;')
    expect(factoryIdx).toBeLessThan(modelIdx)
  })

  it('injects use HasFactory in class body', () => {
    const ctx: StubContext = {
      namespace: 'App\\Models',
      existingTraits: ['HasFactory'],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('    use HasFactory;')
  })

  it('does not duplicate HasFactory import if already present', () => {
    const phpWithFactory = BASE_PHP.replace(
      'use Illuminate\\Database\\Eloquent\\Model;',
      'use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;\nuse Illuminate\\Database\\Eloquent\\Model;'
    )
    const ctx: StubContext = {
      namespace: 'App\\Models',
      existingTraits: ['HasFactory'],
      filePath: '/any',
    }
    const result = applyStubContext(phpWithFactory, ctx)
    const count = (result.match(/HasFactory/g) ?? []).length
    // import line + use line = 2 occurrences
    expect(count).toBe(2)
  })

  it('ignores unknown traits with no FQCN mapping', () => {
    const ctx: StubContext = {
      namespace: 'App\\Models',
      existingTraits: ['SomeCustomTrait'],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).not.toContain('SomeCustomTrait')
  })

  it('combines namespace replacement and trait injection', () => {
    const ctx: StubContext = {
      namespace: 'App\\Admin\\Models',
      existingTraits: ['HasFactory'],
      filePath: '/any',
    }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('namespace App\\Admin\\Models;')
    expect(result).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    expect(result).toContain('    use HasFactory;')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts 2>&1 | grep -E '(PASS|FAIL|error)'
```

Expected: `applyStubContext` tests FAIL — function not exported yet.

---

### Task 4: Implement `applyStubContext`

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts`

- [ ] **Step 1: Add the FQCN map and `applyStubContext` function**

Add after `parseStubContext` in `LaravelArtisanWriter.ts`:

```typescript
const TRAIT_FQCN: Readonly<Record<string, string>> = {
  HasFactory: 'Illuminate\\Database\\Eloquent\\Factories\\HasFactory',
}

export function applyStubContext(php: string, stub: StubContext): string {
  // 1. Replace namespace
  let result = php.replace(/^namespace [\w\\]+;/m, `namespace ${stub.namespace};`)

  // 2. Inject missing FQCN imports before Model import
  const missingImports = stub.existingTraits
    .filter((t) => TRAIT_FQCN[t] && !result.includes(`use ${TRAIT_FQCN[t]};`))
    .map((t) => `use ${TRAIT_FQCN[t]};`)

  if (missingImports.length > 0) {
    result = result.replace(
      'use Illuminate\\Database\\Eloquent\\Model;',
      `${missingImports.join('\n')}\nuse Illuminate\\Database\\Eloquent\\Model;`,
    )
  }

  // 3. Inject missing trait uses at top of class body
  const missingTraitUses = stub.existingTraits.filter(
    (t) => TRAIT_FQCN[t] && !result.includes(`    use ${t};`),
  )

  if (missingTraitUses.length > 0) {
    const traitBlock = missingTraitUses.map((t) => `    use ${t};`).join('\n')
    result = result.replace(/(\bextends Model\b[^{]*\{)/, `$1\n${traitBlock}`)
  }

  return result
}
```

- [ ] **Step 2: Run all `applyStubContext` tests**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts --reporter=verbose 2>&1 | head -60
```

Expected: all `applyStubContext` tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts
git commit -m "feat: [exporter] add applyStubContext for artisan stub merge"
```

---

### Task 5: Refactor `LaravelArtisanWriter.write()` and add integration tests

**Files:**
- Modify: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts`
- Modify: `src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts`

- [ ] **Step 1: Add integration tests for the full `write()` flow**

Append to `LaravelArtisanWriter.test.ts`:

```typescript
import { LaravelArtisanWriter } from './LaravelArtisanWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function makeTmpLaravelProject(stubContent: string, modelName: string): string {
  const dir = path.join(os.tmpdir(), `archivolt-test-${Date.now()}`)
  mkdirSync(path.join(dir, 'app', 'Models'), { recursive: true })
  // Simulate composer.json
  writeFileSync(
    path.join(dir, 'composer.json'),
    JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
  )
  return dir
}

describe('LaravelArtisanWriter.write() integration', () => {
  it('merges artisan stub namespace and HasFactory into rendered output', async () => {
    const tmpDir = path.join(os.tmpdir(), `archivolt-test-${Date.now()}`)
    mkdirSync(path.join(tmpDir, 'app', 'Models'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    )

    const modelFile = path.join(tmpDir, 'app', 'Models', 'User.php')

    // Mock exec: simulate artisan writing a L11-style stub
    const mockExec = async (_cmd: string, _opts: { cwd: string }) => {
      writeFileSync(
        modelFile,
        `<?php\n\nnamespace App\\Models;\n\nuse Illuminate\\Database\\Eloquent\\Factories\\HasFactory;\nuse Illuminate\\Database\\Eloquent\\Model;\n\nclass User extends Model\n{\n    use HasFactory;\n}\n`,
      )
    }

    const result: ExportResult = new Map([
      [
        'User.php',
        `<?php\n\nnamespace App\\Models;\n\nuse Illuminate\\Database\\Eloquent\\Model;\n\nclass User extends Model\n{\n    protected $table = 'users';\n\n    protected $fillable = ['name'];\n\n}\n`,
      ],
    ])

    const writer = new LaravelArtisanWriter(tmpDir, mockExec)
    await writer.write({ files: result })

    const written = readFileSync(modelFile, 'utf-8')
    expect(written).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    expect(written).toContain('    use HasFactory;')
    expect(written).toContain("protected $table = 'users';")
    expect(written).toContain("protected $fillable = ['name'];")

    rmSync(tmpDir, { recursive: true })
  })
})
```

- [ ] **Step 2: Run to verify the integration test fails**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts -t "integration" 2>&1 | grep -E '(PASS|FAIL|error)'
```

Expected: FAIL — `write()` still overwrites without merging.

- [ ] **Step 3: Refactor `LaravelArtisanWriter.write()`**

Replace the existing `write()` method body in `LaravelArtisanWriter.ts`:

```typescript
async write(result: ExportResult): Promise<void> {
  this.validateLaravelProject()

  for (const [filename, content] of result.files) {
    const modelName = filename.replace('.php', '')
    await this.exec(`php artisan make:model ${modelName}`, { cwd: this.laravelPath })

    const modelPath = path.join(this.laravelPath, 'app', 'Models', filename)
    const stubContent = readFileSync(modelPath, 'utf-8')
    const stubContext = parseStubContext(stubContent, modelPath)
    const mergedContent = applyStubContext(content, stubContext)

    writeFileSync(modelPath, mergedContent, 'utf-8')
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun test src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /Users/carl/Dev/CMG/Archivolt && bun run check
```

Expected: typecheck + lint + tests all PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.ts src/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter.test.ts
git commit -m "feat: [exporter] merge artisan stub context into Eloquent output"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Run `artisan make:model` → read stub | Task 5, `write()` refactor |
| Extract namespace via regex | Task 2, `parseStubContext` |
| Extract traits via regex | Task 2, `parseStubContext` |
| Fall back to `App\Models` on parse failure | Task 2 (nullish coalescing in impl + test) |
| Use artisan namespace in output | Task 4, `applyStubContext` namespace replace |
| Prepend existing traits (HasFactory) | Task 4, `applyStubContext` import + use inject |
| stdout/`--output` mode unchanged | No changes to `EloquentExporter` or `DirectoryWriter` |
| No changes to `IExporter` | Confirmed — `IExporter` not touched |

**Note on spec deviation:** The spec described passing `StubContext` to `EloquentExporter.renderModel()`. This plan instead patches the already-rendered PHP string inside `LaravelArtisanWriter`. The outcome is identical — the final PHP file contains the artisan namespace and traits — but without requiring changes to `EloquentExporter` or the `ExportResult` structure. This minimizes the diff and avoids coupling the writer to the exporter internals.
