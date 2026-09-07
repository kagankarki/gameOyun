/**
 * DERS SES VE VİDEO MEDYA DEPOSU
 *
 * Hoca TTS yerine kendi ses kaydını veya videosunu kullanabiliyor:
 * Dosyalar **hocanın cihazında**, tarayıcının IndexedDB'sinde tutulur.
 *
 * NEDEN YEREL (IndexedDB & Blob)?
 *  · Ses ve video dosyaları 50 MB – 1 GB+ olabiliyor.
 *  · Firestore'un 1 MB doküman sınırına sığmaz; sunucuya yüklemek hem maliyetli
 *    hem amfi ortamında gereksiz gecikme ve kota yaratır.
 *  · Sesi ve videoyu zaten yalnızca amfideki projeksiyona bağlı hoca bilgisayarı
 *    oynatıyor — öğrencinin telefonuna gitmiyor.
 *  · URL.createObjectURL ile sıfır ağ yüküyle devasa videolar bile akıcı oynatılır.
 */

import type { KelimeZamani } from './transcribe'

const DB_ADI = 'hy-audio'
const STORE_AUDIO = 'files'
const STORE_VIDEO = 'videos'
const SURUM = 2

export interface DersSesi {
  /** Ders kimliği — bir derse bir kayıt */
  lessonId: string
  name: string
  type: string
  size: number
  /** Ses uzunluğu (ms) — 0 ise okunamamış */
  durationMs: number
  blob: Blob
  savedAt: number
  /** Otomatik yazıya dökme sonucu — hoca metni düzenlemiş olabilir */
  transcript?: string
  /**
   * Kelime zaman damgaları. Ders metni dökümle aynı kaldığı sürece
   * okuma konumu oransal tahminle değil, bu ölçümle hesaplanır.
   */
  words?: KelimeZamani[]
}

export interface DersVideosu {
  lessonId: string
  name: string
  type: string
  size: number
  /** Video uzunluğu (ms) — 0 ise okunamamış */
  durationMs: number
  /** Videonun kendi sesi var mı ve dinlenecek mi? */
  hasAudio: boolean
  blob: Blob
  savedAt: number
}

/** Oturum dokümanına yazılan herkese açık künye — dosyanın kendisi değil */
export interface SesKunyesi {
  name: string
  durationMs: number
  size: number
}

export interface VideoKunyesi {
  name: string
  durationMs: number
  size: number
  hasAudio: boolean
}

/* Bellek içi tampon (IndexedDB kota sınırına veya gizli sekme engeline karşı güvence) */
const memoryAudioCache = new Map<string, DersSesi>()
const memoryVideoCache = new Map<string, DersVideosu>()

const acDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcı yerel dosya deposunu desteklemiyor.'))
      return
    }
    const req = indexedDB.open(DB_ADI, SURUM)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'lessonId' })
      }
      if (!db.objectStoreNames.contains(STORE_VIDEO)) {
        db.createObjectStore(STORE_VIDEO, { keyPath: 'lessonId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Medya deposu açılamadı.'))
  })

const islem = <T,>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> =>
  acDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        try {
          const tx = db.transaction(storeName, mode)
          const req = fn(tx.objectStore(storeName))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error ?? new Error('Medya deposu işlem hatası.'))
          tx.oncomplete = () => db.close()
        } catch (err) {
          db.close()
          reject(err)
        }
      }),
  )

/* ══════════════════════════════════════════════════════════
   SES FONKSİYONLARI
   ══════════════════════════════════════════════════════════ */

/** Ses dosyasının uzunluğunu okur — okunamazsa 0 döner. */
export function sesSuresi(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    let bitti = false
    const bitir = (ms: number) => {
      if (bitti) return
      bitti = true
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () =>
      bitir(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0)
    a.onerror = () => bitir(0)
    setTimeout(() => bitir(0), 8000)
    a.src = url
  })
}

/** Yazıya dökme sonucunu mevcut kayda ekler. */
export async function dokumKaydet(
  lessonId: string,
  transcript: string,
  words: KelimeZamani[],
): Promise<DersSesi | null> {
  const mevcut = await sesGetir(lessonId)
  if (!mevcut) return null
  const guncel: DersSesi = { ...mevcut, transcript, words }
  memoryAudioCache.set(lessonId, guncel)
  try {
    await islem(STORE_AUDIO, 'readwrite', (s) => s.put(guncel))
  } catch (err) {
    console.warn('[mediaStore] IndexedDB ses güncelleme hatası, bellekte korundu:', err)
  }
  return guncel
}

