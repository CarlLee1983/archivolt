import { describe, it, expect, vi } from 'vitest'
import { StdoutWriter } from '@/Modules/Schema/Infrastructure/Writers/StdoutWriter'
import type { ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'

describe('StdoutWriter', () => {
  it('writes single file content to stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writer = new StdoutWriter()
    const result: ExportResult = {
      files: new Map([['schema.prisma', 'model User {\n  id Int @id\n}']]),
    }

    await writer.write(result)

    expect(writeSpy).toHaveBeenCalledWith('model User {\n  id Int @id\n}\n')
    writeSpy.mockRestore()
  })

  it('writes multiple files separated by delimiter', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writer = new StdoutWriter()
    const result: ExportResult = {
      files: new Map([
        ['Order.php', '<?php class Order {}'],
        ['User.php', '<?php class User {}'],
      ]),
    }

    await writer.write(result)

    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('<?php class Order {}')
    expect(output).toContain('<?php class User {}')
    writeSpy.mockRestore()
  })
})
