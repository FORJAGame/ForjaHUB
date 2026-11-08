import { type JSX, useId } from 'react'
import { CONTROLE_PROMPTS, type ControlePrompts } from '@shared/types'
import { promptUrl } from '../../design/assets'
import { promptIcones } from '../../input/prompts'

const NOME: Record<ControlePrompts, string> = {
  xbox: 'Xbox',
  playstation: 'PlayStation'
}

interface ControlePromptsFieldProps {
  value: ControlePrompts
  onChange: (value: ControlePrompts) => void
}

/** Rádio nativo escondido dentro do rótulo: setas trocam a opção e o foco segue o padrão do form. */
export default function ControlePromptsField({ value, onChange }: ControlePromptsFieldProps): JSX.Element {
  const id = useId()

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="text-body mb-2 p-0 text-ink-primary">Controle</legend>
      <div className="grid grid-cols-2 gap-6">
        {CONTROLE_PROMPTS.map((familia) => (
          <label
            key={familia}
            className="field flex cursor-pointer items-center gap-3 has-checked:border-action has-checked:bg-surface-raised has-focus-visible:shadow-[0_0_0_1px_var(--color-action),0_0_10px_0_rgba(210,19,18,0.35)]"
          >
            <input
              type="radio"
              name={id}
              value={familia}
              checked={value === familia}
              onChange={() => onChange(familia)}
              className="sr-only"
            />
            {[...promptIcones(familia, 'confirmar'), ...promptIcones(familia, 'voltar')].map((nome) => (
              <img key={nome} src={promptUrl(nome)} alt="" draggable={false} className="block h-8 w-auto" />
            ))}
            <span className="text-operator-body ml-1 text-ink-primary">{NOME[familia]}</span>
          </label>
        ))}
      </div>
      <p className="text-meta m-0 text-ink-secondary">Prompts do rodapé ao usar o Controle. Teclado e mouse sempre mostram os de PC.</p>
    </fieldset>
  )
}
