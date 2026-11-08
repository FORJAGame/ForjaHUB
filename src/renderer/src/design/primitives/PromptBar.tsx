import { type JSX } from 'react'
import { type PromptAcao, type PromptSet, promptIcones } from '../../input/prompts'
import { promptUrl } from '../assets'

export interface PromptItem {
  acao: PromptAcao
  rotulo: string
}

interface PromptBarProps {
  set: PromptSet
  itens: readonly PromptItem[]
  className?: string
}

/** Rodapé de prompts: só o que a tela aceita, no ícone do dispositivo em uso. Ação sem ícone no set some. */
export default function PromptBar({ set, itens, className = '' }: PromptBarProps): JSX.Element {
  return (
    <div aria-hidden="true" className={`pointer-events-none flex items-center gap-8 ${className}`}>
      {itens.map(({ acao, rotulo }) => {
        const icones = promptIcones(set, acao)
        if (icones.length === 0) return null
        return (
          <div key={acao} className="flex items-center gap-2.5">
            {icones.map((nome) => (
              <img key={nome} src={promptUrl(nome)} alt="" draggable={false} className="block h-9 w-auto" />
            ))}
            <span className="text-meta meta-legible text-ink-primary">{rotulo}</span>
          </div>
        )
      })}
    </div>
  )
}
