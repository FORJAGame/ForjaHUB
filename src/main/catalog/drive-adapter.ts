import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Jogo } from '@shared/types'
import type { DriveEntry, DriveMediaClient } from './google-client'
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
  drive: DriveMediaClient,
  entry: DriveEntry,
  destDir: string,
  tipo: string,
  jogoId: string
): Promise<void> {
  let buffer: Buffer
  try {
    buffer = await drive.downloadFile(entry.id)
  } catch (err) {
    throw new MidiaIndisponivelError(
      `Jogo '${jogoId}': falha baixando ${tipo} (${entry.name}): ${(err as Error).message}`
    )
  }
  await mkdir(destDir, { recursive: true })
  await writeFile(join(destDir, `${tipo}${extname(entry.name)}`), buffer)
}

/**
 * Baixa a mídia de cada Jogo (subpasta Drive = `id`, dentro de `mediaFolderId`)
 * pro staging dir (`<stagingMediaDir>/<id>/<tipo><ext>`). Tudo-ou-nada: pasta
 * ausente, asset obrigatório ausente/não-baixável ou zero `detalhe-N` derruba
 * o download inteiro.
 *
 * Devolve o `Jogo[]` completo (metadados + `detalheImagens`), pronto pro
 * `catalog.json` do staging.
 */
export async function downloadMediaParaJogos(
  drive: DriveMediaClient,
  mediaFolderId: string,
  jogosMetadata: JogoMetadata[],
  stagingMediaDir: string
): Promise<Jogo[]> {
  const raiz = await drive.listFolder(mediaFolderId)
  const jogos: Jogo[] = []

  for (const metadata of jogosMetadata) {
    // Drive permite subpastas irmãs com o mesmo nome, mais de uma bate no
    // `id` do Jogo é ambiguidade, não escolha silenciosa da primeira.
    const candidatosPasta = raiz.filter((entry) => entry.name === metadata.id)
    if (candidatosPasta.length === 0) {
      throw new MidiaIndisponivelError(`Jogo '${metadata.id}': pasta de mídia ausente no Drive`)
    }
    if (candidatosPasta.length > 1) {
      throw new MidiaIndisponivelError(
        `Jogo '${metadata.id}': mais de uma subpasta de mídia com o nome '${metadata.id}' (ambíguo)`
      )
    }
    const subpasta = candidatosPasta[0]

    let arquivos: DriveEntry[]
    try {
      arquivos = await drive.listFolder(subpasta.id)
    } catch (err) {
      throw new MidiaIndisponivelError(
        `Jogo '${metadata.id}': falha listando a pasta de mídia: ${(err as Error).message}`
      )
    }

    const destDir = join(stagingMediaDir, metadata.id)

    const detalhes = arquivos
      .map((entry) => ({ entry, match: entry.name.match(DETALHE_RE) }))
      .filter(
        (achado): achado is { entry: DriveEntry; match: RegExpMatchArray } => achado.match !== null
      )
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
      const candidatos = arquivos.filter(
        (candidato) => nomeBase(candidato.name).toLowerCase() === tipo
      )
      if (candidatos.length === 0) {
        throw new MidiaIndisponivelError(`Jogo '${metadata.id}': ${tipo}.* ausente na pasta de mídia`)
      }
      if (candidatos.length > 1) {
        throw new MidiaIndisponivelError(
          `Jogo '${metadata.id}': mais de um arquivo pro asset '${tipo}' (ambíguo: ${candidatos
            .map((c) => c.name)
            .join(', ')})`
        )
      }
      await baixarAsset(drive, candidatos[0], destDir, tipo, metadata.id)
    }

    const detalheImagens: string[] = []
    for (const { entry, match } of detalhes) {
      const tipo = `detalhe-${match[1]}`
      await baixarAsset(drive, entry, destDir, tipo, metadata.id)
      detalheImagens.push(tipo)
    }

    jogos.push({ ...metadata, detalheImagens })
  }

  return jogos
}
