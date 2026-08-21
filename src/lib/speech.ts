/**
 * TTS Katmanı — Amfi modunda ders notunu sesli okur.
 *
 * 1. Öncelik: ElevenLabs Doğal & Akıcı Yapay Zeka Türkçe TTS (Multilingual v2)
 *    - Karakter & kelime bazlı hassas zaman damgaları (with-timestamps) ile senkron takip.
 *    - İnsan tonlamasında son derece akıcı ve doğal Türkçe seslendirme.
 * 2. Yedek: Tarayıcı Web Speech API (speechSynthesis)
 */

interface ElevenLabsAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

interface ElevenLabsTimestampResponse {
  audio_base64: string
  alignment?: ElevenLabsAlignment
  normalized_alignment?: ElevenLabsAlignment
}

export const isElevenLabsConfigured = () =>
  Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY?.trim())

const isSpeechSynthesisSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export const isSpeechSupported = () =>
  isElevenLabsConfigured() || isSpeechSynthesisSupported()

/** Sesler asenkron yüklenir; ilk çağrıda liste boş dönebilir. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) return resolve([])

    const ready = speechSynthesis.getVoices()
    if (ready.length) return resolve(ready)

    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(speechSynthesis.getVoices())
    }

    speechSynthesis.addEventListener('voiceschanged', done)
    // Chrome ses listesini bazen geç yüklüyor — 3 saniye bekle
    setTimeout(done, 3000)
  })
}

/** tr-TR sesini bulur veya ElevenLabs AI sesini döner */
export async function getTurkishVoice(): Promise<SpeechSynthesisVoice | null> {
  if (isElevenLabsConfigured()) {
    return {
      name: 'ElevenLabs AI Türkçe (Doğal / Multilingual v2)',
      lang: 'tr-TR',
      default: true,
      localService: false,
      voiceURI: 'elevenlabs-tr',
    } as SpeechSynthesisVoice
  }

  const voices = await loadVoices()
  return (
    voices.find(
      (v) =>
        v.lang?.toLowerCase().includes('tr') ||
        v.name?.toLowerCase().includes('turkish') ||
        v.name?.toLowerCase().includes('türkçe') ||
        v.name?.toLowerCase().includes('tolga') ||
        v.name?.toLowerCase().includes('emel'),
    ) ?? null
  )
}

export interface SpeakOptions {
  /** Ses gerçekten başladığında — zil penceresi burada açılır */
  onStart?: () => void
  /** Her kelimede; charIndex metindeki konumu verir */
  onBoundary?: (charIndex: number) => void
  /** Konuşma bittiğinde (iptal edilmişse çağrılmaz) */
  onEnd?: () => void
  onError?: (message: string) => void
  /** 0.1 – 10, varsayılan 0.85 (ElevenLabs) / 0.7 (Web Speech) */
  rate?: number
}

export interface SpeakHandle {
  /** Konuşmayı keser; onEnd tetiklenmez */
  cancel: () => void
}

let activeAudio: HTMLAudioElement | null = null
let activeRafId: number | null = null

/** Sayfadan ayrılırken veya yeni okuma başlarken sesi susturur */
export const cancelSpeech = () => {
  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId)
    activeRafId = null
  }
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio.src = ''
    activeAudio = null
  }
  if (isSpeechSynthesisSupported()) {
    speechSynthesis.cancel()
  }
}

/**
 * ElevenLabs API ile doğal Türkçe seslendirme
 */
