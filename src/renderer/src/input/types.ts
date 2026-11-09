/**
 * Camada de input do renderer. Mapa de intenção único, idêntico entre
 * Controle XInput, teclado e mouse.
 */
export type Intent = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'

/** De onde veio uma borda de input: `intent` = tecla/botão/eixo que o mapa traduz em `Intent`. */
export type OrigemInput = 'intent' | 'outro'
