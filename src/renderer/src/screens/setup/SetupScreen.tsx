import { type FormEvent, type JSX, useEffect, useRef, useState } from 'react'
import { normalizeId } from '@shared/normalize'
import type { Jogo } from '@shared/types'
import { BootScreen, ErrorPlate } from '../../design/primitives'

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

export default function SetupScreen({ onComplete }: SetupScreenProps): JSX.Element {
  const [roster, setRoster] = useState<Jogo[] | null>(null)
  const [estacaoId, setEstacaoId] = useState('')
  const [eventoId, setEventoId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    let alive = true
    window.forjaAPI
      .configRoster()
      .then((res) => {
        if (!alive) return
        if (res.ok) setRoster([...res.roster].sort((a, b) => a.id.localeCompare(b.id)))
        else setErrorCode(res.code)
      })
      .catch(() => {
        if (alive) setErrorCode('ROSTER_INDISPONIVEL')
      })
    return () => {
      alive = false
    }
  }, [])

  function toggleJogo(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (submittingRef.current) return
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
        return
      }
      await onComplete()
    } catch {
      setErrorCode('SETUP_FALHOU')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (!roster) {
    return (
      <>
        <BootScreen statusText="Carregando roster…" />
        {errorCode && <ErrorPlate message={ERROR_COPY[errorCode] ?? errorCode} />}
      </>
    )
  }

  return (
    <main className="flex h-full select-none flex-col items-center justify-center gap-6 text-ink-primary">
      <p className="m-0 text-xs tracking-[0.3em] opacity-50">FORJA HUB — SETUP</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4 text-[#f4e9e3]">
        <label className="flex flex-col gap-1 text-sm">
          Identificador da Estação
          <input
            autoFocus
            value={estacaoId}
            onChange={(e) => setEstacaoId(e.target.value)}
            placeholder="tv-principal"
            className="rounded border border-white/20 bg-black/30 px-2 py-1 text-[#f4e9e3]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Identificador do Evento
          <input
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            placeholder="recnplay-2026"
            className="rounded border border-white/20 bg-black/30 px-2 py-1 text-[#f4e9e3]"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 opacity-70">Jogos do Evento</legend>
          {roster.map((jogo) => (
            <label key={jogo.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(jogo.id)} onChange={() => toggleJogo(jogo.id)} />
              {jogo.titulo}
            </label>
          ))}
        </fieldset>

        {errorCode && <p className="m-0 text-sm text-action-border">{ERROR_COPY[errorCode] ?? errorCode}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-action px-4 py-2 font-semibold disabled:opacity-50"
        >
          Sincronizar e continuar
        </button>
      </form>
    </main>
  )
}
