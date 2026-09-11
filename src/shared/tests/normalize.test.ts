import { describe, expect, it } from 'vitest'
import { normalizeId } from '../normalize'

describe('normalizeId', () => {
  it('remove espaços nas pontas', () => {
    expect(normalizeId('  tv-principal  ')).toBe('tv-principal')
  })

  it('baixa pra minúsculas', () => {
    expect(normalizeId('TV Principal')).toBe('tv-principal')
  })

  it('troca espaços internos por hífen', () => {
    expect(normalizeId('recnplay 2026')).toBe('recnplay-2026')
  })

  it('colapsa espaços múltiplos num único hífen', () => {
    expect(normalizeId('tv   principal')).toBe('tv-principal')
  })

  it('é idempotente', () => {
    const once = normalizeId('  TV Principal  ')
    expect(normalizeId(once)).toBe(once)
  })
})
