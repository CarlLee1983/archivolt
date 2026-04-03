// test/unit/Extension/isApiUrl.test.ts

import { describe, it, expect } from 'vitest'

function isApiUrl(url: string, origin: string = 'http://localhost:3000'): boolean {
  try {
    const pathname = new URL(url, origin).pathname
    return pathname.startsWith('/api/') || pathname.startsWith('/graphql')
  } catch {
    return false
  }
}

describe('isApiUrl', () => {
  it('returns true for /api/ paths', () => {
    expect(isApiUrl('/api/products')).toBe(true)
  })

  it('returns true for /api/ with nested paths', () => {
    expect(isApiUrl('/api/products/123/reviews')).toBe(true)
  })

  it('returns true for /graphql', () => {
    expect(isApiUrl('/graphql')).toBe(true)
  })

  it('returns false for static assets', () => {
    expect(isApiUrl('/static/logo.png')).toBe(false)
  })

  it('returns false for regular page paths', () => {
    expect(isApiUrl('/products')).toBe(false)
  })

  it('returns false for root', () => {
    expect(isApiUrl('/')).toBe(false)
  })

  it('handles full URLs', () => {
    expect(isApiUrl('http://localhost:3000/api/users')).toBe(true)
  })

  it('returns false for malformed URLs', () => {
    expect(isApiUrl('')).toBe(false)
  })
})
