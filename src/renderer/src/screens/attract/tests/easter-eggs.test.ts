import { describe, expect, it } from 'vitest'
import { MAZELINHA_CHANCE, MAZELINHA_MIN_SLIDES, deveCruzarMazelinha } from '../easter-eggs'

describe('deveCruzarMazelinha', () => {
  it('só a partir do mínimo de slides desde a última travessia', () => {
    expect(deveCruzarMazelinha(0, MAZELINHA_MIN_SLIDES - 1)).toBe(false)
    expect(deveCruzarMazelinha(0, 0)).toBe(false)
    expect(deveCruzarMazelinha(0, MAZELINHA_MIN_SLIDES)).toBe(true)
    expect(deveCruzarMazelinha(0, MAZELINHA_MIN_SLIDES * 10)).toBe(true)
  })

  it('o sorteio é comparado com o limite aberto no topo', () => {
    expect(deveCruzarMazelinha(0, MAZELINHA_MIN_SLIDES)).toBe(true)
    expect(deveCruzarMazelinha(0.0999, MAZELINHA_MIN_SLIDES)).toBe(true)
    expect(deveCruzarMazelinha(MAZELINHA_CHANCE, MAZELINHA_MIN_SLIDES)).toBe(false)
    expect(deveCruzarMazelinha(0.5, MAZELINHA_MIN_SLIDES)).toBe(false)
    expect(deveCruzarMazelinha(0.999, 100)).toBe(false)
  })

  it('as duas condições são necessárias ao mesmo tempo', () => {
    expect(deveCruzarMazelinha(MAZELINHA_CHANCE - 0.0001, MAZELINHA_MIN_SLIDES - 1)).toBe(false)
  })
})
