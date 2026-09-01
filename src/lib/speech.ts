/**
 * TTS Katmanı — Amfi modunda ders notunu sesli okur.
 *
 * 1. Öncelik: ElevenLabs Doğal & Akıcı Yapay Zeka Türkçe TTS (Multilingual v2)
 *    - Karakter & kelime bazlı hassas zaman damgaları (with-timestamps) ile senkron takip.
 *    - İnsan tonlamasında son derece akıcı, tok ve doğal Türkçe seslendirme.
 *    - Farklı tok/derin erkek ve doğal kadın ses seçenekleri.
 * 2. Yedek: Tarayıcı Web Speech API (speechSynthesis)
 */

import { charAtTime, type KelimeZamani } from './transcribe'

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
  /** 0.1 – 10, varsayılan 0.85 */
  rate?: number
  /** Özel ElevenLabs ses ID'si */
  voiceId?: string
}

export interface SpeakHandle {
  /** Konuşmayı keser; onEnd tetiklenmez */
  cancel: () => void
}

let activeAudio: HTMLAudioElement | null = null
let activeRafId: number | null = null
/** Ses dosyası çalarken konumu bildiren zamanlayıcı */
let activeTickId: ReturnType<typeof setInterval> | null = null

/** Sayfadan ayrılırken veya yeni okuma başlarken sesi susturur */
export const cancelSpeech = () => {
  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId)
    activeRafId = null
  }
  if (activeTickId !== null) {
    clearInterval(activeTickId)
    activeTickId = null
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

/* ══════════════════════════════════════════════════════════
   HOCANIN KENDİ SES KAYDI
   ══════════════════════════════════════════════════════════ */

/**
 * Yüklenen ses dosyasını çalar ve metinde nerede olunduğunu bildirir.
 *
 * TTS'te kelime sınırlarını motor veriyor; ham bir ses dosyasında böyle
 * bir bilgi yok. Bu yüzden konumu **orantısal** hesaplıyoruz: ses %40'ına
 * geldiyse metnin de %40'ındayız sayıyoruz. Kayıt boyunca konuşma hızı
 * kabaca sabit olduğu için amfide aradığımız hassasiyet (birkaç saniyelik
 * yakalama penceresi) buna fazlasıyla yetiyor.
 *
 * `speak()` ile aynı `SpeakHandle`ı döndürür; hoca ekranı ikisini de
 * aynı şekilde iptal edebilsin.
 */
export function playAudioFile(
  blob: Blob,
  textLength: number,
  opts: SpeakOptions = {},
  /**
   * Yazıya dökmeden gelen kelime zamanları. Verilirse konum oransal
   * tahminle değil GERÇEK ölçümle bulunur; ders metni dökümden
   * saptıysa çağıran taraf bunu göndermez (bkz. transcribe.ts).
   */
  words?: KelimeZamani[],
): SpeakHandle {
  cancelSpeech()

  const state = { cancelled: false }
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.preload = 'auto'
  if (opts.rate && opts.rate > 0) audio.playbackRate = opts.rate

  activeAudio = audio

  const temizle = () => {
    if (activeTickId !== null) {
      clearInterval(activeTickId)
      activeTickId = null
    }
    URL.revokeObjectURL(url)
  }

  /**
   * Konumu `requestAnimationFrame` ile DEĞİL, ses elemanının kendi
   * saatiyle takip ediyoruz: rAF sekme arkaya düştüğü anda duruyor ve
   * çizelge donuyor — hoca ekranı başka pencereye geçtiğinde bütün
   * basışlar metnin durduğu yere denk geliyordu. `timeupdate` + kısa bir
   * zamanlayıcı arka planda da işlemeye devam ediyor.
   */
  const takip = () => {
    if (state.cancelled) return
    const ms = audio.currentTime * 1000

    // 1) Kelime zamanları varsa gerçek konum
    if (words?.length) {
      opts.onBoundary?.(Math.min(textLength, charAtTime(words, ms)))
      return
    }

    // 2) Yoksa oransal tahmin: ses %40'ındaysa metin de %40'ında
    const sure = audio.duration
    if (!Number.isFinite(sure) || sure <= 0) return
    const oran = Math.min(1, audio.currentTime / sure)
    opts.onBoundary?.(Math.floor(oran * textLength))
  }

  audio.ontimeupdate = takip

  audio.onplaying = () => {
    if (state.cancelled) return
    opts.onStart?.()
    if (activeTickId === null) activeTickId = setInterval(takip, 250)
  }

  audio.onended = () => {
    if (state.cancelled) return
    temizle()
    opts.onBoundary?.(textLength)
    opts.onEnd?.()
  }

  audio.onerror = () => {
    if (state.cancelled) return
    temizle()
    opts.onError?.('Ses dosyası çalınamadı. Dosya bozuk ya da desteklenmeyen bir biçimde olabilir.')
  }

  audio.play().catch((err: unknown) => {
    if (state.cancelled) return
    temizle()
    // Tarayıcı otomatik oynatmayı engellediyse kullanıcı hareketi gerekiyor
    opts.onError?.(
      (err as Error)?.name === 'NotAllowedError'
        ? 'Tarayıcı sesi engelledi — “Dersi Başlat” düğmesine sayfadan tıklayarak tekrar dene.'
        : `Ses başlatılamadı: ${(err as Error)?.message ?? 'bilinmeyen hata'}`,
    )
  })

  return {
    cancel: () => {
      state.cancelled = true
      temizle()
      cancelSpeech()
    },
  }
}

/**
 * ElevenLabs API ile doğal Türkçe seslendirme
 */
async function speakElevenLabs(
  text: string,
  opts: SpeakOptions,
  state: { cancelled: boolean },
) {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim()
  if (!apiKey) throw new Error('ElevenLabs API Anahtarı bulunamadı.')

  const voiceId =
    opts.voiceId ||
    getSelectedVoiceId() ||
    import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ||
    'JBFqnCBsd6RMkjVDRZzb'

  const userRate = opts.rate ?? getSelectedVoiceRate()

  let audioUrl: string | null = null
  let alignment: ElevenLabsAlignment | undefined

  // ElevenLabs API standart gövdesi (Geçersiz parametreler içermez)
  const requestBody = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
    },
  }

  console.log(`[ElevenLabs] voiceId="${voiceId}" rate=${userRate} text="${text.slice(0, 30)}..."`)

  // 1. Hassas zaman damgalı endpoint'i dene
  try {
    const timestampRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    )

    console.log(`[ElevenLabs] with-timestamps HTTP ${timestampRes.status} (voiceId=${voiceId})`)

    if (timestampRes.ok) {
      const data: ElevenLabsTimestampResponse = await timestampRes.json()
      if (data.audio_base64) {
        audioUrl = `data:audio/mp3;base64,${data.audio_base64}`
        alignment = data.alignment
        console.log(`[ElevenLabs] ✅ Başarılı — voiceId="${voiceId}" ses hazır`)
      }
    } else {
      const errBody = await timestampRes.text().catch(() => '')
      console.warn(`[ElevenLabs] with-timestamps HATA (${timestampRes.status}):`, errBody)
    }
  } catch (err) {
    console.warn('[ElevenLabs] with-timestamps isteği başarısız oldu:', err)
  }

  // 2. Eğer zaman damgalı endpoint başarısız olduysa, standart TTS akışını çağır
  if (!audioUrl) {
    const standardRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    )

    if (!standardRes.ok) {
      const errData = await standardRes.json().catch(() => ({}))
      const msg =
        errData?.detail?.message ||
        errData?.detail ||
        `ElevenLabs API Hatası (HTTP ${standardRes.status})`
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }

    const blob = await standardRes.blob()
    audioUrl = URL.createObjectURL(blob)
  }

  if (state.cancelled) return

  const audio = new Audio(audioUrl)
  // Tarayıcı yerel ses hız ayarı
  audio.playbackRate = userRate
  activeAudio = audio

  let nextIdx = 0

  audio.onplay = () => {
    if (state.cancelled) return
    opts.onStart?.()

    if (alignment?.character_start_times_seconds?.length) {
      const times = alignment.character_start_times_seconds
      const trackAlignment = () => {
        if (state.cancelled || !activeAudio) return
        // Oynatma hızı ile orantılı zaman takibi
        const current = activeAudio.currentTime * (activeAudio.playbackRate || 1)
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
    if (audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
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
    if (audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
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
    speakElevenLabs(text, opts, state).catch((err) => {
      if (state.cancelled) return
      console.error('[ElevenLabs] ❌ Ses çalınamadı — Windows TTS KULLANILMIYOR:', err?.message || err)
      opts.onError?.(err?.message || 'ElevenLabs ses çalma hatası — lütfen konsoldan detayı inceleyin')
      // Windows TTS'e DÜŞME — sadece hata bildir
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
  sampleText: string = 'Merhaba arkadaşlar! Bugünkü dersimizde gizli hataları bulacağız. Hazırsanız başlayalım.',
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
