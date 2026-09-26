import { type FormEvent, type JSX, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeId } from '@shared/normalize'
import type { Jogo } from '@shared/types'
import { FORJA_MARK_URL } from '../../design/assets'
import { EASE_FORJA, RISE_IN, shake } from '../../design/motion'
import { ErrorPlate, GrainOverlay, TextField } from '../../design/primitives'
import CoverTile from './CoverTile'

interface SetupScreenProps {
  /** Resolve só depois do hydrate: o form fica travado até lá. */
  onComplete: () => Promise<void>
}

const ERROR_COPY: Record<string, string> = {
  SETUP_INVALIDO: 'Preencha a Estação e o Evento.',
  SETUP_SEM_JOGO: 'Selecione ao menos um Jogo.',
  SETUP_JOGO_DESCONHECIDO: 'Um Jogo selecionado não existe mais no roster — recarregue o Setup.',
  STORE_INDISPONIVEL: 'Não foi possível salvar agora. Tente de novo.',
  SETUP_FALHOU: 'Algo deu errado ao salvar. Tente de novo.',
  ROSTER_INDISPONIVEL: 'Não foi possível carregar o roster agora. Tente de novo.',
  CATALOGO_INDISPONIVEL: 'Não foi possível baixar o Catálogo agora. Verifique a rede e tente de novo.',
  CATALOGO_NAO_CONFIGURADO: 'Catálogo não configurado nesta Estação. Fale com o Operador.',
  CATALOGO_INVALIDO: 'A Planilha de Catálogo tem uma linha inválida. Fale com o Operador.',
  CREDENCIAL_AUSENTE: 'Credencial do Catálogo ausente nesta Estação. Fale com o Operador.',
  MIDIA_INDISPONIVEL: 'Não foi possível baixar a mídia do Catálogo agora. Verifique a rede e tente de novo.'
}

/** `form` → `sealing` (form sai) → `welcome` → `leaving` (tela apaga) → `onComplete`. */
type Phase = 'form' | 'sealing' | 'welcome' | 'leaving'

const SEAL_MS = 380
const WELCOME_MS = 2600
const LEAVE_MS = 700
const LOGO_MOVE_MS = 950

const TILES_START_MS = 440
const TILE_STAGGER_MS = 70