async function speakElevenLabs(
  text: string,
  opts: SpeakOptions,
  state: { cancelled: boolean },
  voiceFallback: SpeechSynthesisVoice | null,
) {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim()
  const voiceId =
    import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() || 'pNInz6ovEkqRGWrWwmOT' // Adam / Türkçe uyumlu ses

  // Doğal ve sakin okuma hızı (ElevenLabs için 0.85 ideal ve akıcıdır)
  const speed = opts.rate ? Math.min(Math.max(opts.rate, 0.7), 1.2) : 0.85

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        speed: speed,
      },
    }),
  })

  if (state.cancelled) return

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const msg =
      errData?.detail?.message || `ElevenLabs API Hatası (HTTP ${res.status})`
    throw new Error(msg)
  }

  const data: ElevenLabsTimestampResponse = await res.json()
  if (state.cancelled) return

  const audioSrc = `data:audio/mp3;base64,${data.audio_base64}`
  const audio = new Audio(audioSrc)
  activeAudio = audio

  const alignment = data.alignment
  let nextIdx = 0

  audio.onplay = () => {
    if (state.cancelled) return
    opts.onStart?.()

    if (alignment?.character_start_times_seconds?.length) {
      const times = alignment.character_start_times_seconds
      const trackAlignment = () => {
        if (state.cancelled || !activeAudio) return
        const current = activeAudio.currentTime
        while (nextIdx < times.length && current >= times[nextIdx]) {
          opts.onBoundary?.(nextIdx)
          nextIdx++
        }
        if (!activeAudio.paused && !activeAudio.ended) {
          activeRafId = requestAnimationFrame(trackAlignment)
        }
      }
      activeRafId = requestAnimationFrame(trackAlignment)
    } else {
      // Zaman damgası dönmezse süreye göre orantısal takip
      const trackProgress = () => {
        if (state.cancelled || !activeAudio) return
        if (activeAudio.duration > 0) {
          const ratio = activeAudio.currentTime / activeAudio.duration
          const charPos = Math.min(Math.floor(ratio * text.length), text.length - 1)
          opts.onBoundary?.(charPos)
        }
        if (!activeAudio.paused && !activeAudio.ended) {
          activeRafId = requestAnimationFrame(trackProgress)
        }
      }
      activeRafId = requestAnimationFrame(trackProgress)
    }
  }

  audio.onended = () => {
    if (activeRafId !== null) {
      cancelAnimationFrame(activeRafId)
      activeRafId = null
    }
    activeAudio = null
    if (!state.cancelled) {
      opts.onEnd?.()
    }
  }

  audio.onerror = () => {
    if (activeRafId !== null) {
      cancelAnimationFrame(activeRafId)
      activeRafId = null
    }
    activeAudio = null
    if (!state.cancelled) {
      opts.onError?.('ElevenLabs ses çalma hatası oluştu.')
    }
  }

  try {
    await audio.play()
  } catch (err: any) {
    if (state.cancelled) return
    throw err
  }
}

/**
 * Web Speech API (Tarayıcı yerel ses motoru — Yedek)
 */
function speakWebSpeech(
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: SpeakOptions,
  state: { cancelled: boolean },
) {
  if (!isSpeechSynthesisSupported()) {
    opts.onError?.('Bu tarayıcı sesli okumayı desteklemiyor.')
    return
  }

  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'tr-TR'
  u.rate = opts.rate ?? 0.7
  if (voice && voice.voiceURI !== 'elevenlabs-tr') {
    u.voice = voice
  }

  let heartbeat: number | undefined

  const stopHeartbeat = () => {
    if (heartbeat !== undefined) {
      clearInterval(heartbeat)
      heartbeat = undefined
    }
  }

  u.onstart = () => {
    if (state.cancelled) return
    heartbeat = window.setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.resume()
    }, 8000)
    opts.onStart?.()
  }

  u.onboundary = (e) => {
    if (state.cancelled) return
    opts.onBoundary?.(e.charIndex)
  }

  u.onend = () => {
    stopHeartbeat()
    if (state.cancelled) return
    opts.onEnd?.()
  }

  u.onerror = (e) => {
    stopHeartbeat()
    if (state.cancelled || e.error === 'interrupted' || e.error === 'canceled') return
    opts.onError?.(`Sesli okuma hatası: ${e.error}`)
  }

  speechSynthesis.speak(u)
}

/**
 * Verilen metni ElevenLabs (öncelikli) veya yerel Türkçe sesle okur.
 */
export function speak(
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: SpeakOptions = {},
): SpeakHandle {
  cancelSpeech()

  const state = { cancelled: false }

  const handle: SpeakHandle = {
    cancel: () => {
      state.cancelled = true
      cancelSpeech()
    },
  }

  if (isElevenLabsConfigured()) {
    speakElevenLabs(text, opts, state, voice).catch((err) => {
      if (state.cancelled) return
      console.warn('ElevenLabs ses çalınamadı, yerel sese dönülüyor:', err)
      speakWebSpeech(text, voice, opts, state)
    })
  } else {
    speakWebSpeech(text, voice, opts, state)
  }

  return handle
}

