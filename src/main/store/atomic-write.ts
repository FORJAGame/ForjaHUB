import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * grava num arquivo temp no mesmo diretório, `fsync`, depois `rename` sobre o destino. 
 * Um crash a qualquer momento antes do `rename` deixa o arquivo original intocado;
 * falha no meio do caminho (write/sync/rename) apaga o temp em vez de deixar lixo.
 *
 * `deps.rename` existe só pros testes exercitarem uma falha no `rename` sem
 * mexer no `fs` real (mesmo padrão de injeção do `launcher`).
 */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  deps: { rename?: typeof rename } = {}
): Promise<void> {
  const doRename = deps.rename ?? rename
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })

  const tmpPath = join(dir, `.${Date.now()}-${process.pid}-${randomBytes(4).toString('hex')}.tmp`)

  try {
    const handle = await open(tmpPath, 'w')
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await doRename(tmpPath, filePath)
  } catch (err) {
    await unlink(tmpPath).catch(() => {})
    throw err
  }

  // fsync do diretório: só o fsync do arquivo não garante que a entrada do
  // `rename` sobrevive a um crash logo em seguida (POSIX). Não
  // derruba a escrita (já efetivada) se a plataforma não suportar.
  await open(dir, 'r')
    .then(async (dirHandle) => {
      try {
        await dirHandle.sync()
      } finally {
        await dirHandle.close()
      }
    })
    .catch(() => {})
}