function wait(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

/** O Operador vê como o id vai ser gravado antes de enviar (`normalizeId`). */
function savedAs(raw: string, idle: string): string {
  const id = normalizeId(raw)
  return id && id !== raw ? `Salvo como ${id}` : idle
}

export default function SetupScreen({ onComplete }: SetupScreenProps): JSX.Element {
  const [roster, setRoster] = useState<Jogo[] | null>(null)
  const [versao, setVersao] = useState('')
  const [estacaoId, setEstacaoId] = useState('')
  const [eventoId, setEventoId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  const submittingRef = useRef(false)
  const aliveRef = useRef(true)
  const submitRef = useRef<HTMLButtonElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  const logoTopRef = useRef<number | null>(null)

  const view = !roster ? 'loading' : phase === 'welcome' || phase === 'leaving' ? 'welcome' : 'form'

  useEffect(() => {
    aliveRef.current = true
    let alive = true
    window.forjaAPI
      .configRoster()
      .then((res) => {
        if (!alive) return
        if (res.ok) {
          setRoster([...res.roster].sort((a, b) => a.id.localeCompare(b.id)))
          setVersao(res.sincronizadoEm)
        } else {
          setErrorCode(res.code)
        }
      })
      .catch(() => {
        if (alive) setErrorCode('ROSTER_INDISPONIVEL')
      })
    return () => {
      alive = false
      aliveRef.current = false
    }
  }, [])

  useLayoutEffect(() => {
    const logo = logoRef.current
    if (!logo) return
    const top = logo.offsetTop
    const prev = logoTopRef.current
    logoTopRef.current = top
    if (prev === null || prev === top) return
    logo.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], {
      duration: LOGO_MOVE_MS,
      easing: EASE_FORJA
    })
  }, [view])

  function toggleJogo(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function forge(): Promise<void> {
    setPhase('sealing')
    await wait(SEAL_MS)
    setPhase('welcome')
    await wait(WELCOME_MS)
    setPhase('leaving')
    await wait(LEAVE_MS)
    // Desmontou no meio (ex.: atalho do Operador): não hidrata por cima da outra tela.
    if (!aliveRef.current) return
    try {
      await onComplete()
    } catch {
      setErrorCode('SETUP_FALHOU')
    }
    // Ainda montado = o hydrate não saiu do Setup (o App mostra a placa): devolve o form.
    if (aliveRef.current) setPhase('form')
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (submittingRef.current || phase !== 'form') return
    submittingRef.current = true
    setSubmitting(true)
    setErrorCode(null)
    try {
      const res = await window.forjaAPI.configSetupSubmit({
        estacaoId: normalizeId(estacaoId),
        eventoId: normalizeId(eventoId),
        jogosSelecionados: [...selected]
      })
      if (!res.ok) {
        setErrorCode(res.code)
        shake(submitRef.current)
        return
      }
    } catch {
      setErrorCode('SETUP_FALHOU')
      shake(submitRef.current)
      return
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
    await forge()
  }

  const glow = { loading: 'opacity-0', form: 'opacity-70', welcome: 'opacity-100' }[view]
  const buttonDelay = TILES_START_MS + (roster?.length ?? 0) * TILE_STAGGER_MS + 60

  return (
    <>
      <main className="relative h-full w-full select-none overflow-hidden bg-surface-base text-ink-primary">
        <div
          aria-hidden="true"
          className={`forge-glow pointer-events-none absolute inset-0 transition-opacity duration-1000 ease-out ${
            phase === 'leaving' ? 'opacity-0' : glow
          }`}
        />
        <GrainOverlay />

        <div className="absolute inset-0 flex overflow-y-auto overflow-x-hidden">
          <div
            className={`m-auto flex flex-col items-center gap-8 px-12 py-12 transition-opacity ease-out ${
              phase === 'leaving' ? 'opacity-0' : ''
            }`}
            style={{ transitionDuration: `${LEAVE_MS}ms` }}
          >
            <img ref={logoRef} src={FORJA_MARK_URL} alt="FORJA" draggable={false} className="w-80" />

            {view === 'loading' && (
              <>
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-action blur-[2px] animate-[forja-ember-pulse_2.6s_ease-in-out_infinite]"
                />
                <p className="text-body m-0 text-ink-secondary">Carregando roster…</p>
              </>
            )}

            {view === 'form' && roster && (
              <form
                onSubmit={handleSubmit}
                inert={phase !== 'form' || submitting}
                className={`flex w-[min(880px,calc(100vw-96px))] flex-col items-center gap-9 transition-[opacity,transform,filter] ease-in ${
                  phase === 'sealing' ? 'translate-y-3 opacity-0 blur-sm' : ''
                }`}
                style={{ transitionDuration: `${SEAL_MS}ms` }}
              >
                <div className={`flex flex-col items-center gap-2 text-center ${RISE_IN}`} style={{ animationDelay: '180ms' }}>
                  <h1 className="text-display-label m-0 uppercase text-ink-primary">Setup inicial</h1>
                  <p className="text-body m-0 text-ink-secondary">Identifique esta máquina e escolha os jogos do evento.</p>
                </div>

                <div className="grid w-full grid-cols-2 gap-6">
                  <div className={RISE_IN} style={{ animationDelay: '260ms' }}>
                    <TextField
                      label="Estação"
                      autoFocus
                      value={estacaoId}
                      onChange={(e) => setEstacaoId(e.target.value)}
                      placeholder="tv-principal"
                      hint={savedAs(estacaoId, 'Nome curto desta máquina.')}
                    />
                  </div>
                  <div className={RISE_IN} style={{ animationDelay: '330ms' }}>
                    <TextField
                      label="Evento"
                      value={eventoId}
                      onChange={(e) => setEventoId(e.target.value)}
                      placeholder="recnplay-2026"
                      hint={savedAs(eventoId, 'Nome curto do evento.')}
                    />
                  </div>
                </div>

                <section aria-labelledby="setup-jogos" className="flex w-full flex-col gap-5">
                  <div className={`flex items-baseline justify-between ${RISE_IN}`} style={{ animationDelay: '400ms' }}>
                    <h2 id="setup-jogos" className="text-body m-0 text-ink-primary">
                      Jogos do evento
                    </h2>
                    <p className="text-meta m-0 text-ink-secondary">
                      <span className={selected.size > 0 ? 'text-ink-primary' : ''}>{selected.size}</span> de{' '}
                      {roster.length} selecionados
                    </p>
                  </div>
                  <div role="group" aria-labelledby="setup-jogos" className="flex flex-wrap justify-center gap-x-6 gap-y-8 pt-2">
                    {roster.map((jogo, index) => (
                      <CoverTile
                        key={jogo.id}
                        jogo={jogo}
                        versao={versao}
                        selected={selected.has(jogo.id)}
                        onToggle={() => toggleJogo(jogo.id)}
                        enterDelayMs={TILES_START_MS + index * TILE_STAGGER_MS}
                      />
                    ))}
                  </div>
                </section>

                {/* Entrada no wrapper: o `fill` da animação prenderia o `transform` do `active:scale` do botão. */}
                <div className={RISE_IN} style={{ animationDelay: `${buttonDelay}ms` }}>
                  <button
                    ref={submitRef}
                    type="submit"
                    className="text-display-label flex h-14 cursor-pointer items-center gap-3 rounded-sm bg-action px-12 uppercase text-ink-on-action outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-action-border hover:shadow-[0_0_28px_rgba(210,19,18,0.45)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-secondary active:scale-[0.98]"
                  >
                    {submitting && (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-ink-on-action animate-[forja-ember-pulse_1.2s_ease-in-out_infinite]"
                      />
                    )}
                    {submitting ? 'Sincronizando' : 'Sincronizar e continuar'}
                  </button>
                </div>
              </form>
            )}

            {/* Lockup FORJA HUB: a logo acima é a mesma que veio descendo; o "HUB" fecha a marca. */}
            {view === 'welcome' && (
              <span className="text-display-hub -mt-6.5 block text-action animate-[forja-forge-in_1100ms_cubic-bezier(0.2,0.8,0.2,1)_450ms_both]">
                HUB
              </span>
            )}
          </div>
        </div>
      </main>

      {errorCode && <ErrorPlate message={ERROR_COPY[errorCode] ?? errorCode} />}
    </>
  )
}
