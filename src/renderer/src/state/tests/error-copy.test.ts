import { describe, expect, it } from 'vitest'
import { LAUNCH_ERROR_CODES } from '@shared/types'
import { errorCopy, isLaunchError } from '../error-copy'

const COPY = 'Não foi possível abrir agora. Escolha outro.'

describe('errorCopy', () => {
  it.each(LAUNCH_ERROR_CODES)('%s vira a copy padrão do JOGAR', (code) => {
    expect(errorCopy(code)).toBe(COPY)
  })

  it('código fora do contrato passa intacto', () => {
    expect(errorCopy('HYDRATE_FALHOU')).toBe('HYDRATE_FALHOU')
    expect(errorCopy('SEM_PONTE')).toBe('SEM_PONTE')
  })

  it('código vazio passa intacto', () => {
    expect(errorCopy('')).toBe('')
  })
})

describe('isLaunchError', () => {
  it.each(LAUNCH_ERROR_CODES)('%s é falha de lançamento', (code) => {
    expect(isLaunchError(code)).toBe(true)
  })

  it('null não é falha de lançamento', () => {
    expect(isLaunchError(null)).toBe(false)
  })

  it('código fora do contrato não é falha de lançamento', () => {
    expect(isLaunchError('HYDRATE_FALHOU')).toBe(false)
  })

  it('chave herdada do protótipo não conta como falha de lançamento', () => {
    expect(isLaunchError('toString')).toBe(false)
  })
})