export async function sesKaydet(lessonId: string, file: File): Promise<DersSesi> {
  const durationMs = await sesSuresi(file)
  const kayit: DersSesi = {
    lessonId,
    name: file.name,
    type: file.type || 'audio/mpeg',
    size: file.size,
    durationMs,
    blob: file,
    savedAt: Date.now(),
  }
  memoryAudioCache.set(lessonId, kayit)
  try {
    await islem(STORE_AUDIO, 'readwrite', (s) => s.put(kayit))
  } catch (err) {
    console.warn('[mediaStore] IndexedDB ses kayıt hatası, bellekte tutuldu:', err)
  }
  return kayit
}

export async function sesGetir(lessonId: string): Promise<DersSesi | null> {
  if (memoryAudioCache.has(lessonId)) {
    return memoryAudioCache.get(lessonId)!
  }
  try {
    const r = await islem<DersSesi | undefined>(STORE_AUDIO, 'readonly', (s) => s.get(lessonId))
    if (r) memoryAudioCache.set(lessonId, r)
    return r ?? null
  } catch (e) {
    console.error('[mediaStore] Ses okunamadı:', e)
    return null
  }
}

export async function sesSil(lessonId: string): Promise<void> {
  memoryAudioCache.delete(lessonId)
  try {
    await islem(STORE_AUDIO, 'readwrite', (s) => s.delete(lessonId))
  } catch (e) {
    console.error('[mediaStore] Ses silinemedi:', e)
  }
}

/* ══════════════════════════════════════════════════════════
   VİDEO FONKSİYONLARI
   ══════════════════════════════════════════════════════════ */

/** Video dosyasının uzunluğunu okur — okunamazsa 0 döner. */
export function videoSuresi(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    let bitti = false
    const bitir = (ms: number) => {
      if (bitti) return
      bitti = true
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    v.preload = 'metadata'
    v.onloadedmetadata = () =>
      bitir(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0)
    v.onerror = () => bitir(0)
    setTimeout(() => bitir(0), 10000)
    v.src = url
  })
}

export async function videoKaydet(
  lessonId: string,
  file: File,
  hasAudio: boolean,
): Promise<DersVideosu> {
  const durationMs = await videoSuresi(file)
  const kayit: DersVideosu = {
    lessonId,
    name: file.name,
    type: file.type || 'video/mp4',
    size: file.size,
    durationMs,
    hasAudio,
    blob: file,
    savedAt: Date.now(),
  }
  memoryVideoCache.set(lessonId, kayit)
  try {
    await islem(STORE_VIDEO, 'readwrite', (s) => s.put(kayit))
  } catch (err) {
    console.warn('[mediaStore] IndexedDB video kayıt hatası (büyük dosya/kota), bellekte tutuldu:', err)
  }
  return kayit
}

export async function videoGetir(lessonId: string): Promise<DersVideosu | null> {
  if (memoryVideoCache.has(lessonId)) {
    return memoryVideoCache.get(lessonId)!
  }
  try {
    const r = await islem<DersVideosu | undefined>(STORE_VIDEO, 'readonly', (s) => s.get(lessonId))
    if (r) memoryVideoCache.set(lessonId, r)
    return r ?? null
  } catch (e) {
    console.error('[mediaStore] Video okunamadı:', e)
    return null
  }
}

export async function videoSil(lessonId: string): Promise<void> {
  memoryVideoCache.delete(lessonId)
  try {
    await islem(STORE_VIDEO, 'readwrite', (s) => s.delete(lessonId))
  } catch (e) {
    console.error('[mediaStore] Video silinemedi:', e)
  }
}

/* ══════════════════════════════════════════════════════════
   KÜNYELER VE YARDIMCILAR
   ══════════════════════════════════════════════════════════ */

export const kunye = (s: DersSesi): SesKunyesi => ({
  name: s.name,
  durationMs: s.durationMs,
  size: s.size,
})

export const videoKunye = (v: DersVideosu): VideoKunyesi => ({
  name: v.name,
  durationMs: v.durationMs,
  size: v.size,
  hasAudio: v.hasAudio,
})

export const boyutMetni = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`

export const sureMetni = (ms: number) => {
  if (!ms) return '—'
  const sn = Math.round(ms / 1000)
  return `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`
}
