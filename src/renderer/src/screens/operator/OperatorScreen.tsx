import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import type { OperatorStatus } from '@shared/types'
import { CESAR_LOGO_URL } from '../../design/assets'
import { ErrorPlate } from '../../design/primitives'
import { analyticsCopy, codeCopy, formatarQuando, syncCopy } from './operator-copy'

interface OperatorScreenProps {
  onSair: () => void
  onReabrirSetup: (config: NonNullable<OperatorStatus['config']> | null) => void
  onSfxMudo: (mudo: boolean) => void
}

const INTERVALO_STATUS_MS = 5000

const PAINEL = 'flex flex-col gap-2 rounded-sm border border-border-hairline bg-surface-raised p-5'
const BOTAO =
  'text-operator-body inline-flex h-11 cursor-default items-center rounded-sm border border-border-hairline bg-surface-base px-5 text-ink-primary outline-none transition-colors duration-150 ease-out hover:border-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action disabled:opacity-50'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export default function OperatorScreen({ onSair, onReabrirSetup, onSfxMudo }: OperatorScreenProps): JSX.Element {
  const [status, setStatus] = useState<OperatorStatus | null>(null)
  const [statusErro, setStatusErro] = useState<string | null>(null)
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [resultadoSync, setResultadoSync] = useState<string | null>(null)
  const [logAberto, setLogAberto] = useState(false)
  const [logLinhas, setLogLinhas] = useState<string[] | null>(null)
  const vivoRef = useRef(true)
  const sincronizandoRef = useRef(false)
  const statusEmCursoRef = useRef(false)
  const gravandoSfxRef = useRef(false)
  const saindoRef = useRef(false)
  const [gravandoSfx, setGravandoSfx] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  const syncBtnRef = useRef<HTMLButtonElement>(null)

  // O retrato é barato e nunca espera rede: recolher a cada 5 s mantém a tela viva.
  const carregarStatus = useCallback(async (): Promise<void> => {
    // Um retrato por vez: sem isso, uma resposta velha pode sobrescrever a nova.
    if (statusEmCursoRef.current) return
    statusEmCursoRef.current = true
    try {
      const res = await window.forjaAPI.operatorStatus()
      if (!vivoRef.current) return
      if (res.ok) {
        setStatus(res.status)
        setStatusErro(null)
      } else setStatusErro(codeCopy(res.code))
    } catch {
      if (vivoRef.current) setStatusErro(codeCopy('STATUS_FALHOU'))
    } finally {
      statusEmCursoRef.current = false
    }
  }, [])

  useEffect(() => {
    vivoRef.current = true
    void carregarStatus()
    const timer = setInterval(() => void carregarStatus(), INTERVALO_STATUS_MS)
    return () => {
      vivoRef.current = false
      clearInterval(timer)
    }
  }, [carregarStatus])

  useEffect(() => {
    syncBtnRef.current?.focus()
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.repeat || saindoRef.current) return
      saindoRef.current = true
      onSair()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onSair])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logLinhas, logAberto])

  async function forcarSync(): Promise<void> {
    if (sincronizandoRef.current) return
    sincronizandoRef.current = true
    setSincronizando(true)
    setResultadoSync(null)
    setAcaoErro(null)
    try {
      const res = await window.forjaAPI.operatorForceSync()
      if (!vivoRef.current) return
      if (res.ok) setResultadoSync('Catálogo atualizado agora.')
      else setResultadoSync(codeCopy(res.code))
      await carregarStatus()
    } catch {
      if (vivoRef.current) {
        setResultadoSync(codeCopy('CATALOGO_INDISPONIVEL'))
        setAcaoErro(codeCopy('CATALOGO_INDISPONIVEL'))
      }
    } finally {
      sincronizandoRef.current = false
      if (vivoRef.current) setSincronizando(false)
    }
  }

  async function alternarSfx(): Promise<void> {
    if (!status || gravandoSfxRef.current) return
    const proximo = !status.sfxMudo
    gravandoSfxRef.current = true
    setGravandoSfx(true)
    setAcaoErro(null)
    try {
      const res = await window.forjaAPI.operatorSetSfxMudo(proximo)
      if (!vivoRef.current) return
      if (res.ok) {
        setStatus((prev) => (prev ? { ...prev, sfxMudo: proximo } : prev))
        onSfxMudo(proximo)
      } else setAcaoErro(codeCopy(res.code))
    } catch {
      if (vivoRef.current) setAcaoErro(codeCopy('STORE_INDISPONIVEL'))
    } finally {
      gravandoSfxRef.current = false
      if (vivoRef.current) setGravandoSfx(false)
    }
  }

  async function alternarLog(): Promise<void> {
    if (logAberto) {
      setLogAberto(false)
      return
    }
    setAcaoErro(null)
    try {
      const res = await window.forjaAPI.operatorLogTail()
      if (!vivoRef.current) return
      if (res.ok) {
        setLogLinhas(res.linhas)
        setLogAberto(true)
      } else setAcaoErro(codeCopy('LOG_INDISPONIVEL'))
    } catch {
      if (vivoRef.current) setAcaoErro(codeCopy('LOG_INDISPONIVEL'))
    }
  }

  const agora = new Date()
  const config = status?.config ?? null
  const catalogo = status?.catalogo ?? null
  const ultimoSync = status?.ultimoSync ?? null
  const mudo = status?.sfxMudo ?? false
  const placa = acaoErro ?? statusErro

  return (
    <main
      className="h-full w-full select-none overflow-y-auto bg-surface-base text-ink-primary"
      style={{ cursor: 'default' }}
    >
      <div className="mx-auto flex w-[min(960px,calc(100vw-96px))] flex-col gap-6 py-10">
        <div className="flex items-baseline justify-between gap-4 border-b border-border-hairline pb-4">
          <h1 className="text-heading m-0 uppercase text-ink-primary">STATUS DA ESTAÇÃO</h1>
          {status && <p className="text-meta m-0 text-ink-secondary">Hub v{status.versao}</p>}
        </div>

        <section className={PAINEL} aria-labelledby="operator-estacao">
          <h2 id="operator-estacao" className="text-label-caps m-0 text-ink-secondary">
            ESTAÇÃO / EVENTO
          </h2>
          {config ? (
            <div className="text-operator-body flex flex-col gap-1">
              <p className="m-0">
                Estação: <span className="text-ink-primary">{config.estacaoId}</span>
              </p>
              <p className="m-0">
                Evento: <span className="text-ink-primary">{config.eventoId}</span>
              </p>
              <p className="m-0">{config.jogosSelecionados.length} jogo(s) selecionado(s).</p>
            </div>
          ) : (
            <p className="text-operator-body m-0 text-ink-secondary">
              {status ? 'Estação ainda não configurada.' : 'Carregando estado da Estação…'}
            </p>
          )}
        </section>

        <section className={PAINEL} aria-labelledby="operator-catalogo">
          <h2 id="operator-catalogo" className="text-label-caps m-0 text-ink-secondary">
            CATÁLOGO
          </h2>
          {status ? (
            catalogo ? (
              <div className="text-operator-body flex flex-col gap-1">
                <p className="m-0">Última sincronização: {formatarQuando(catalogo.sincronizadoEm, agora)}.</p>
                <p className="m-0">{catalogo.jogos} jogo(s) no catálogo.</p>
              </div>
            ) : (
              <p className="text-operator-body m-0 text-ink-secondary">Nenhum catálogo salvo nesta Estação.</p>
            )
          ) : (
            <p className="text-operator-body m-0 text-ink-secondary">Carregando estado da Estação…</p>
          )}
          {status && (
            <>
              <p className="text-operator-body m-0">
                Última tentativa: {syncCopy(ultimoSync)}
                {ultimoSync && <span className="text-ink-secondary"> ({formatarQuando(ultimoSync.em, agora)})</span>}
              </p>
              {status.proximaTentativaEm && (
                <p className="text-operator-body m-0">
                  Nova tentativa automática: {formatarQuando(status.proximaTentativaEm, agora)}.
                </p>
              )}
            </>
          )}
        </section>

        <section className={PAINEL} aria-labelledby="operator-sessoes">
          <h2 id="operator-sessoes" className="text-label-caps m-0 text-ink-secondary">
            SESSÕES DE JOGO
          </h2>
          <p className="text-operator-body m-0">
            {status ? analyticsCopy(status.analytics) : 'Carregando estado da Estação…'}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button ref={syncBtnRef} type="button" className={BOTAO} disabled={sincronizando} onClick={() => void forcarSync()}>
            {sincronizando ? 'Sincronizando…' : 'Forçar sincronização'}
          </button>
          <button type="button" className={BOTAO} disabled={status === null} onClick={() => onReabrirSetup(config)}>
            Reabrir setup
          </button>
          <button type="button" className={BOTAO} onClick={() => void alternarLog()}>
            {logAberto ? 'Ocultar log' : 'Ver log'}
          </button>
          <button
            type="button"
            className={BOTAO}
            aria-pressed={mudo}
            disabled={status === null || gravandoSfx}
            onClick={() => void alternarSfx()}
          >
            {mudo ? 'SFX: mudos' : 'SFX: ligados'}
          </button>
          <button type="button" className={BOTAO} onClick={onSair}>
            Voltar
          </button>
        </div>

        {resultadoSync && (
          <p role="status" className="text-operator-body m-0 text-ink-primary">
            {resultadoSync}
          </p>
        )}

        {logAberto && (
          <section className={PAINEL} aria-labelledby="operator-log">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="operator-log" className="text-label-caps m-0 text-ink-secondary">
                LOG
              </h2>
              {status && <p className="text-meta m-0 break-all text-ink-secondary">{status.logPath}</p>}
            </div>
            {logLinhas && logLinhas.length > 0 ? (
              <pre
                ref={logRef}
                aria-label="Últimas linhas do log"
                className="text-meta m-0 max-h-80 overflow-y-auto whitespace-pre-wrap break-all"
                style={{ fontFamily: MONO }}
              >
                {logLinhas.join('\n')}
              </pre>
            ) : (
              <p className="text-meta m-0 text-ink-secondary">Log vazio.</p>
            )}
          </section>
        )}

        <footer className="mt-2 flex items-center gap-4 border-t border-border-hairline pt-4">
          <span
            aria-hidden="true"
            className="inline-block h-10 aspect-[1900/1500] shrink-0 bg-cobrand-cesar"
            style={{
              maskImage: `url(${CESAR_LOGO_URL})`,
              WebkitMaskImage: `url(${CESAR_LOGO_URL})`,
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'left center',
              WebkitMaskPosition: 'left center'
            }}
          />
          <span className="text-meta text-cobrand-cesar">uma iniciativa CESAR School</span>
        </footer>
      </div>

      {placa && <ErrorPlate message={placa} />}
    </main>
  )
}
