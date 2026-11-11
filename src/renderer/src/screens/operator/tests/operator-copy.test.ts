import { describe, expect, it } from 'vitest'
import type { OperatorStatus, SyncResumo } from '@shared/types'
import { analyticsCopy, codeCopy, formatarQuando, syncCopy } from '../operator-copy'

describe('codeCopy', () => {
  it.each([
    ['CATALOGO_INDISPONIVEL', 'Sem rede. Catálogo mantido do cache local.'],
    ['CATALOGO_INVALIDO', 'Catálogo com erro. Mantido o catálogo anterior; falha registrada no log.'],
    ['MIDIA_INDISPONIVEL', 'Mídia incompleta no catálogo. Mantido o catálogo anterior.'],
    ['CATALOGO_NAO_CONFIGURADO', 'Catálogo não configurado nesta Estação.'],
    ['ANALYTICS_NAO_CONFIGURADO', 'Envio de sessões não configurado nesta Estação.'],
    ['ANALYTICS_INDISPONIVEL', 'Sem rede. Sessões guardadas para o próximo envio.'],
    ['STORE_INDISPONIVEL', 'Não foi possível salvar agora. Tente de novo.'],
    ['LOG_INDISPONIVEL', 'Não foi possível ler o log agora.'],
    ['STATUS_FALHOU', 'Não foi possível ler o estado da Estação.']
  ])('%s ⇒ texto exato', (code, esperado) => {
    expect(codeCopy(code)).toBe(esperado)
  })

  it('código desconhecido ⇒ contém o código e a palavra log', () => {
    const texto = codeCopy('CODE_JAMAIS_VISTO')
    expect(texto).toContain('CODE_JAMAIS_VISTO')
    expect(texto).toContain('log')
  })
})

describe('syncCopy', () => {
  it('null ⇒ nenhuma sincronização nesta execução', () => {
    expect(syncCopy(null)).toBe('Nenhuma sincronização nesta execução.')
  })

  it('ok ⇒ catálogo atualizado', () => {
    const resumo: SyncResumo = { ok: true, code: null, em: '2026-11-11T00:00:00.000Z' }
    expect(syncCopy(resumo)).toBe('Catálogo atualizado.')
  })

  it('falha ⇒ igual ao codeCopy do código', () => {
    const resumo: SyncResumo = { ok: false, code: 'CATALOGO_INDISPONIVEL', em: '2026-11-11T00:00:00.000Z' }
    expect(syncCopy(resumo)).toBe(codeCopy('CATALOGO_INDISPONIVEL'))
  })
})

describe('analyticsCopy', () => {
  it('null ⇒ registro de sessões desligado', () => {
    expect(analyticsCopy(null)).toBe('Registro de sessões desligado nesta execução.')
  })

  it('3 pendentes com último flush falho ⇒ contém o 3 e a copy do código', () => {
    const analytics: OperatorStatus['analytics'] = {
      pendentes: 3,
      ultimoFlushOk: false,
      ultimoFlushEm: '2026-11-11T00:00:00.000Z',
      ultimoFlushCode: 'ANALYTICS_INDISPONIVEL'
    }
    const texto = analyticsCopy(analytics)
    expect(texto).toContain('3')
    expect(texto).toContain(codeCopy('ANALYTICS_INDISPONIVEL'))
  })

  it('nunca houve flush ⇒ contém nenhum envio nesta execução', () => {
    const analytics: OperatorStatus['analytics'] = {
      pendentes: 0,
      ultimoFlushOk: null,
      ultimoFlushEm: null,
      ultimoFlushCode: null
    }
    expect(analyticsCopy(analytics)).toContain('Nenhum envio nesta execução.')
  })
})

describe('formatarQuando', () => {
  it('mesmo dia ⇒ hoje, HH:mm', () => {
    const agora = new Date(2026, 10, 11, 10, 0)
    const iso = new Date(2026, 10, 11, 8, 14).toISOString()
    expect(formatarQuando(iso, agora)).toBe('hoje, 08:14')
  })

  it('dia anterior ⇒ ontem, HH:mm', () => {
    const agora = new Date(2026, 10, 11, 10, 0)
    const iso = new Date(2026, 10, 10, 22, 10).toISOString()
    expect(formatarQuando(iso, agora)).toBe('ontem, 22:10')
  })

  it('mais antigo ⇒ DD/MM, HH:mm', () => {
    const agora = new Date(2026, 10, 11, 10, 0)
    const iso = new Date(2026, 9, 8, 14, 2).toISOString()
    expect(formatarQuando(iso, agora)).toBe('08/10, 14:02')
  })

  it('virada de mês/ano (1º de janeiro olhando 31 de dezembro) ⇒ ontem', () => {
    const agora = new Date(2027, 0, 1, 9, 0)
    const iso = new Date(2026, 11, 31, 20, 30).toISOString()
    expect(formatarQuando(iso, agora)).toBe('ontem, 20:30')
  })

  it('dia seguinte ⇒ amanhã, HH:mm (virada de ano à meia-noite)', () => {
    const agora = new Date(2026, 11, 31, 23, 0)
    const iso = new Date(2027, 0, 1, 0, 30).toISOString()
    expect(formatarQuando(iso, agora)).toBe('amanhã, 00:30')
  })

  it('2 dias à frente ⇒ DD/MM, HH:mm', () => {
    const agora = new Date(2026, 11, 30, 10, 0)
    const iso = new Date(2027, 0, 1, 9, 5).toISOString()
    expect(formatarQuando(iso, agora)).toBe('01/01, 09:05')
  })

  it('ISO inválido ⇒ —', () => {
    expect(formatarQuando('isto-não-é-iso', new Date(2026, 10, 11, 10, 0))).toBe('—')
  })
})
