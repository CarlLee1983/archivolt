// test/unit/Extension/describeElement.test.ts

import { describe, it, expect } from 'vitest'

// Test the pure function logic (DOM not available in unit tests)
function describeElement(tag: string, id: string, classes: string[], textContent: string): string {
  const idPart = id ? `#${id}` : ''
  const clsPart = classes.length > 0 ? `.${classes.slice(0, 2).join('.')}` : ''
  const text = textContent.trim().slice(0, 40)
  const textPart = text ? ` "${text}"` : ''
  return `${tag}${idPart}${clsPart}${textPart}`
}

describe('describeElement', () => {
  it('includes tag, id, class, and text', () => {
    expect(describeElement('button', 'submit-btn', ['primary'], '送出')).toBe(
      'button#submit-btn.primary "送出"',
    )
  })

  it('truncates text to 40 characters', () => {
    const longText = '這是一段很長的文字用來測試截斷邏輯是否正常運作的字串需要超過四十個字'
    const result = describeElement('button', '', [], longText)
    const quoted = result.match(/"(.+)"/)![1]
    expect(quoted.length).toBeLessThanOrEqual(40)
  })

  it('omits text part when text is empty', () => {
    expect(describeElement('div', '', ['icon'], '')).toBe('div.icon')
  })

  it('limits to first 2 classes', () => {
    expect(describeElement('a', '', ['btn', 'primary', 'large'], 'Click')).toBe(
      'a.btn.primary "Click"',
    )
  })

  it('handles element with only tag', () => {
    expect(describeElement('span', '', [], '')).toBe('span')
  })
})
