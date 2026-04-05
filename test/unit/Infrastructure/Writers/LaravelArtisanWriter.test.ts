import { describe, it, expect, vi, afterEach } from 'vitest'
import { LaravelArtisanWriter } from '@/Modules/Schema/Infrastructure/Writers/LaravelArtisanWriter'
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
