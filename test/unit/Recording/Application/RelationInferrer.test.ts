// test/unit/Recording/Application/RelationInferrer.test.ts

import { describe, it, expect } from 'vitest'
import { inferRelations } from '@/Modules/Recording/Application/Strategies/RelationInferrer'
import type { CapturedQuery } from '@/Modules/Recording/Domain/Session'

function makeQuery(sql: string, tables: string[], operation: CapturedQuery['operation'] = 'SELECT'): CapturedQuery {
  return {
    id: `q_${Date.now()}`, sessionId: 'rec_1', connectionId: 1,
    timestamp: Date.now(), duration: 5, sql, operation, tables,
  }
}

describe('inferRelations', () => {
  it('detects JOIN ON relation as high confidence', () => {
    const queries = [
      makeQuery(
        'SELECT * FROM products JOIN categories ON products.category_id = categories.id',
        ['products', 'categories'],
      ),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations).toHaveLength(1)
    expect(relations[0]).toEqual({
      sourceTable: 'products',
      sourceColumn: 'category_id',
      targetTable: 'categories',
      targetColumn: 'id',
      confidence: 'high',
      evidence: 'JOIN ON in chunk-1',
    })
  })

  it('detects WHERE IN subquery as medium confidence', () => {
    const queries = [
      makeQuery(
        'SELECT * FROM product_images WHERE product_id IN (SELECT id FROM products)',
        ['product_images', 'products'],
      ),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations.some((r) => r.confidence === 'medium')).toBe(true)
    expect(relations.some((r) => r.sourceTable === 'product_images' && r.sourceColumn === 'product_id')).toBe(true)
  })

  it('detects co-occurring tables in INSERT as low confidence', () => {
    const queries = [
      makeQuery('INSERT INTO orders (user_id, total) VALUES (1, 100)', ['orders'], 'INSERT'),
      makeQuery('INSERT INTO order_items (order_id, product_id) VALUES (1, 5)', ['order_items'], 'INSERT'),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    const lowRels = relations.filter((r) => r.confidence === 'low')
    expect(lowRels.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplicates identical relations', () => {
    const queries = [
      makeQuery('SELECT * FROM orders JOIN users ON orders.user_id = users.id', ['orders', 'users']),
      makeQuery('SELECT * FROM orders JOIN users ON orders.user_id = users.id', ['orders', 'users']),
    ]
    const relations = inferRelations(queries, 'chunk-1')
    const highRels = relations.filter((r) => r.confidence === 'high')
    expect(highRels).toHaveLength(1)
  })

  it('returns empty array for single-table queries', () => {
    const queries = [makeQuery('SELECT * FROM users WHERE id = 1', ['users'])]
    const relations = inferRelations(queries, 'chunk-1')
    expect(relations).toEqual([])
  })
})
