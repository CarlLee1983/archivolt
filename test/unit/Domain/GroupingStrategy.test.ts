import { describe, it, expect } from 'vitest'
import type { Table } from '@/Modules/Schema/Domain/ERModel'
import type { SuggestedRelation } from '@/Modules/Schema/Domain/RelationInferrer'
import { computeGroups, mergeGroupsForReimport } from '@/Modules/Schema/Domain/GroupingStrategy'

function makeTable(
  name: string,
  columnNames: string[],
  fks: { columns: string[]; refTable: string }[] = [],
): Table {
  return {
    name,
    columns: columnNames.map((n) => ({
      name: n,
      type: 'bigint(20)',
      nullable: 1 as const,
      primaryKey: (n === 'id' ? 1 : 0) as 0 | 1,
    })),
    rowCount: 100,
    engine: 'InnoDB',
    primaryKey: ['id'],
    foreignKeys: fks.map((fk, i) => ({
      name: `${name}_fk_${i}`,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: ['id'],
    })),
    virtualForeignKeys: [],
  }
}

describe('computeGroups', () => {
  it('should put FK-linked tables in the same group', () => {
    const tables = {
      posts: makeTable('posts', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
      users: makeTable('users', ['id', 'name']),
    }
    const groups = computeGroups(tables, [])
    const groupValues = Object.values(groups)
    const groupWithPosts = groupValues.find((g) => g.tables.includes('posts'))
    const groupWithUsers = groupValues.find((g) => g.tables.includes('users'))
    expect(groupWithPosts).toBeDefined()
    expect(groupWithUsers).toBeDefined()
    expect(groupWithPosts?.name).toBe(groupWithUsers?.name)
  })

  it('should group tables with common prefix (chat_room_* → "Chat Room")', () => {
    const tables = {
      chat_room_messages: makeTable('chat_room_messages', ['id', 'content']),
      chat_room_members: makeTable('chat_room_members', ['id', 'user_id']),
    }
    const groups = computeGroups(tables, [])
    const groupValues = Object.values(groups)
    const groupWithMessages = groupValues.find((g) =>
      g.tables.includes('chat_room_messages'),
    )
    const groupWithMembers = groupValues.find((g) =>
      g.tables.includes('chat_room_members'),
    )
    expect(groupWithMessages).toBeDefined()
    expect(groupWithMembers).toBeDefined()
    expect(groupWithMessages?.name).toBe(groupWithMembers?.name)
    expect(groupWithMessages?.name).toBe('Chat Room')
  })

  it('should use suggested relations for grouping', () => {
    const tables = {
      orders: makeTable('orders', ['id', 'customer_id']),
      customers: makeTable('customers', ['id', 'name']),
    }
    const suggestions: SuggestedRelation[] = [
      { sourceTable: 'orders', columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] },
    ]
    const groups = computeGroups(tables, suggestions)
    const groupValues = Object.values(groups)
    const groupWithOrders = groupValues.find((g) => g.tables.includes('orders'))
    const groupWithCustomers = groupValues.find((g) => g.tables.includes('customers'))
    expect(groupWithOrders?.name).toBe(groupWithCustomers?.name)
  })

  it('should put isolated tables in "未分類"', () => {
    const tables = {
      config: makeTable('config', ['id', 'key', 'value']),
      migrations: makeTable('migrations', ['id', 'name']),
    }
    const groups = computeGroups(tables, [])
    const ungrouped = groups['未分類']
    expect(ungrouped).toBeDefined()
    expect(ungrouped.tables).toContain('config')
    expect(ungrouped.tables).toContain('migrations')
  })

  it('should handle empty tables', () => {
    const groups = computeGroups({}, [])
    expect(Object.keys(groups).length).toBe(0)
  })

  it('should prevent hub tables from merging unrelated groups', () => {
    // "users" is referenced by 6 different tables across 3 domains
    // Without hub detection, all would merge into one giant group
    const tables = {
      users: makeTable('users', ['id', 'name']),
      // Domain A: orders
      orders: makeTable('orders', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
      order_items: makeTable('order_items', ['id', 'order_id'], [{ columns: ['order_id'], refTable: 'orders' }]),
      // Domain B: posts
      posts: makeTable('posts', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
      post_comments: makeTable('post_comments', ['id', 'post_id'], [{ columns: ['post_id'], refTable: 'posts' }]),
      // Domain C: payments
      payments: makeTable('payments', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
      payment_logs: makeTable('payment_logs', ['id', 'payment_id'], [{ columns: ['payment_id'], refTable: 'payments' }]),
    }

    // Create suggestions to push users above hub threshold
    const suggestions: SuggestedRelation[] = [
      { sourceTable: 'order_items', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      { sourceTable: 'post_comments', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
      { sourceTable: 'payment_logs', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
    ]

    const groups = computeGroups(tables, suggestions)
    const allGroups = Object.values(groups)

    // Should NOT have a single group with all 7 tables
    const maxGroupSize = Math.max(...allGroups.map((g) => g.tables.length))
    expect(maxGroupSize).toBeLessThan(7)

    // orders and order_items should be together
    const orderGroup = allGroups.find((g) => g.tables.includes('orders'))
    expect(orderGroup?.tables).toContain('order_items')

    // posts and post_comments should be together
    const postGroup = allGroups.find((g) => g.tables.includes('posts'))
    expect(postGroup?.tables).toContain('post_comments')
  })

  it('should split oversized groups by prefix', () => {
    // Create 25 tables that would all merge via FK chains
    const tables: Record<string, Table> = {}
    const names: string[] = []
    for (let i = 0; i < 25; i++) {
      const prefix = i < 10 ? 'user' : 'order'
      const name = `${prefix}_table_${i}`
      names.push(name)
      const fks = i > 0 && i !== 10
        ? [{ columns: [`ref_id`], refTable: names[i - 1] }]
        : []
      tables[name] = makeTable(name, ['id', 'ref_id'], fks)
    }

    const groups = computeGroups(tables, [])
    const allGroups = Object.values(groups)

    // No group should exceed MAX_GROUP_SIZE (20)
    for (const g of allGroups) {
      expect(g.tables.length).toBeLessThanOrEqual(20)
    }
  })
})

describe('mergeGroupsForReimport', () => {
  const tables: Record<string, Table> = {
    orders: { name: 'orders', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    users: { name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    products: { name: 'products', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
    logs: { name: 'logs', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [] },
  }

  it('preserves locked groups and recomputes the rest', () => {
    const existingGroups = {
      '訂單': { name: '訂單', tables: ['orders'], auto: false },
      'Auto': { name: 'Auto', tables: ['users', 'products'], auto: true },
    }
    const result = mergeGroupsForReimport(tables, existingGroups, [])
    expect(result['訂單']).toBeDefined()
    expect(result['訂單'].tables).toContain('orders')
    expect(result['訂單'].auto).toBe(false)
    // orders should NOT appear in auto groups
    const autoTables = Object.values(result).filter(g => g.auto).flatMap(g => [...g.tables])
    expect(autoTables).not.toContain('orders')
  })

  it('drops locked tables that no longer exist', () => {
    const existingGroups = {
      '手動': { name: '手動', tables: ['orders', 'deleted_table'], auto: false },
    }
    const result = mergeGroupsForReimport(tables, existingGroups, [])
    expect(result['手動'].tables).toContain('orders')
    expect(result['手動'].tables).not.toContain('deleted_table')
  })
})
