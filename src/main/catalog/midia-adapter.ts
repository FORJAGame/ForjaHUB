import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Jogo } from '@shared/types'
import type { MidiaStorage } from '../supabase/client'
import type { JogoMetadata } from './schema'

/**
 * midia de um jogo ausente/não-baixável
 * quem chama descarta o sync inteiro, Cache anterior intacto.
 */
export class MidiaIndisponivelError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'MidiaIndisponivelError'
  }
}

// capa/hero/logo: convenção fixa, obrigatórios, sem campo próprio em jogo.
const ASSETS_OBRIGATORIOS = ['capa', 'hero', 'logo'] as const

const DETALHE_RE = /^detalhe-(\d+)\.[^./\\]+$/i

function nomeBase(nomeArquivo: string): string {
  const ext = extname(nomeArquivo)
  return ext ? nomeArquivo.slice(0, -ext.length) : nomeArquivo
}

async function baixarAsset(
  midia: MidiaStorage,
  jogoId: string,
  nomeArquivo: string,
  destDir: string,
  tipo: string
): Promise<void> {
  let buffer: Buffer
  try {
    buffer = await midia.baixar(`${jogoId}/${nomeArquivo}`)
  } catch (err) {
    throw new MidiaIndisponivelError(
      `Jogo '${jogoId}': falha baixando ${tipo} (${nomeArquivo}): ${(err as Error).message}`
    )
  }
  await mkdir(destDir, { recursive: true })
  await writeFile(join(destDir, `${tipo}${extname(nomeArquivo)}`), buffer)
}

/**
 * Baixa a mídia de cada Jogo (pasta `<id>/` no bucket de mídia) pro staging dir
 * (`<stagingMediaDir>/<id>/<tipo><ext>`). Tudo-ou-nada: pasta vazia/ausente,
 * asset obrigatório ausente/não-baixável ou zero `detalhe-N` derruba o
 * download inteiro.
 *
 * Devolve o `Jogo[]` completo (metadados + `detalheImagens`), pronto pro
 * `catalog.json` do staging.
 */
export async function downloadMediaParaJogos(
  midia: MidiaStorage,
  jogosMetadata: JogoMetadata[],
  stagingMediaDir: string
): Promise<Jogo[]> {
  const jogos: Jogo[] = []

  for (const metadata of jogosMetadata) {
    let arquivos: string[]
    try {
      arquivos = await midia.listar(metadata.id)
    } catch (err) {
      throw new MidiaIndisponivelError(
        `Jogo '${metadata.id}': falha listando a pasta de mídia: ${(err as Error).message}`
      )
    }
    // O Storage não distingue pasta vazia de pasta inexistente.
    if (arquivos.length === 0) {
      throw new MidiaIndisponivelError(`Jogo '${metadata.id}': pasta de mídia ausente ou vazia`)
    }

    const destDir = join(stagingMediaDir, metadata.id)

    const detalhes = arquivos
      .map((nome) => ({ nome, match: nome.match(DETALHE_RE) }))
      .filter((achado): achado is { nome: string; match: RegExpMatchArray } => achado.match !== null)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))

    if (detalhes.length === 0) {
      throw new MidiaIndisponivelError(`Jogo '${metadata.id}': nenhum detalhe-N encontrado na pasta de mídia`)
    }

    for (let i = 1; i < detalhes.length; i++) {
      if (Number(detalhes[i].match[1]) === Number(detalhes[i - 1].match[1])) {
        throw new MidiaIndisponivelError(
          `Jogo '${metadata.id}': detalhe-${detalhes[i].match[1]} duplicado (mais de um arquivo pro mesmo índice)`
        )
      }
    }

    for (const tipo of ASSETS_OBRIGATORIOS) {
      // Alvo Windows/NTFS é case-insensitive por padrão, `Capa.png` conta como `capa`.
      const candidatos = arquivos.filter((nome) => nomeBase(nome).toLowerCase() === tipo)
      if (candidatos.length === 0) {
        throw new MidiaIndisponivelError(`Jogo '${metadata.id}': ${tipo}.* ausente na pasta de mídia`)
      }
      if (candidatos.length > 1) {
        throw new MidiaIndisponivelError(
          `Jogo '${metadata.id}': mais de um arquivo pro asset '${tipo}' (ambíguo: ${candidatos.join(', ')})`
        )
      }
      await baixarAsset(midia, metadata.id, candidatos[0], destDir, tipo)
    }

    const detalheImagens: string[] = []
    for (const { nome, match } of detalhes) {
      const tipo = `detalhe-${match[1]}`
      await baixarAsset(midia, metadata.id, nome, destDir, tipo)
      detalheImagens.push(tipo)
    }

    jogos.push({ ...metadata, detalheImagens })
  }

  return jogos
}
