import { describe, it, expect } from 'vitest'
import { parseExportArgs, resolveWriter } from '@/CLI/ExportCommand'

describe('parseExportArgs', () => {
  it('parses format from first positional arg', () => {
    const args = parseExportArgs(['export', 'prisma'])
    expect(args.format).toBe('prisma')
  })

  it('parses --output flag', () => {
    const args = parseExportArgs(['export', 'mermaid', '--output', './out'])
    expect(args.format).toBe('mermaid')
    expect(args.output).toBe('./out')
  })

  it('parses --laravel flag', () => {
    const args = parseExportArgs(['export', 'eloquent', '--laravel', '/path/to/laravel'])
    expect(args.format).toBe('eloquent')
    expect(args.laravel).toBe('/path/to/laravel')
  })

  it('throws if format is missing', () => {
    expect(() => parseExportArgs(['export'])).toThrow()
  })

  it('throws if --laravel used with non-eloquent format', () => {
    expect(() => parseExportArgs(['export', 'prisma', '--laravel', '/path'])).toThrow('--laravel can only be used with eloquent format')
  })

  it('throws if --laravel and --output both specified', () => {
    expect(() => parseExportArgs(['export', 'eloquent', '--laravel', '/path', '--output', './out'])).toThrow('--laravel and --output are mutually exclusive')
  })
})

describe('resolveWriter', () => {
  it('returns StdoutWriter when no flags', () => {
    const writer = resolveWriter({})
    expect(writer.constructor.name).toBe('StdoutWriter')
  })

  it('returns DirectoryWriter when --output', () => {
    const writer = resolveWriter({ output: './out' })
    expect(writer.constructor.name).toBe('DirectoryWriter')
  })

  it('returns LaravelArtisanWriter when --laravel', () => {
    const writer = resolveWriter({ laravel: '/path' })
    expect(writer.constructor.name).toBe('LaravelArtisanWriter')
  })
})
