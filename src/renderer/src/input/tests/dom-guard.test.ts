import { describe, expect, it } from 'vitest'
import { isEditableTarget } from '../dom-guard'

describe('isEditableTarget', () => {
  it('null -> false', () => {
    expect(isEditableTarget(null)).toBe(false)
  })

  it.each(['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea'])('%s -> true', (tagName) => {
    expect(isEditableTarget({ tagName })).toBe(true)
  })

  it('elemento comum (DIV/BODY) -> false', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget({ tagName: 'BODY' })).toBe(false)
  })

  it('contentEditable -> true mesmo numa tag qualquer', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
})
