import { describe, it, expect } from 'vitest'
import type { Table } from '@/Modules/Schema/Domain/ERModel'
import { inferRelations } from '@/Modules/Schema/Domain/RelationInferrer'

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

describe('inferRelations', () => {
  it('should infer user_id → users', () => {
    const tables = {
      posts: makeTable('posts', ['id', 'user_id', 'title']),
      users: makeTable('users', ['id', 'name']),
    }
    const suggestions = inferRelations(tables)
    expect(suggestions).toContainEqual({
      sourceTable: 'posts',
      columns: ['user_id'],
      refTable: 'users',
      refColumns: ['id'],
    })
  })

  it('should not duplicate existing FK columns', () => {
    const tables = {
      posts: makeTable('posts', ['id', 'user_id'], [{ columns: ['user_id'], refTable: 'users' }]),
      users: makeTable('users', ['id', 'name']),
    }
    const suggestions = inferRelations(tables)
    const postsUserSuggestions = suggestions.filter(
      (s) => s.sourceTable === 'posts' && s.columns.includes('user_id'),
    )
    expect(postsUserSuggestions.length).toBe(0)
  })

  it('should skip when target table does not exist', () => {
    const tables = {
      posts: makeTable('posts', ['id', 'ghost_id']),
    }
    const suggestions = inferRelations(tables)
    expect(suggestions.length).toBe(0)
  })

  it('should infer multiple columns: user_id + category_id', () => {
    const tables = {
      posts: makeTable('posts', ['id', 'user_id', 'category_id']),
      users: makeTable('users', ['id', 'name']),
      categories: makeTable('categories', ['id', 'label']),
    }
    const suggestions = inferRelations(tables)
    const sourceTables = suggestions.filter((s) => s.sourceTable === 'posts')
    const refTables = sourceTables.map((s) => s.refTable)
    expect(refTables).toContain('users')
    expect(refTables).toContain('categories')
  })

  it('should skip self-references', () => {
    const tables = {
      categories: makeTable('categories', ['id', 'parent_id']),
    }
    // 'parent_id' → try 'parents', 'parentes', 'parent', 'parenties'
    // none of these is 'categories' so no self-ref suggestion expected
    const suggestions = inferRelations(tables)
    const selfRef = suggestions.filter(
      (s) => s.sourceTable === s.refTable,
    )
    expect(selfRef.length).toBe(0)
  })

  it('should resolve plural with -ies form (company_id → companies)', () => {
    const tables = {
      employees: makeTable('employees', ['id', 'company_id']),
      companies: makeTable('companies', ['id', 'name']),
    }
    const suggestions = inferRelations(tables)
    expect(suggestions).toContainEqual(
      expect.objectContaining({ sourceTable: 'employees', refTable: 'companies' }),
    )
  })
})
