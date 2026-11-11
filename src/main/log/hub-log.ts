import { readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { appendLinesDurable } from '../store/atomic-write'

export interface HubLog {
  info(origem: string, msg: string): void
  erro(origem: string, msg: string, err?: unknown): void
}

export interface HubLogArquivo extends HubLog {
  /** Caminho absoluto do `hub.log`. */
  caminho: string
  /** Últimas `maxLinhas` linhas do `hub.log` atual (não lê o `.1`); arquivo ausente ⇒ `[]`. */
  lerFinal(maxLinhas: number): Promise<string[]>
  /** Resolve quando toda escrita pedida até agora terminou (testes e saída do app). */
  ocioso(): Promise<void>
}

const MAX_BYTES_PADRAO = 5 * 1024 * 1024

export function createHubLog(deps: {
  dir: string
  maxBytes?: number
  agora?: () => Date
}): HubLogArquivo {
  const caminho = join(deps.dir, 'hub.log')
  const rotacionado = `${caminho}.1`
  const maxBytes = deps.maxBytes ?? MAX_BYTES_PADRAO
  const agora = deps.agora ?? (() => new Date())

  let tamanho: number | null = null
  // Mesma serialização do spool: uma cadeia de promessas, e uma falha não trava a fila.
  let fila: Promise<void> = Promise.resolve()

  function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = fila.then(tarefa, tarefa)
    fila = resultado.then(
      () => {},
      () => {}
    )
    return resultado
  }

  async function escrever(linha: string, bytes: number): Promise<void> {
    try {
      if (tamanho === null) {
        try {
          tamanho = (await stat(caminho)).size
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
          tamanho = 0
        }
      }

      if (tamanho > 0 && tamanho + bytes > maxBytes) {
        // Substitui o `.1` anterior; o histórico de diagnóstico é só o último ciclo.
        try {
          await rename(caminho, rotacionado)
          tamanho = 0
        } catch (err) {
          // Rotação nunca pode perder a linha: falhou, escreve no arquivo atual.
          console.error('[hub-log] falha rotacionando hub.log:', err)
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            tamanho = 0
          } else {
            // Tamanho real desconhecido: relê com `stat` antes da próxima decisão.
            await appendLinesDurable(caminho, [linha])
            tamanho = null
            return
          }
        }
      }

      await appendLinesDurable(caminho, [linha])
      tamanho += bytes
    } catch (err) {
      // Disco é diagnóstico: nunca derruba quem logou nem interrompe as próximas linhas.
      console.error('[hub-log] falha escrevendo hub.log:', err)
    }
  }

  function detalheErro(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const { message, code } = err as { message?: unknown; code?: unknown }
      // Erros de API (ex.: PostgREST) e do Zod não são `Error` mas trazem o texto útil.
      if (typeof message === 'string') {
        return typeof code === 'string' ? `${message} (${code})` : message
      }
    }
    return String(err)
  }

  function registrar(nivel: 'INFO' | 'ERRO', origem: string, msg: string, err?: unknown): void {
    const texto = err === undefined ? msg : `${msg} — ${detalheErro(err)}`
    const seguro = texto.replace(/[\r\n]+/g, ' ')
    const linha = `${agora().toISOString()} ${nivel} [${origem}] ${seguro}`
    const bytes = Buffer.byteLength(`${linha}\n`, 'utf-8')
    void enfileirar(() => escrever(linha, bytes))
  }

  return {
    caminho,
    info: (origem, msg) => registrar('INFO', origem, msg),
    erro: (origem, msg, err) => registrar('ERRO', origem, msg, err),
    lerFinal: (maxLinhas) =>
      enfileirar(async () => {
        if (maxLinhas <= 0) return []
        let conteudo: string
        try {
          conteudo = await readFile(caminho, 'utf-8')
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
          return []
        }
        return conteudo
          .split('\n')
          .filter((linha) => linha !== '')
          .slice(-maxLinhas)
      }),
    ocioso: () => enfileirar(async () => {})
  }
}

let destino: HubLogArquivo | null = null

/** Liga o singleton `hubLog` ao arquivo em `dir`. */
export function iniciarHubLog(dir: string): HubLogArquivo {
  const log = createHubLog({ dir })
  destino = log
  return log
}

/** Sempre escreve no `console`; depois de `iniciarHubLog`, também no arquivo. */
export const hubLog: HubLog = {
  info(origem, msg) {
    console.log(`[${origem}] ${msg}`)
    destino?.info(origem, msg)
  },
  erro(origem, msg, err) {
    if (err === undefined) console.error(`[${origem}] ${msg}`)
    else console.error(`[${origem}] ${msg}`, err)
    destino?.erro(origem, msg, err)
  }
}
