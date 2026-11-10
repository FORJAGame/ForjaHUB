// No build empacotado o renderer abre via `file://`: um caminho absoluto (`/forja-mark.svg`)
// apontaria pra raiz do disco. O `BASE_URL` é `./` no build e `/` em dev.
export const FORJA_MARK_URL = `${import.meta.env.BASE_URL}forja-mark.svg`

/** Prompt de input em `public/prompts/` (Mr. Breakfast's Free Prompts, CC0). */
export function promptUrl(nome: string): string {
  return `${import.meta.env.BASE_URL}prompts/${nome}.svg`
}

/** Easter eggs em `public/easter-eggs/`; sem o arquivo o navegador só falha o `src`. */
export function easterEggUrl(nome: string): string {
  return `${import.meta.env.BASE_URL}easter-eggs/${nome}`
}
