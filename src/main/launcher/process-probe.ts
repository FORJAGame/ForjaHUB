import { execFile } from 'node:child_process'

/**
 * Pergunta ao SO se existe um processo com este nome de imagem rodando.
 * É a superfície Windows-shaped.
 * #TODO: a calibração e a validação real do ramo `processo_alvo`.
 */
export type ProcessProbe = (nome: string) => Promise<boolean>

const PROBE_TIMEOUT_MS = 4000

// `processo_alvo` vem do Catálogo.
// Normaliza e rejeita o que não for um nome de arquivo executável plausível.
export function sanitizeProcessName(bruto: string): string | null {
  const nome = bruto.trim()
  if (!nome || nome.length > 260) return null
  if (nome.startsWith('-')) return null
  if (!/^[\p{L}\p{Nd} ._()-]+$/u.test(nome)) return null
  return nome
}

// Exportado só para teste, roda um comando e devolve o stdout.
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (_err, stdout) => {
      resolve(stdout ?? '')
    })
  })
}


// Detecção primária continua sendo `child.on('exit')` no módulo do launcher; este
// probe só entra quando `processo_alvo` está setado, existe apenas por robustez.
export const defaultProbe: ProcessProbe = async (nome) => {
  const alvo = sanitizeProcessName(nome)
  if (!alvo) return false

  if (process.platform === 'win32') {
    // `tasklist /FI "IMAGENAME eq <nome>" /NH` — portado do `src/` antigo. Sem
    // match imprime "INFO: No tasks..."; com match, a linha traz o nome da imagem.
    const out = await run('tasklist', ['/FI', `IMAGENAME eq ${alvo}`, '/NH'])
    return out.toLowerCase().includes(alvo.toLowerCase())
  }

  // Só para rodar no meu Linux.
  const out = await run('pgrep', ['-x', '--', alvo])
  return out.trim().length > 0
}
