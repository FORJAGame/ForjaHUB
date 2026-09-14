import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CatalogoSchema, JogoSchema, JogosSchema } from '../schema'

function jogoValido(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'jogo-a',
    titulo: 'Jogo A',
    ano: 2024,
    guilda: 'Guilda A',
    genero: 'Aventura',
    modalidade: 'single-player',
    sinopse: 'Uma sinopse qualquer.',
    redesUrl: 'https://exemplo.com/jogo-a',
    exeRelativo: 'Jogo.exe',
    ...overrides
  }
}

describe('JogoSchema', () => {
  it('aceita um Jogo válido', () => {
    const result = JogoSchema.safeParse(jogoValido())
    expect(result.success).toBe(true)
  })

  it('coage ano vindo como string da Planilha', () => {
    const result = JogoSchema.safeParse(jogoValido({ ano: '2019' }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ano).toBe(2019)
    }
  })

  it.each(['Jogo-A', 'jogo_a', 'jogo a', 'JOGO-A', ''])('rejeita id fora de kebab-case: %s', (id) => {
    expect(JogoSchema.safeParse(jogoValido({ id })).success).toBe(false)
  })

  it('rejeita modalidade fora do enum', () => {
    expect(JogoSchema.safeParse(jogoValido({ modalidade: 'coop' })).success).toBe(false)
  })

  it.each(['..\\Jogo.exe', '../jogo.exe', 'sub/../../Jogo.exe'])(
    'rejeita exeRelativo com `..`: %s',
    (exeRelativo) => {
      expect(JogoSchema.safeParse(jogoValido({ exeRelativo })).success).toBe(false)
    }
  )

  it.each(['/opt/jogo/Jogo.exe', 'C:\\Jogos\\Jogo.exe', 'C:/Jogos/Jogo.exe', '\\\\share\\Jogo.exe'])(
    'rejeita exeRelativo absoluto: %s',
    (exeRelativo) => {
      expect(JogoSchema.safeParse(jogoValido({ exeRelativo })).success).toBe(false)
    }
  )

  it('aceita exeRelativo relativo com subpasta', () => {
    expect(JogoSchema.safeParse(jogoValido({ exeRelativo: 'bin\\Jogo.exe' })).success).toBe(true)
  })

  it('rejeita ano fora da faixa plausível', () => {
    expect(JogoSchema.safeParse(jogoValido({ ano: 1800 })).success).toBe(false)
  })

  it('rejeita titulo/sinopse/guilda/genero vazios', () => {
    for (const campo of ['titulo', 'sinopse', 'guilda', 'genero']) {
      expect(JogoSchema.safeParse(jogoValido({ [campo]: '' })).success).toBe(false)
    }
  })

  it('aceita redesUrl vazio (nem todo Jogo tem redes)', () => {
    expect(JogoSchema.safeParse(jogoValido({ redesUrl: '' })).success).toBe(true)
  })

  it('rejeita redesUrl com texto solto (não é URL nem vazio)', () => {
    expect(JogoSchema.safeParse(jogoValido({ redesUrl: 'não é url' })).success).toBe(false)
  })

  it('aceita redesUrl com espaço em volta e devolve trimado', () => {
    const result = JogoSchema.safeParse(jogoValido({ redesUrl: '  https://exemplo.com/jogo-a  ' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.redesUrl).toBe('https://exemplo.com/jogo-a')
  })

  it.each(['id', 'titulo', 'guilda', 'genero', 'sinopse', 'exeRelativo'] as const)(
    'trima espaço em volta do campo %s',
    (campo) => {
      const bruto = campo === 'exeRelativo' ? '  Jogo.exe  ' : `  valor-${campo}  `
      const overrides: Record<string, unknown> =
        campo === 'id' ? { id: '  jogo-a  ' } : { [campo]: bruto }
      const result = JogoSchema.safeParse(jogoValido(overrides))
      expect(result.success).toBe(true)
      if (result.success) {
        const valor = (result.data as unknown as Record<string, string>)[campo]
        expect(valor).toBe(valor.trim())
        expect(valor.length).toBeGreaterThan(0)
      }
    }
  )
})

describe('JogosSchema (tudo-ou-nada + unicidade)', () => {
  it('rejeita id duplicado entre Jogos', () => {
    const result = JogosSchema.safeParse([jogoValido({ id: 'jogo-a' }), jogoValido({ id: 'jogo-a' })])
    expect(result.success).toBe(false)
  })

  it('aceita quando o id é único entre Jogos', () => {
    const result = JogosSchema.safeParse([jogoValido({ id: 'jogo-a' }), jogoValido({ id: 'jogo-b' })])
    expect(result.success).toBe(true)
  })
})

describe('CatalogoSchema (tudo-ou-nada)', () => {
  it('aceita um array de Jogos todos válidos', () => {
    const result = CatalogoSchema.safeParse({
      jogos: [jogoValido({ id: 'jogo-a' }), jogoValido({ id: 'jogo-b' })],
      sincronizadoEm: new Date().toISOString()
    })
    expect(result.success).toBe(true)
  })

  it('uma única linha inválida derruba o Catálogo inteiro', () => {
    const result = CatalogoSchema.safeParse({
      jogos: [jogoValido({ id: 'jogo-a' }), jogoValido({ id: 'jogo-b', modalidade: 'coop' })],
      sincronizadoEm: new Date().toISOString()
    })
    expect(result.success).toBe(false)
  })

  it('id duplicado entre Jogos derruba o Catálogo inteiro (colide com key/Set no renderer)', () => {
    const result = CatalogoSchema.safeParse({
      jogos: [jogoValido({ id: 'jogo-a' }), jogoValido({ id: 'jogo-a' })],
      sincronizadoEm: new Date().toISOString()
    })
    expect(result.success).toBe(false)
  })

  it('z.array reusado isoladamente também é tudo-ou-nada', () => {
    const schema = z.array(JogoSchema)
    const result = schema.safeParse([jogoValido(), jogoValido({ id: 'INVALIDO' })])
    expect(result.success).toBe(false)
  })
})
