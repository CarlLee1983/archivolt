import { describe, it, expect } from 'vitest'
import { createVirtualFK } from '@/Modules/Schema/Domain/ERModel'

describe('createVirtualFK', () => {
  it('should produce correct structure', () => {
    const vfk = createVirtualFK(['user_id'], 'users', ['id'])
    expect(vfk.columns).toEqual(['user_id'])
    expect(vfk.refTable).toBe('users')
    expect(vfk.refColumns).toEqual(['id'])
    expect(vfk.confidence).toBe('manual')
    expect(typeof vfk.id).toBe('string')
    expect(vfk.id.startsWith('vfk_')).toBe(true)
    expect(vfk.createdAt).toBeInstanceOf(Date)
  })

  it('should generate unique ids on each call', () => {
    const vfk1 = createVirtualFK(['a_id'], 'a', ['id'])
    const vfk2 = createVirtualFK(['b_id'], 'b', ['id'])
    expect(vfk1.id).not.toBe(vfk2.id)
  })

  it('should allow confidence to be auto-suggested', () => {
    const vfk = createVirtualFK(['order_id'], 'orders', ['id'], 'auto-suggested')
    expect(vfk.confidence).toBe('auto-suggested')
  })
})
