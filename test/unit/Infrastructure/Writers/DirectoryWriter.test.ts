import { describe, it, expect, afterEach } from 'vitest'
import { DirectoryWriter } from '@/Modules/Schema/Infrastructure/Writers/DirectoryWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('DirectoryWriter', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('writes single file to output directory', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const writer = new DirectoryWriter(tmpDir)
    const result: ExportResult = {
      files: new Map([['schema.prisma', 'model User {}']]),
    }
    await writer.write(result)
    const content = readFileSync(path.join(tmpDir, 'schema.prisma'), 'utf-8')
    expect(content).toBe('model User {}')
  })

  it('writes multiple files to output directory', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const writer = new DirectoryWriter(tmpDir)
    const result: ExportResult = {
      files: new Map([
        ['Order.php', '<?php class Order {}'],
        ['User.php', '<?php class User {}'],
      ]),
    }
    await writer.write(result)
    expect(readFileSync(path.join(tmpDir, 'Order.php'), 'utf-8')).toBe('<?php class Order {}')
    expect(readFileSync(path.join(tmpDir, 'User.php'), 'utf-8')).toBe('<?php class User {}')
  })

  it('creates output directory if it does not exist', async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'archivolt-test-'))
    const nestedDir = path.join(tmpDir, 'nested', 'output')
    const writer = new DirectoryWriter(nestedDir)
    const result: ExportResult = {
      files: new Map([['test.txt', 'hello']]),
    }
    await writer.write(result)
    expect(readFileSync(path.join(nestedDir, 'test.txt'), 'utf-8')).toBe('hello')
  })
})
