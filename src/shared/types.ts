/**
 * Tipos compartilhados entre `main` e `renderer` (AD-1).
 * Nomes de entidade em PT-BR, iguais ao Glossário do PRD.
 */

/**
 * Estado visual do renderer é uma máquina de estados tipada, telas são estados,
 * não rotas. `MODES` é a fonte única: o tipo deriva dela, e o reducer usa
 * a mesma lista para validar `set-mode` em runtime.
 */
export const MODES = [
  'boot',
  'setup',
  'attract',
  'catalog',
  'detail',
  'launching',
  'operator'
] as const

export type Mode = (typeof MODES)[number]

export interface KioskState {
  mode: Mode
  /** Placa de erro coexiste com qualquer `mode` — não é um estado do union. */
  errorPlate: string | null
  /** Controle conectado coexiste com qualquer `mode`; desconectar não congela a navegação. */
  controllerConnected: boolean
  /**
   * Snapshot read-only da view do kiosk (Catálogo já filtrado pelo `main`, AD-11).
   * O renderer nunca persiste nem deriva estado autoritativo dele (AD-5).
   */
  catalogo: Catalogo | null
  /** Id do Jogo em foco na fileira; `null` só quando não há Catálogo. */
  focusedGameId: string | null
}

/**
 * Resultado de todo comando do `forjaAPI`. O renderer traduz `code` para
 * microcopy do EXPERIENCE.md; nunca mostra `msg` cru ao Visitante.
 */
export type CommandResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; msg?: string }

// --- Entidades de domínio ------------------------------------

export type BuildStatus = 'ausente' | 'baixando' | 'pronto' | 'erro'

export type Modalidade = 'single-player' | 'multiplayer'

export interface Jogo {
  id: string
  titulo: string
  ano: number
  guilda: string //estudio
  genero: string
  modalidade: Modalidade
  sinopse: string
  redesUrl: string
  /**
   * Caminho do `.exe` dentro do build (`games/<id>/<exeRelativo>`), validado
   * (sem `..`, sem path absoluto) mas ainda não usado pra lançar nada.
   */
  exeRelativo: string
  detalheImagens: string[]
}

export interface Catalogo {
  jogos: Jogo[]
  sincronizadoEm: string
}

export interface RegistroAnalytics {
  /** UUID v4 gerado no cliente. */
  id: string
  jogoId: string
}

export interface ConfigEstacao {
  estacaoId: string
  eventoId: string
  jogosSelecionados: string[]
  schemaVersion: number
}

export interface Manifest {
  schemaVersion: number
}
