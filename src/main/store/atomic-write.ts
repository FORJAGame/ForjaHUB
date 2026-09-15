import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

async function fsyncDir(dir: string): Promise<void> {
  // só o fsync do arquivo/rename não garante que a entrada sobrevive a um
  // crash logo em seguida (POSIX). Não derruba a escrita (já efetivada) se a
  // plataforma não suportar.
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

  await fsyncDir(dir)
}

export async function swapDirAtomic(
  targetDir: string,
  stagingDir: string,
  deps: { rename?: typeof rename } = {}
): Promise<void> {
  const doRename = deps.rename ?? rename
  const parentDir = dirname(targetDir)
  await mkdir(parentDir, { recursive: true })

  const previousDir = join(
    parentDir,
    `${basename(targetDir)}.previous-${Date.now()}-${process.pid}-${randomBytes(4).toString('hex')}`
  )

  let hadExisting = true
  try {
    await doRename(targetDir, previousDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    hadExisting = false
  }

  try {
    await doRename(stagingDir, targetDir)
  } catch (err) {
    // Restaura o conteúdo antigo pra `targetDir` nunca ficar ausente/parcial.
    if (hadExisting) {
      await doRename(previousDir, targetDir).catch((restoreErr) => {
        console.error(
          `[store] swapDirAtomic: restauração de '${previousDir}' -> '${targetDir}' também falhou depois do swap falhar; Cache tratado como ausente até o próximo sync:`,
          restoreErr
        )
      })
    }
    throw err
  }

  await fsyncDir(parentDir)
}
