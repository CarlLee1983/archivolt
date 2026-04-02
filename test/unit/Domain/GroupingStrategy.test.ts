import { describe, it, expect } from 'vitest'
import type { Table } from '@/Modules/Schema/Domain/ERModel'
import type { SuggestedRelation } from '@/Modules/Schema/Domain/RelationInferrer'
import { computeGroups } from '@/Modules/Schema/Domain/GroupingStrategy'

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
})
