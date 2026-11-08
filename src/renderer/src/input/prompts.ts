import type { ControlePrompts } from '@shared/types'

/** Último dispositivo que o Visitante usou; decide quais prompts o rodapé mostra. */
export type InputDevice = 'controle' | 'teclado' | 'mouse'

/** Controle mostra a família escolhida no Setup; teclado e mouse mostram sempre os de PC. */
export type PromptSet = ControlePrompts | 'teclado' | 'mouse'

export type PromptAcao = 'navegar' | 'confirmar' | 'voltar'

export function promptSet(device: InputDevice, familia: ControlePrompts): PromptSet {
  return device === 'controle' ? familia : device
}

/**
 * Nome dos SVGs em `public/prompts/`. Mouse não tem botão de voltar nem de navegar
 * (o hover já foca o card): voltar cai no Esc e navegar some do rodapé.
 */
const ICONES: Record<PromptSet, Record<PromptAcao, readonly string[]>> = {
  xbox: {
    navegar: ['dpad_ew_light'],
    confirmar: ['xbox_a_color_light'],
    voltar: ['xbox_b_color_light']
  },
  playstation: {
    navegar: ['dpad_ew_light'],
    confirmar: ['ps5_cross_color_light'],
    voltar: ['ps5_circle_color_light']
  },
  teclado: {
    navegar: ['arrow_left_light', 'arrow_right_light'],
    confirmar: ['return_light'],
    voltar: ['escape_light']
  },
  mouse: {
    navegar: [],
    confirmar: ['left_mouse_button_light'],
    voltar: ['escape_light']
  }
}

export function promptIcones(set: PromptSet, acao: PromptAcao): readonly string[] {
  return ICONES[set][acao]
}
