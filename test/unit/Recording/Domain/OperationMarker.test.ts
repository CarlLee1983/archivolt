import { describe, it, expect } from 'vitest'
import { createMarker } from '@/Modules/Recording/Domain/OperationMarker'

describe('createMarker', () => {
  it('creates a marker with timestamp and unique id', () => {
    const marker = createMarker({
      sessionId: 'rec_1',
      url: '/login',
      action: 'navigate',
    })
    expect(marker.id).toMatch(/^mk_/)
    expect(marker.timestamp).toBeGreaterThan(0)
    expect(marker.sessionId).toBe('rec_1')
    expect(marker.url).toBe('/login')
    expect(marker.action).toBe('navigate')
    expect(marker.target).toBeUndefined()
    expect(marker.label).toBeUndefined()
  })

  it('includes optional target and label', () => {
    const marker = createMarker({
      sessionId: 'rec_1',
      url: '/product/3',
      action: 'submit',
      target: 'form#product-form',
      label: '儲存商品',
    })
    expect(marker.target).toBe('form#product-form')
    expect(marker.label).toBe('儲存商品')
  })

  it('generates unique ids', () => {
    const a = createMarker({ sessionId: 'rec_1', url: '/', action: 'navigate' })
    const b = createMarker({ sessionId: 'rec_1', url: '/', action: 'navigate' })
    expect(a.id).not.toBe(b.id)
  })
})
