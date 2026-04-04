import { describe, it, expect } from 'bun:test'
import {
  createSession,
  applyIncrementalStats,
  type IncrementalStats,
} from './Session'

describe('applyIncrementalStats', () => {
  it('把 incremental stats 寫入 session', () => {
    const session = createSession({ listenPort: 13306, targetHost: 'localhost', targetPort: 3306 })
    const stats: IncrementalStats = {
      totalQueries: 5,
      byOperation: { SELECT: 3, INSERT: 2 },
      tablesAccessed: new Set(['users', 'orders']),
    }

    const updated = applyIncrementalStats(session, stats, 2)

    expect(updated.stats.totalQueries).toBe(5)
    expect(updated.stats.byOperation).toEqual({ SELECT: 3, INSERT: 2 })
    expect(updated.stats.tablesAccessed).toEqual(['orders', 'users']) // 排序後
    expect(updated.stats.connectionCount).toBe(2)
  })

  it('不修改原 session（immutable）', () => {
    const session = createSession({ listenPort: 13306, targetHost: 'localhost', targetPort: 3306 })
    const stats: IncrementalStats = {
      totalQueries: 1,
      byOperation: { SELECT: 1 },
      tablesAccessed: new Set(['users']),
    }
    applyIncrementalStats(session, stats, 1)
    expect(session.stats.totalQueries).toBe(0)
  })
})
