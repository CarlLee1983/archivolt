import { describe, it, expect } from 'vitest'
import { ExportService } from '@/Modules/Schema/Application/Services/ExportService'
import { MermaidExporter } from '@/Modules/Schema/Infrastructure/Exporters/MermaidExporter'
import { DbmlExporter } from '@/Modules/Schema/Infrastructure/Exporters/DbmlExporter'
import type { IExporter, ExportResult } from '@/Modules/Schema/Infrastructure/Exporters/IExporter'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

const emptyModel: ERModel = {
  source: {
    system: 'mysql',
    database: 'test',
    importedAt: new Date(),
    dbcliVersion: '1.0.0',
  },
  tables: {},
  groups: {},
}

const mockExporterA: IExporter = {
  name: 'format_a',
  label: 'Format A',
  export: (_model): ExportResult => ({ files: new Map([['a.txt', 'output_a']]) }),
}

const mockExporterB: IExporter = {
  name: 'format_b',
  label: 'Format B',
  export: (_model): ExportResult => ({ files: new Map([['b.txt', 'output_b']]) }),
}

describe('ExportService', () => {
  it('listFormats returns available formats', () => {
    const service = new ExportService([mockExporterA, mockExporterB])
    const formats = service.listFormats()
    expect(formats).toEqual([
      { name: 'format_a', label: 'Format A' },
      { name: 'format_b', label: 'Format B' },
    ])
  })

  it('export calls the correct exporter', () => {
    const service = new ExportService([mockExporterA, mockExporterB])
    expect(service.export(emptyModel, 'format_a').files.get('a.txt')).toBe('output_a')
    expect(service.export(emptyModel, 'format_b').files.get('b.txt')).toBe('output_b')
  })

  it('export throws if format is not found', () => {
    const service = new ExportService([mockExporterA])
    expect(() => service.export(emptyModel, 'unknown')).toThrow()
  })

  it('works with real exporters', () => {
    const service = new ExportService([new MermaidExporter(), new DbmlExporter()])
    const formats = service.listFormats()
    expect(formats.map((f) => f.name)).toContain('mermaid')
    expect(formats.map((f) => f.name)).toContain('dbml')
  })
})
