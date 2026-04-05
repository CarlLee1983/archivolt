import { describe, it, expect } from 'bun:test'
import { parseStubContext, applyStubContext, type StubContext } from './LaravelArtisanWriter'

const L8_STUB = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
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

import { LaravelArtisanWriter } from './LaravelArtisanWriter'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('LaravelArtisanWriter.write() integration', () => {
  it('merges artisan stub namespace and HasFactory into rendered output', async () => {
    const tmpDir = path.join(os.tmpdir(), `archivolt-test-${Date.now()}`)
    mkdirSync(path.join(tmpDir, 'app', 'Models'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    )

    const modelFile = path.join(tmpDir, 'app', 'Models', 'User.php')

    // Mock exec: simulates artisan writing a L11-style stub
    const mockExec = async (_cmd: string, _opts: { cwd: string }) => {
      writeFileSync(
        modelFile,
        [
          '<?php',
          '',
          'namespace App\\Models;',
          '',
          'use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;',
          'use Illuminate\\Database\\Eloquent\\Model;',
          '',
          'class User extends Model',
          '{',
          '    use HasFactory;',
          '}',
          '',
        ].join('\n'),
      )
    }

    const writer = new LaravelArtisanWriter(tmpDir, mockExec)
    await writer.write({
      files: new Map([
        [
          'User.php',
          [
            '<?php',
            '',
            'namespace App\\Models;',
            '',
            'use Illuminate\\Database\\Eloquent\\Model;',
            '',
            'class User extends Model',
            '{',
            "    protected $table = 'users';",
            '',
            "    protected $fillable = ['name'];",
            '',
            '}',
            '',
          ].join('\n'),
        ],
      ]),
    })

    const written = readFileSync(modelFile, 'utf-8')
    expect(written).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    expect(written).toContain('    use HasFactory;')
    expect(written).toContain("protected $table = 'users';")
    expect(written).toContain("protected $fillable = ['name'];")

    rmSync(tmpDir, { recursive: true })
  })
})
