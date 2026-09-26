// No build empacotado o renderer abre via `file://`: um caminho absoluto (`/forja-mark.svg`)
// apontaria pra raiz do disco. O `BASE_URL` é `./` no build e `/` em dev.
export const FORJA_MARK_URL = `${import.meta.env.BASE_URL}forja-mark.svg`
