/**
 * Clique sintetizado, sem asset de áudio. O `main` liga
 * `autoplayPolicy: 'no-user-gesture-required'`: botão de Controle não conta
 * como gesto do usuário.
 */

const DURATION_S = 0.03
const PEAK_GAIN = 0.16
const BAND_HZ = 2600

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function noiseBuffer(audio: AudioContext): AudioBuffer {
  const length = Math.ceil(audio.sampleRate * DURATION_S)
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

export function playFocusClick(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    noise ??= noiseBuffer(ctx)

    const source = ctx.createBufferSource()
    source.buffer = noise

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = BAND_HZ
    filter.Q.value = 1.4

    const gain = ctx.createGain()
    const t = ctx.currentTime
    gain.gain.setValueAtTime(PEAK_GAIN, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + DURATION_S)

    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(t)
    source.stop(t + DURATION_S)
  } catch (err) {
    // Sem áudio a navegação segue; o clique é só tempero.
    console.warn('[sfx] clique de foco indisponível:', err)
  }
}
