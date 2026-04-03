// test/unit/Recording/Application/QueryAnalyzer.test.ts

import { describe, it, expect } from 'vitest'
import { analyzeQuery } from '@/Modules/Recording/Application/Services/QueryAnalyzer'

describe('analyzeQuery', () => {
  describe('operation detection', () => {
    it('detects SELECT', () => {
      const result = analyzeQuery('SELECT * FROM users WHERE id = 1')
      expect(result.operation).toBe('SELECT')
    })

    it('detects INSERT', () => {
      const result = analyzeQuery('INSERT INTO orders (user_id) VALUES (1)')
      expect(result.operation).toBe('INSERT')
    })

    it('detects UPDATE', () => {
      const result = analyzeQuery('UPDATE users SET name = "bob" WHERE id = 1')
      expect(result.operation).toBe('UPDATE')
    })

    it('detects DELETE', () => {
      const result = analyzeQuery('DELETE FROM orders WHERE id = 1')
      expect(result.operation).toBe('DELETE')
    })

    it('detects OTHER for SET statements', () => {
      const result = analyzeQuery('SET NAMES utf8mb4')
      expect(result.operation).toBe('OTHER')
    })

    it('handles case insensitivity', () => {
      const result = analyzeQuery('select * from users')
      expect(result.operation).toBe('SELECT')
    })

    it('handles leading whitespace', () => {
      const result = analyzeQuery('  SELECT * FROM users')
      expect(result.operation).toBe('SELECT')
    })
  })

  describe('table extraction', () => {
    it('extracts table from SELECT ... FROM', () => {
      const result = analyzeQuery('SELECT * FROM users WHERE id = 1')
      expect(result.tables).toEqual(['users'])
    })

    it('extracts table from INSERT INTO', () => {
      const result = analyzeQuery('INSERT INTO orders (user_id) VALUES (1)')
      expect(result.tables).toEqual(['orders'])
    })

    it('extracts table from UPDATE', () => {
      const result = analyzeQuery('UPDATE users SET name = "bob"')
      expect(result.tables).toEqual(['users'])
    })

    it('extracts table from DELETE FROM', () => {
      const result = analyzeQuery('DELETE FROM orders WHERE id = 1')
      expect(result.tables).toEqual(['orders'])
    })

    it('extracts multiple tables from JOIN', () => {
      const result = analyzeQuery('SELECT u.name, o.id FROM users u JOIN orders o ON u.id = o.user_id')
      expect(result.tables).toContain('users')
      expect(result.tables).toContain('orders')
    })

    it('handles backtick-quoted table names', () => {
      const result = analyzeQuery('SELECT * FROM `user-data` WHERE id = 1')
      expect(result.tables).toEqual(['user-data'])
    })

    it('strips schema prefix from table names', () => {
      const result = analyzeQuery('SELECT * FROM mydb.users')
      expect(result.tables).toEqual(['users'])
    })

    it('returns empty array for unparseable queries', () => {
      const result = analyzeQuery('SET NAMES utf8mb4')
      expect(result.tables).toEqual([])
    })
  })

  describe('transaction detection', () => {
    it('detects BEGIN', () => {
      expect(analyzeQuery('BEGIN').isTransaction).toBe(true)
    })

    it('detects START TRANSACTION', () => {
      expect(analyzeQuery('START TRANSACTION').isTransaction).toBe(true)
    })

    it('detects COMMIT', () => {
      expect(analyzeQuery('COMMIT').isTransaction).toBe(true)
    })

    it('detects ROLLBACK', () => {
      expect(analyzeQuery('ROLLBACK').isTransaction).toBe(true)
    })

    it('returns false for regular queries', () => {
      expect(analyzeQuery('SELECT 1').isTransaction).toBe(false)
    })
  })

  describe('schema change detection', () => {
    it('detects ALTER TABLE', () => {
      expect(analyzeQuery('ALTER TABLE users ADD COLUMN email VARCHAR(255)').isSchemaChange).toBe(true)
    })

    it('detects CREATE TABLE', () => {
      expect(analyzeQuery('CREATE TABLE logs (id INT)').isSchemaChange).toBe(true)
    })

    it('detects DROP TABLE', () => {
      expect(analyzeQuery('DROP TABLE temp_data').isSchemaChange).toBe(true)
    })

    it('returns false for DML', () => {
      expect(analyzeQuery('SELECT 1').isSchemaChange).toBe(false)
    })
  })
})
