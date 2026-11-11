import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `vi.resetModules` por teste: `sfx.ts` guarda estado de módulo (`mudo`, o
 * `AudioContext` criado) e o teste precisa dele limpo a cada cenário.
 */

class AudioContextFake {
  static instancias = 0
  static fontes = 0

  state = 'running'
  sampleRate = 48_000
  currentTime = 0
  destination = {}

  constructor() {
    AudioContextFake.instancias += 1
  }

  resume(): Promise<void> {
    return Promise.resolve()
  }

  createBuffer(): AudioBuffer {
    return { getChannelData: () => new Float32Array(10) } as unknown as AudioBuffer
  }

  createBufferSource(): AudioBufferSourceNode {
    AudioContextFake.fontes += 1
    const cadeia = { connect: () => cadeia }
    return {
      buffer: null,
      connect: () => cadeia,
      start: () => {},
      stop: () => {}
    } as unknown as AudioBufferSourceNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return { type: '', frequency: { value: 0 }, Q: { value: 0 } } as unknown as BiquadFilterNode
  }

  createGain(): GainNode {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
    } as unknown as GainNode
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('AudioContext', AudioContextFake)
  AudioContextFake.instancias = 0
  AudioContextFake.fontes = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sfx — clique de foco', () => {
  it('com setSfxMudo(true), playFocusClick não cria AudioContext nem fonte', async () => {
    const { setSfxMudo, playFocusClick } = await import('../sfx')

    setSfxMudo(true)
    playFocusClick()

    expect(AudioContextFake.instancias).toBe(0)
    expect(AudioContextFake.fontes).toBe(0)
  })

  it('mudo e depois não-mudo: playFocusClick volta a criar a fonte', async () => {
    const { setSfxMudo, playFocusClick } = await import('../sfx')

    setSfxMudo(true)
    playFocusClick()
    expect(AudioContextFake.instancias).toBe(0)

    setSfxMudo(false)
    playFocusClick()
    expect(AudioContextFake.instancias).toBe(1)
    expect(AudioContextFake.fontes).toBe(1)
  })

  it('sfxMudo reflete o último valor; padrão false', async () => {
    const { sfxMudo, setSfxMudo } = await import('../sfx')
    expect(sfxMudo()).toBe(false)

    setSfxMudo(true)
    expect(sfxMudo()).toBe(true)

    setSfxMudo(false)
    expect(sfxMudo()).toBe(false)
  })
})
