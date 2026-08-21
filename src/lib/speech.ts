/**
 * TTS Katmanı — Amfi modunda ders notunu sesli okur.
 *
 * 1. Öncelik: ElevenLabs Doğal & Akıcı Yapay Zeka Türkçe TTS (Multilingual v2)
 *    - Karakter & kelime bazlı hassas zaman damgaları (with-timestamps) ile senkron takip.
 *    - İnsan tonlamasında son derece akıcı, tok ve doğal Türkçe seslendirme.
 *    - Farklı tok/derin erkek ve doğal kadın ses seçenekleri.
 * 2. Yedek: Tarayıcı Web Speech API (speechSynthesis)
 */

export interface VoicePreset {
  id: string
  name: string
  tag: string
  description: string
  gender: 'male' | 'female'
  badge?: string
}

/**
 * ElevenLabs Türkçe'de en doğal ve tok konuşan ses ön ayarları
 */
export const ELEVENLABS_VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    tag: 'Çok Tok & Hoca',
    description: 'Derin, tok ve sıcak amfi anlatımı (En çok tercih edilen)',
    gender: 'male',
    badge: 'Tavsiye Edilen',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    tag: 'Derin Bariton',
    description: 'Tok belgesel ve akademik sunum tonu',
    gender: 'male',
  },
  {
    id: 'pNInz6ovEkqRGWrWwmOT',
    name: 'Adam',
    tag: 'Tok & Karizmatik',
    description: 'Tok ve net diksiyonlu karizmatik anlatıcı',
    gender: 'male',
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel',
    tag: 'Tok Spiker',
    description: 'Otoriter ve net haber spikeri tonu',
    gender: 'male',
  },
  {
    id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    tag: 'Olgun & Bilge',
    description: 'Sakin, tok ve ağırbaşlı hoca tonu',
    gender: 'male',
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam',
    tag: 'Genç & Akıcı',
    description: 'Dinamik ve tempolu genç erkek sesi',
    gender: 'male',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    tag: 'Profesyonel Kadın',
    description: 'Sakin, net ve profesyonel kadın anlatımı',
    gender: 'female',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    tag: 'Doğal Kadın',
    description: 'Akıcı, samimi ve anlaşılır kadın sesi',
    gender: 'female',
  },
]

const STORAGE_VOICE_KEY = 'gazi_amfi_voice_id'
const STORAGE_RATE_KEY = 'gazi_amfi_voice_rate'

export const getSelectedVoiceId = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_VOICE_KEY)
    if (saved) return saved
  }
  return import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() || 'JBFqnCBsd6RMkjVDRZzb'
}

export const setSelectedVoiceId = (voiceId: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_VOICE_KEY, voiceId)
  }
}

export const getSelectedVoiceRate = (): number => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_RATE_KEY)
    if (saved) {
      const parsed = parseFloat(saved)
      if (!isNaN(parsed)) return parsed
    }
  }
  return 0.85 // Varsayılan: %30 sakin ve tok tempo
}

export const setSelectedVoiceRate = (rate: number) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_RATE_KEY, String(rate))
  }
}

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
    const currentId = getSelectedVoiceId()
    const preset = ELEVENLABS_VOICE_PRESETS.find((p) => p.id === currentId)
    const label = preset ? `${preset.name} (${preset.tag})` : 'Tok Türkçe AI Sesi'
    return {
      name: `ElevenLabs AI · ${label}`,
      lang: 'tr-TR',
      default: true,
      localService: false,
      voiceURI: `elevenlabs-${currentId}`,
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
  /** İsteğe bağlı özel ElevenLabs ses ID'si */
  voiceId?: string
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
    opts.voiceId ||
    getSelectedVoiceId() ||
    import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ||
    'JBFqnCBsd6RMkjVDRZzb'

  // Doğal ve sakin okuma hızı (ElevenLabs için 0.85 ideal ve tok/akıcıdır)
  const userRate = opts.rate ?? getSelectedVoiceRate()
  const speed = Math.min(Math.max(userRate, 0.7), 1.2)

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
  if (voice && voice.voiceURI && !voice.voiceURI.startsWith('elevenlabs')) {
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

/**
 * Seçilen sesle kısa bir örnek cümle çalarak anında önizleme yapar.
 */
export function previewVoice(
  voiceId: string,
  sampleText: string = 'Merhaba arkadaşlar, bugünkü dersimize hoş geldiniz. Hazırsanız başlayalım.',
  rate?: number,
  onEnd?: () => void,
  onError?: (err: string) => void,
): SpeakHandle {
  return speak(sampleText, null, {
    voiceId,
    rate,
    onEnd,
    onError,
  })
}
