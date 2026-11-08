import { describe, expect, it } from 'vitest'
import { promptIcones, promptSet } from '../prompts'

describe('promptSet', () => {
  it('Controle usa a família do Setup; teclado e mouse ignoram a família', () => {
    expect(promptSet('controle', 'playstation')).toBe('playstation')
    expect(promptSet('teclado', 'playstation')).toBe('teclado')
    expect(promptSet('mouse', 'xbox')).toBe('mouse')
  })
})

describe('promptIcones', () => {
  it('confirmar/voltar seguem o botão 0/1 do Gamepad API: A/B no Xbox, Cross/Circle no PlayStation', () => {
    expect(promptIcones('xbox', 'confirmar')).toEqual(['xbox_a_color_light'])
    expect(promptIcones('xbox', 'voltar')).toEqual(['xbox_b_color_light'])
    expect(promptIcones('playstation', 'confirmar')).toEqual(['ps5_cross_color_light'])
    expect(promptIcones('playstation', 'voltar')).toEqual(['ps5_circle_color_light'])
  })

  it('mouse não tem ícone de navegar e volta pelo Esc', () => {
    expect(promptIcones('mouse', 'navegar')).toEqual([])
    expect(promptIcones('mouse', 'voltar')).toEqual(['escape_light'])
  })
})
