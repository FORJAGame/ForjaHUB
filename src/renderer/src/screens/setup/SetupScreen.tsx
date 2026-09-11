import { type FormEvent, type JSX, useEffect, useRef, useState } from 'react'
import { normalizeId } from '@shared/normalize'
import type { Jogo, Mode } from '@shared/types'

interface SetupScreenProps {
  onComplete: (mode: Mode) => void
  onError: (code: string) => void
}

const ERROR_COPY: Record<string, string> = {
  SETUP_INVALIDO: 'Preencha a Estação e o Evento.',
  SETUP_SEM_JOGO: 'Selecione ao menos um Jogo.',
  SETUP_JOGO_DESCONHECIDO: 'Um Jogo selecionado não existe mais no roster — recarregue o Setup.',
  STORE_INDISPONIVEL: 'Não foi possível salvar agora. Tente de novo.',
  SETUP_FALHOU: 'Algo deu errado ao salvar. Tente de novo.'
}

export default function SetupScreen({ onComplete, onError }: SetupScreenProps): JSX.Element {
  const [roster, setRoster] = useState<Jogo[] | null>(null)
  const [estacaoId, setEstacaoId] = useState('')
  const [eventoId, setEventoId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    let alive = true
    window.forjaAPI
      .configRoster()
      .then((res) => {
        if (!alive) return
        if (res.ok) setRoster([...res.roster].sort((a, b) => a.ordem - b.ordem))
        else onErrorRef.current(res.code)
      })
      .catch(() => {
        if (alive) onErrorRef.current('ROSTER_INDISPONIVEL')
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
      const hydrated = await window.forjaAPI.hydrate()
      if (hydrated.ok) onComplete(hydrated.mode)
      else onError(hydrated.code)
    } catch {
      setErrorCode('SETUP_FALHOU')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (!roster) {
    return <p className="m-0 text-sm opacity-70">Carregando roster…</p>
  }

  return (
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
            {jogo.id}
          </label>
        ))}
      </fieldset>

      {errorCode && <p className="m-0 text-sm text-[#e0483f]">{ERROR_COPY[errorCode] ?? errorCode}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-[#d21312] px-4 py-2 font-semibold disabled:opacity-50"
      >
        Sincronizar e continuar
      </button>
    </form>
  )
}
