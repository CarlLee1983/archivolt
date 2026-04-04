import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseDdlSchema } from '@/Modules/Recording/Application/Strategies/DdlSchemaParser'

const SIMPLE_DDL = `
CREATE TABLE \`users\` (
  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
  \`email\` varchar(255) NOT NULL,
  \`name\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`users_email_unique\` (\`email\`),
  KEY \`users_name_index\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

const COMPOSITE_DDL = `
CREATE TABLE \`orders\` (
  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
  \`user_id\` bigint(20) NOT NULL,
  \`status\` varchar(50) NOT NULL,
  \`created_at\` timestamp NULL,
  PRIMARY KEY (\`id\`),
  KEY \`orders_user_status_index\` (\`user_id\`, \`status\`)
) ENGINE=InnoDB;
`

const EXTERNAL_INDEX_DDL = `
CREATE TABLE \`products\` (
  \`id\` int NOT NULL,
  \`sku\` varchar(50) NOT NULL,
  PRIMARY KEY (\`id\`)
);

CREATE INDEX idx_products_sku ON products(sku);
`

describe('parseDdlSchema', () => {
  it('parses table name', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    expect(schema.tables).toHaveLength(1)
    expect(schema.tables[0].name).toBe('users')
  })

  it('parses PRIMARY KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    expect(schema.tables[0].primaryKey).toEqual(['id'])
  })

  it('parses UNIQUE KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    const unique = schema.tables[0].indexes.find((i) => i.unique)
    expect(unique?.columns).toEqual(['email'])
  })

  it('parses regular KEY', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    const idx = schema.tables[0].indexes.find((i) => i.name === 'users_name_index')
    expect(idx?.columns).toEqual(['name'])
    expect(idx?.unique).toBe(false)
  })

  it('parses composite index column order', () => {
    const schema = parseDdlSchema(COMPOSITE_DDL)
    const idx = schema.tables[0].indexes.find((i) => i.name === 'orders_user_status_index')
    expect(idx?.columns).toEqual(['user_id', 'status'])
  })

  it('parses external CREATE INDEX', () => {
    const schema = parseDdlSchema(EXTERNAL_INDEX_DDL)
    const tbl = schema.tables.find((t) => t.name === 'products')
    const idx = tbl?.indexes.find((i) => i.name === 'idx_products_sku')
    expect(idx?.columns).toEqual(['sku'])
  })

  it('returns empty tables for empty input', () => {
    expect(parseDdlSchema('').tables).toHaveLength(0)
  })

  it('strips backtick identifiers', () => {
    const schema = parseDdlSchema(SIMPLE_DDL)
    expect(schema.tables[0].name).not.toContain('`')
    schema.tables[0].indexes.forEach((idx) => {
      idx.columns.forEach((col) => expect(col).not.toContain('`'))
    })
  })
})

const loadFixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../../fixtures/ddl', name), 'utf-8')

describe('parseDdlSchema — real-world corpus fixtures', () => {
  it('parses laravel ecommerce DDL without crashing', () => {
    const schema = parseDdlSchema(loadFixture('laravel_ecommerce.sql'))
    expect(schema.tables.map((t) => t.name)).toContain('users')
    expect(schema.tables.map((t) => t.name)).toContain('orders')
    const orders = schema.tables.find((t) => t.name === 'orders')
    expect(orders?.indexes.some((i) => i.columns[0] === 'user_id')).toBe(true)
    expect(orders?.indexes.some((i) => i.columns.includes('status'))).toBe(true)
  })

  it('parses rails blog DDL with composite primary key', () => {
    const schema = parseDdlSchema(loadFixture('rails_blog.sql'))
    const postTags = schema.tables.find((t) => t.name === 'post_tags')
    expect(postTags?.primaryKey).toEqual(['post_id', 'tag_id'])
  })

  it('parses charset/collation DDL without errors', () => {
    const schema = parseDdlSchema(loadFixture('mysql_charset_collation.sql'))
    const sessions = schema.tables.find((t) => t.name === 'sessions')
    expect(sessions?.indexes.some((i) => i.name === 'sessions_user_id_index')).toBe(true)
  })

  it('parses composite indexes and external CREATE INDEX', () => {
    const schema = parseDdlSchema(loadFixture('composite_indexes.sql'))
    const logs = schema.tables.find((t) => t.name === 'audit_logs')
    expect(logs?.indexes.find((i) => i.name === 'audit_logs_user_action_index')?.columns).toEqual(['user_id', 'action'])
    expect(logs?.indexes.find((i) => i.name === 'idx_audit_logs_unique_key')?.unique).toBe(true)
  })

  it('parses WordPress-style prefix tables', () => {
    const schema = parseDdlSchema(loadFixture('wordpress_core.sql'))
    expect(schema.tables.find((t) => t.name === 'wp_posts')).toBeDefined()
  })
})
