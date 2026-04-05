import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExplainRow } from '@/Modules/Recording/Application/Services/ExplainAnalyzer'

// Mock pg module before importing the adapter
const mockRelease = vi.fn()
const mockClientQuery = vi.fn()
const mockEnd = vi.fn()

// pool.connect() returns a client with query() and release()
const mockConnect = vi.fn(() => Promise.resolve({
  query: mockClientQuery,
  release: mockRelease,
}))

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    connect: mockConnect,
    end: mockEnd,
  })),
}))

// Import after mock is set up
const { PostgresExplainAdapter } = await import('@/Modules/Recording/Application/Services/PostgresExplainAdapter')

function makePgResult(plan: object) {
  return { rows: [{ 'QUERY PLAN': [{ Plan: plan }] }] }
}

// explain() calls: BEGIN READ ONLY, EXPLAIN ..., COMMIT
// mockClientQuery returns the EXPLAIN result on the second call
function setupExplainMock(plan: object) {
  mockClientQuery
    .mockResolvedValueOnce({})            // BEGIN READ ONLY
    .mockResolvedValueOnce(makePgResult(plan))  // EXPLAIN
    .mockResolvedValueOnce({})            // COMMIT
}

describe('PostgresExplainAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease })
    mockEnd.mockResolvedValue(undefined)
  })

  it('maps Seq Scan to type ALL', async () => {
    setupExplainMock({ 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Plan Rows': 50000, 'Filter': 'id = 1' })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT * FROM users WHERE id = 1')
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('ALL')
    expect(rows[0].table).toBe('users')
    expect(rows[0].rows).toBe(50000)
    expect(rows[0].extra).toBe('id = 1')
    await adapter.close()
  })

  it('maps Index Scan to type ref', async () => {
    setupExplainMock({ 'Node Type': 'Index Scan', 'Relation Name': 'orders', 'Index Name': 'idx_orders_user_id', 'Plan Rows': 10, 'Index Cond': 'user_id = 42' })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT * FROM orders WHERE user_id = 42')
    expect(rows[0].type).toBe('ref')
    expect(rows[0].key).toBe('idx_orders_user_id')
    await adapter.close()
  })

  it('maps Bitmap Heap Scan to type range', async () => {
    setupExplainMock({
      'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'products', 'Plan Rows': 500,
      'Plans': [{ 'Node Type': 'Bitmap Index Scan', 'Index Name': 'idx_products_category', 'Plan Rows': 500 }],
    })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT * FROM products WHERE category = $1')
    const heapRow = rows.find((r: ExplainRow) => r.table === 'products')
    expect(heapRow?.type).toBe('range')
    const indexRow = rows.find((r: ExplainRow) => r.type === 'other')
    expect(indexRow).toBeUndefined()
    await adapter.close()
  })

  it('skips nodes without Relation Name (Gather, Sort, Aggregate)', async () => {
    setupExplainMock({
      'Node Type': 'Aggregate', 'Plan Rows': 1,
      'Plans': [{ 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 100000 }],
    })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT count(*) FROM orders')
    expect(rows).toHaveLength(1)
    expect(rows[0].table).toBe('orders')
    await adapter.close()
  })

  it('walks nested Plans recursively', async () => {
    setupExplainMock({
      'Node Type': 'Hash Join', 'Plan Rows': 100,
      'Plans': [
        { 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Plan Rows': 1000 },
        { 'Node Type': 'Hash', 'Plan Rows': 200, 'Plans': [
          { 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 5000 },
        ]},
      ],
    })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT * FROM users JOIN orders ON true')
    expect(rows).toHaveLength(2)
    expect(rows.map((r: ExplainRow) => r.table)).toEqual(expect.arrayContaining(['users', 'orders']))
    await adapter.close()
  })

  it('close() calls pool.end()', async () => {
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    await adapter.close()
    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it('possibleKeys is always null (PostgreSQL has no equivalent)', async () => {
    setupExplainMock({ 'Node Type': 'Index Scan', 'Relation Name': 'users', 'Plan Rows': 1 })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    const rows = await adapter.explain('SELECT * FROM users WHERE id = 1')
    expect(rows[0].possibleKeys).toBeNull()
    await adapter.close()
  })

  it('wraps EXPLAIN in BEGIN READ ONLY / COMMIT transaction', async () => {
    setupExplainMock({ 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Plan Rows': 1 })
    const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
    await adapter.explain('SELECT 1')
    const calls = mockClientQuery.mock.calls.map((c) => String(c[0]))
    expect(calls[0]).toBe('BEGIN READ ONLY')
    expect(calls[2]).toBe('COMMIT')
    await adapter.close()
  })

  describe('assertSafeForExplain', () => {
    it('rejects INSERT statements', async () => {
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain("INSERT INTO t VALUES (1)")).rejects.toThrow('refusing to EXPLAIN non-read statement')
      await adapter.close()
    })

    it('rejects UPDATE statements', async () => {
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain('UPDATE t SET x=1 WHERE id=1')).rejects.toThrow('refusing to EXPLAIN non-read statement')
      await adapter.close()
    })

    it('rejects DELETE statements', async () => {
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain('DELETE FROM t WHERE id=1')).rejects.toThrow('refusing to EXPLAIN non-read statement')
      await adapter.close()
    })

    it('rejects statements containing semicolons', async () => {
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain('SELECT 1; DROP TABLE users')).rejects.toThrow('semicolon')
      await adapter.close()
    })

    it('accepts SELECT', async () => {
      setupExplainMock({ 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Plan Rows': 1 })
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain('SELECT * FROM users')).resolves.toBeDefined()
      await adapter.close()
    })

    it('accepts WITH (CTE)', async () => {
      setupExplainMock({ 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Plan Rows': 1 })
      const adapter = await PostgresExplainAdapter.connect('postgresql://localhost/test', 5)
      await expect(adapter.explain('WITH cte AS (SELECT 1) SELECT * FROM cte')).resolves.toBeDefined()
      await adapter.close()
    })
  })
})
