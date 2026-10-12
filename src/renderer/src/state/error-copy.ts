import { LAUNCH_ERROR_CODES } from '@shared/types'

const LAUNCH_COPY = 'Não foi possível abrir agora. Escolha outro.'

export function isLaunchError(code: string | null): boolean {
  return code !== null && (LAUNCH_ERROR_CODES as readonly string[]).includes(code)
}

export function errorCopy(code: string): string {
  return isLaunchError(code) ? LAUNCH_COPY : code
}
