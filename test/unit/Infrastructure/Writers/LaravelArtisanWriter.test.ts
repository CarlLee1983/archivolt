import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  LaravelArtisanWriter,
  parseStubContext,
  applyStubContext,
  type StubContext,
} from '@/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('LaravelArtisanWriter', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  function setupFakeLaravel(): string {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    )
    writeFileSync(path.join(tmpDir, 'artisan'), '#!/usr/bin/env php')
    mkdirSync(path.join(tmpDir, 'app', 'Models'), { recursive: true })
    return tmpDir
  }

  it('throws if composer.json is missing', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    const writer = new LaravelArtisanWriter(tmpDir)
    const result: ExportResult = { files: new Map([['User.php', '<?php']]) }
    await expect(writer.write(result)).rejects.toThrow('Not a Laravel project')
  })

  it('throws if laravel/framework is not in composer.json', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-laravel-'))
    writeFileSync(path.join(tmpDir, 'composer.json'), JSON.stringify({ require: {} }))
    const writer = new LaravelArtisanWriter(tmpDir)
    const result: ExportResult = { files: new Map([['User.php', '<?php']]) }
    await expect(writer.write(result)).rejects.toThrow('Not a Laravel project')
  })

  function makeArtisanStub(laravelPath: string, modelName: string): void {
    writeFileSync(
      path.join(laravelPath, 'app', 'Models', `${modelName}.php`),
      `<?php\n\nnamespace App\\Models;\n\nuse Illuminate\\Database\\Eloquent\\Model;\n\nclass ${modelName} extends Model\n{\n}\n`,
    )
  }

  it('runs artisan make:model and writes merged content', async () => {
    const laravelPath = setupFakeLaravel()
    const mockExec = vi.fn().mockImplementation(async (_cmd: string) => {
      makeArtisanStub(laravelPath, 'Order')
    })
    const writer = new LaravelArtisanWriter(laravelPath, mockExec)
    const renderedPhp = [
      '<?php',
      '',
      'namespace App\\Models;',
      '',
      'use Illuminate\\Database\\Eloquent\\Model;',
      '',
      'class Order extends Model',
      '{',
      "    protected $table = 'orders';",
      '}',
      '',
    ].join('\n')
    const result: ExportResult = {
      files: new Map([['Order.php', renderedPhp]]),
    }
    await writer.write(result)
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('php artisan make:model Order'),
      expect.objectContaining({ cwd: laravelPath }),
    )
    const content = readFileSync(path.join(laravelPath, 'app', 'Models', 'Order.php'), 'utf-8')
    expect(content).toContain("protected $table = 'orders';")
  })

  it('processes multiple models', async () => {
    const laravelPath = setupFakeLaravel()
    const mockExec = vi.fn().mockImplementation(async (cmd: string) => {
      const match = cmd.match(/make:model (\w+)/)
      if (match) makeArtisanStub(laravelPath, match[1])
    })
    const writer = new LaravelArtisanWriter(laravelPath, mockExec)
    const makePhp = (name: string, table: string) =>
      [
        '<?php',
        '',
        'namespace App\\Models;',
        '',
        'use Illuminate\\Database\\Eloquent\\Model;',
        '',
        `class ${name} extends Model`,
        '{',
        `    protected $table = '${table}';`,
        '}',
        '',
      ].join('\n')
    const result: ExportResult = {
      files: new Map([
        ['Order.php', makePhp('Order', 'orders')],
        ['User.php', makePhp('User', 'users')],
      ]),
    }
    await writer.write(result)
    expect(mockExec).toHaveBeenCalledTimes(2)
    expect(readFileSync(path.join(laravelPath, 'app', 'Models', 'Order.php'), 'utf-8')).toContain(
      "protected $table = 'orders';",
    )
    expect(readFileSync(path.join(laravelPath, 'app', 'Models', 'User.php'), 'utf-8')).toContain(
      "protected $table = 'users';",
    )
  })
})

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
    expect(parseStubContext(L8_STUB, '/path/to/User.php').namespace).toBe('App\\Models')
  })

  it('extracts HasFactory trait from L8 stub', () => {
    expect(parseStubContext(L8_STUB, '/path/to/User.php').existingTraits).toContain('HasFactory')
  })

  it('extracts custom namespace', () => {
    expect(parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php').namespace).toBe('App\\Domain\\Models')
  })

  it('returns empty traits when class body has none', () => {
    expect(parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php').existingTraits).toHaveLength(0)
  })

  it('stores filePath', () => {
    expect(parseStubContext(L8_STUB, '/var/www/app/Models/User.php').filePath).toBe('/var/www/app/Models/User.php')
  })

  it('falls back to App\\Models when namespace regex fails', () => {
    expect(parseStubContext('<?php // no namespace', '/path/file.php').namespace).toBe('App\\Models')
  })
})

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
    const ctx: StubContext = { namespace: 'App\\Domain\\Models', existingTraits: [], filePath: '/any' }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('namespace App\\Domain\\Models;')
    expect(result).not.toContain('namespace App\\Models;')
  })

  it('keeps namespace unchanged when stub has same namespace', () => {
    const ctx: StubContext = { namespace: 'App\\Models', existingTraits: [], filePath: '/any' }
    expect(applyStubContext(BASE_PHP, ctx)).toContain('namespace App\\Models;')
  })

  it('injects HasFactory import before Model import', () => {
    const ctx: StubContext = { namespace: 'App\\Models', existingTraits: ['HasFactory'], filePath: '/any' }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    const factoryIdx = result.indexOf('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    const modelIdx = result.indexOf('use Illuminate\\Database\\Eloquent\\Model;')
    expect(factoryIdx).toBeLessThan(modelIdx)
  })

  it('injects use HasFactory in class body', () => {
    const ctx: StubContext = { namespace: 'App\\Models', existingTraits: ['HasFactory'], filePath: '/any' }
    expect(applyStubContext(BASE_PHP, ctx)).toContain('    use HasFactory;')
  })

  it('does not duplicate HasFactory import if already present', () => {
    const phpWithFactory = BASE_PHP.replace(
      'use Illuminate\\Database\\Eloquent\\Model;',
      'use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;\nuse Illuminate\\Database\\Eloquent\\Model;'
    )
    const ctx: StubContext = { namespace: 'App\\Models', existingTraits: ['HasFactory'], filePath: '/any' }
    const count = (applyStubContext(phpWithFactory, ctx).match(/HasFactory/g) ?? []).length
    expect(count).toBe(2)
  })

  it('ignores unknown traits with no FQCN mapping', () => {
    const ctx: StubContext = { namespace: 'App\\Models', existingTraits: ['SomeCustomTrait'], filePath: '/any' }
    expect(applyStubContext(BASE_PHP, ctx)).not.toContain('SomeCustomTrait')
  })

  it('combines namespace replacement and trait injection', () => {
    const ctx: StubContext = { namespace: 'App\\Admin\\Models', existingTraits: ['HasFactory'], filePath: '/any' }
    const result = applyStubContext(BASE_PHP, ctx)
    expect(result).toContain('namespace App\\Admin\\Models;')
    expect(result).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;')
    expect(result).toContain('    use HasFactory;')
  })
})
