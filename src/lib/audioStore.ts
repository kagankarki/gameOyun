/**
 * DERS SES DOSYASI DEPOSU
 *
 * Hoca TTS yerine kendi ses kaydını kullanabiliyor: dosyayı yükler,
 * metnini de not alanına yapıştırır; ders o kayda göre ilerler.
 *
 * NEREDE DURUYOR? Dosya **hocanın cihazında**, tarayıcının IndexedDB'sinde.
 * Bilinçli bir tercih:
 *  · Ses dosyaları 10–100 MB olabiliyor; Firestore'un 1 MB doküman sınırına
 *    sığmaz, Base64'e çevirip bölmek de amfide gereksiz bir risk.
 *  · Sesi zaten yalnızca hocanın cihazı çalıyor — öğrencinin telefonuna
 *    hiç gitmiyor. Ağ üzerinden dağıtmak için bir sebep yok.
 *
 * SINIRI: oturumu başka bir bilgisayardan açarsan dosya orada olmaz;
 * host ekranı bunu söyleyip dosyayı yeniden seçme imkânı verir.
 */

import type { KelimeZamani } from './transcribe'

const DB_ADI = 'hy-audio'
const STORE = 'files'
const SURUM = 1

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

/** Oturum dokümanına yazılan herkese açık künye — dosyanın kendisi değil */
export interface SesKunyesi {
  name: string
  durationMs: number
  size: number
}

const acDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcı yerel dosya deposunu desteklemiyor.'))
      return
    }
    const req = indexedDB.open(DB_ADI, SURUM)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'lessonId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Ses deposu açılamadı.'))
  })

const islem = <T,>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> =>
  acDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Ses deposu hatası.'))
        tx.oncomplete = () => db.close()
      }),
  )

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
    // Bazı tarayıcılar metadata olayını hiç tetiklemiyor
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
  await islem('readwrite', (s) => s.put(guncel))
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
  await islem('readwrite', (s) => s.put(kayit))
  return kayit
}

export async function sesGetir(lessonId: string): Promise<DersSesi | null> {
  try {
    const r = await islem<DersSesi | undefined>('readonly', (s) => s.get(lessonId))
    return r ?? null
  } catch (e) {
    console.error('[audio] okunamadı', e)
    return null
  }
}

export async function sesSil(lessonId: string): Promise<void> {
  try {
    await islem('readwrite', (s) => s.delete(lessonId))
  } catch (e) {
    console.error('[audio] silinemedi', e)
  }
}

export const kunye = (s: DersSesi): SesKunyesi => ({
  name: s.name,
  durationMs: s.durationMs,
  size: s.size,
})

export const boyutMetni = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

export const sureMetni = (ms: number) => {
  if (!ms) return '—'
  const sn = Math.round(ms / 1000)
  return `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`
}
