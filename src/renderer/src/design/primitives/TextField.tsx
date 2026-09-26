import { type InputHTMLAttributes, type JSX, useId } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string
  /** Linha de apoio sob o campo (ex.: como o valor vai ser salvo). */
  hint?: string
}

/** Campo de texto do Operador: rótulo em caixa normal + a utility `field` (tokens.css) no input. */
export default function TextField({ label, hint, ...input }: TextFieldProps): JSX.Element {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body text-ink-primary">
        {label}
      </label>
      <input
        id={id}
        spellCheck={false}
        autoComplete="off"
        aria-describedby={hint ? hintId : undefined}
        {...input}
        className="field text-operator-body"
      />
      {hint && (
        <p id={hintId} className="text-meta m-0 text-ink-secondary">
          {hint}
        </p>
      )}
    </div>
  )
}
