// test/unit/Recording/Infrastructure/ManifestMarkdownRenderer.test.ts

import { describe, it, expect } from 'vitest'
import { renderManifest } from '@/Modules/Recording/Infrastructure/Renderers/ManifestMarkdownRenderer'
import type { OperationManifest } from '@/Modules/Recording/Domain/OperationManifest'

const sampleManifest: OperationManifest = {
  sessionId: 'rec_test',
  recordedAt: { start: 1712180000000, end: 1712180900000 },
  operations: [
    {
      chunkId: 'chunk_1', index: 0,
      label: 'navigate /products — "商品列表"',
      pattern: 'read',
      marker: { action: 'navigate', url: '/products', label: '商品列表' },
      tables: ['products', 'categories'],
      sqlSummaries: ['SELECT * FROM products JOIN categories ON products.category_id = categories.id LIMIT ?'],
      inferredRelations: [{ sourceTable: 'products', sourceColumn: 'category_id', targetTable: 'categories', targetColumn: 'id', confidence: 'high', evidence: 'JOIN ON in chunk_1' }],
      semantic: 'SELECT products, categories',
    },
    {
      chunkId: 'chunk_2', index: 1,
      label: 'request POST /api/orders (on /checkout)',
      pattern: 'write',
      marker: { action: 'request', url: '/checkout', target: 'POST /api/orders' },
      tables: ['orders'],
      sqlSummaries: ['INSERT INTO orders (user_id, total) VALUES (?, ?)'],
      inferredRelations: [],
      semantic: 'INSERT orders',
      requestBody: '{"productId":5}',
    },
  ],
  tableMatrix: [
    { table: 'categories', readCount: 1, writeCount: 0, operationIndices: [0] },
    { table: 'orders', readCount: 0, writeCount: 1, operationIndices: [1] },
    { table: 'products', readCount: 1, writeCount: 0, operationIndices: [0] },
  ],
  inferredRelations: [
    { sourceTable: 'products', sourceColumn: 'category_id', targetTable: 'categories', targetColumn: 'id', confidence: 'high', evidence: 'JOIN ON in chunk_1' },
  ],
  stats: { totalChunks: 2, readOps: 1, writeOps: 1, mixedOps: 0, silenceSplit: 0 },
}

describe('renderManifest', () => {
  it('produces valid markdown with session header', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('# Operation Manifest — Session: rec_test')
    expect(md).toContain('Chunks: 2')
    expect(md).toContain('Tables: 3')
  })

  it('includes operation sections with correct labels', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('### 1. navigate /products — "商品列表"')
    expect(md).toContain('### 2. request POST /api/orders (on /checkout)')
  })

  it('includes SQL summaries', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('SELECT * FROM products JOIN categories')
    expect(md).toContain('INSERT INTO orders')
  })

  it('includes request body for write operations', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('**Request Body**: `{"productId":5}`')
  })

  it('includes table involvement matrix', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('## Table Involvement Matrix')
    expect(md).toContain('| products |')
    expect(md).toContain('| orders |')
  })

  it('includes inferred relations table', () => {
    const md = renderManifest(sampleManifest)
    expect(md).toContain('## Inferred Relations')
    expect(md).toContain('products')
    expect(md).toContain('category_id')
    expect(md).toContain('high')
  })

  it('includes parseable JSON block at the end', () => {
    const md = renderManifest(sampleManifest)
    const jsonMatch = md.match(/```json\n([\s\S]+?)\n```/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1])
    expect(parsed.sessionId).toBe('rec_test')
    expect(parsed.stats.totalChunks).toBe(2)
  })
})
