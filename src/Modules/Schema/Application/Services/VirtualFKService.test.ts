import { describe, it, expect } from 'bun:test'
import {
  ignoreSuggestion,
  restoreIgnored,
  confirmSuggestion,
} from './VirtualFKService'
import type { ERModel } from '@/Modules/Schema/Domain/ERModel'

function makeModel(confidence: 'manual' | 'auto-suggested' | 'ignored'): ERModel {
  return {
    source: { system: 'mysql', database: 'test', importedAt: new Date(), dbcliVersion: '1.0' },
    tables: {
      orders: {
        name: 'orders',
        columns: [{ name: 'user_id', type: 'int', nullable: 0, primaryKey: 0 }],
        rowCount: 0,
        engine: 'InnoDB',
        primaryKey: ['id'],
        foreignKeys: [],
        virtualForeignKeys: [
          { id: 'vfk_1', columns: ['user_id'], refTable: 'users', refColumns: ['id'], confidence, createdAt: new Date() },
        ],
      },
      users: {
        name: 'users', columns: [], rowCount: 0, engine: 'InnoDB', primaryKey: ['id'], foreignKeys: [], virtualForeignKeys: [],
      },
    },
    groups: {},
  }
}

describe('ignoreSuggestion', () => {
  it('should mark VFK as ignored, not delete it', () => {
    const model = makeModel('auto-suggested')
    const result = ignoreSuggestion(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('ignored')
  })
})

describe('restoreIgnored', () => {
  it('should restore ignored VFK back to auto-suggested', () => {
    const model = makeModel('ignored')
    const result = restoreIgnored(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('auto-suggested')
  })
})

describe('confirmSuggestion', () => {
  it('should mark VFK as manual', () => {
    const model = makeModel('auto-suggested')
    const result = confirmSuggestion(model, 'orders', 'vfk_1')
    const vfk = result.tables['orders'].virtualForeignKeys.find(v => v.id === 'vfk_1')
    expect(vfk).toBeDefined()
    expect(vfk!.confidence).toBe('manual')
  })
})
