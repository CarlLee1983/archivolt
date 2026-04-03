// test/unit/Recording/Application/SqlSemanticInferrer.test.ts

import { describe, it, expect } from 'vitest'
import {
  inferSemantic,
  buildLabel,
  skeletonizeSql,
} from '@/Modules/Recording/Application/Strategies/SqlSemanticInferrer'
import type { OperationMarker } from '@/Modules/Recording/Domain/OperationMarker'

describe('skeletonizeSql', () => {
  it('replaces numeric values with ?', () => {
    expect(skeletonizeSql('SELECT * FROM users WHERE id = 123')).toBe(
      'SELECT * FROM users WHERE id = ?',
    )
  })

  it('replaces string values with ?', () => {
    expect(skeletonizeSql("INSERT INTO users (name) VALUES ('alice')")).toBe(
      'INSERT INTO users (name) VALUES (?)',
    )
  })

  it('replaces IN list with ?', () => {
    expect(skeletonizeSql('SELECT * FROM products WHERE id IN (1, 2, 3)')).toBe(
      'SELECT * FROM products WHERE id IN (?)',
    )
  })

  it('preserves table and column names', () => {
    const sql = 'SELECT users.name, orders.id FROM users JOIN orders ON users.id = orders.user_id'
    const result = skeletonizeSql(sql)
    expect(result).toContain('users.name')
    expect(result).toContain('orders.id')
    expect(result).toContain('JOIN orders ON')
  })
})

describe('inferSemantic', () => {
  it('returns SQL verb + table for single SELECT', () => {
    expect(inferSemantic(['SELECT'], ['products'])).toBe('SELECT products')
  })

  it('returns SQL verb + tables for multi-table SELECT', () => {
    expect(inferSemantic(['SELECT'], ['products', 'categories'])).toBe(
      'SELECT products, categories',
    )
  })

  it('returns SQL verb + table for INSERT', () => {
    expect(inferSemantic(['INSERT'], ['orders'])).toBe('INSERT orders')
  })

  it('joins multiple operations with semicolon', () => {
    expect(inferSemantic(['INSERT', 'UPDATE'], ['orders', 'inventory'])).toBe(
      'INSERT orders, inventory; UPDATE orders, inventory',
    )
  })

  it('deduplicates operations per table', () => {
    expect(inferSemantic(['SELECT', 'SELECT'], ['users'])).toBe('SELECT users')
  })
})

describe('buildLabel', () => {
  it('uses marker action + target when marker has target', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'request', target: 'GET /api/products',
    }
    expect(buildLabel(marker)).toBe('request GET /api/products (on /products)')
  })

  it('uses marker action + url + label when navigate with label', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'navigate', label: '商品列表 - MyShop',
    }
    expect(buildLabel(marker)).toBe('navigate /products — "商品列表 - MyShop"')
  })

  it('uses marker action + url when navigate without label', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products', action: 'navigate',
    }
    expect(buildLabel(marker)).toBe('navigate /products')
  })

  it('returns (silence-based split) for undefined marker', () => {
    expect(buildLabel(undefined)).toBe('(silence-based split)')
  })

  it('uses click target with quotes for click action', () => {
    const marker: OperationMarker = {
      id: 'mk_1', sessionId: 'rec_1', timestamp: 1000,
      url: '/products/123', action: 'click', target: 'button.add-to-cart "加入購物車"',
    }
    expect(buildLabel(marker)).toBe('click button.add-to-cart "加入購物車" (on /products/123)')
  })
})
