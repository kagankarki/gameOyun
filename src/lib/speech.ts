/**
 * TTS katmanı — Amfi modunda ders notunu sesli okur.
 *
 * Ölçülmüş davranışlar (bu proje için doğrulandı):
 *  • speak() ile sesin gerçekten başlaması arasında ~1 sn gecikme var.
 *    Bu yüzden zil penceresi onStart ile açılmalı, speak() çağrısıyla değil.
 *  • onBoundary her kelimede charIndex ile tetikleniyor → canlı kelime vurgusu.
 *  • Süre tahmin edilmez; gerçek onEnd beklenir.
 */

export const isSpeechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

/** Sesler asenkron yüklenir; ilk çağrıda liste boş dönebilir. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) return resolve([])

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

/** tr-TR sesini bulur. Bulamazsa null döner (u.lang = 'tr-TR' varsayılan sesi kullanır). */
export async function getTurkishVoice(): Promise<SpeechSynthesisVoice | null> {
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
  /** 0.1 – 10, varsayılan 0.7 (%30 yavaşlatıldı) */
  rate?: number
}

export interface SpeakHandle {
  /** Konuşmayı keser; onEnd tetiklenmez */
  cancel: () => void
}

/**
 * Verilen metni Türkçe sesle okur.
 * Tarayıcılar ses için kullanıcı hareketi ister — ilk çağrı bir tıklama
 * işleyicisinin içinden yapılmalı.
 */
export function speak(
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: SpeakOptions = {},
): SpeakHandle {
  if (!isSpeechSupported()) {
    opts.onError?.('Bu tarayıcı sesli okumayı desteklemiyor.')
    return { cancel: () => {} }
  }

  // Önceki konuşma sürüyorsa temizle
  speechSynthesis.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'tr-TR'
  u.rate = opts.rate ?? 0.7
  if (voice) u.voice = voice

  let cancelled = false
  let heartbeat: number | undefined

  const stopHeartbeat = () => {
    if (heartbeat !== undefined) {
      clearInterval(heartbeat)
      heartbeat = undefined
    }
  }

  u.onstart = () => {
    if (cancelled) return
    // Chrome uzun metinlerde ~15 sn sonra konuşmayı kesiyor.
    // Düzenli resume() çağrısı bunu önler.
    heartbeat = window.setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.resume()
    }, 8000)
    opts.onStart?.()
  }

  u.onboundary = (e) => {
    if (cancelled) return
    opts.onBoundary?.(e.charIndex)
  }

  u.onend = () => {
    stopHeartbeat()
    // cancel() bazı tarayıcılarda onend tetikler — dersi yanlışlıkla
    // ilerletmemek için burada ayırıyoruz.
    if (cancelled) return
    opts.onEnd?.()
  }

  u.onerror = (e) => {
    stopHeartbeat()
    if (cancelled || e.error === 'interrupted' || e.error === 'canceled') return
    opts.onError?.(`Sesli okuma hatası: ${e.error}`)
  }

  speechSynthesis.speak(u)

  return {
    cancel: () => {
      cancelled = true
      stopHeartbeat()
      speechSynthesis.cancel()
    },
  }
}

/** Sayfadan ayrılırken sesi susturmak için */
export const cancelSpeech = () => {
  if (isSpeechSupported()) speechSynthesis.cancel()
}
