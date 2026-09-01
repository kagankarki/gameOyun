/**
 * SES KAYDINI YAZIYA DÖKME (Speech-to-Text)
 *
 * Hoca kendi ders kaydını yüklüyor; metnini elle yazmak yerine buradan
 * otomatik çıkarıyoruz. ElevenLabs Scribe kullanılıyor — TTS için zaten
 * tanımlı olan `VITE_ELEVENLABS_API_KEY` yetiyor, ayrı bir servis yok.
 *
 * ASIL KAZANÇ ZAMAN DAMGALARI. Scribe her kelimenin kayıttaki başlangıç
 * ve bitiş saniyesini veriyor. Ham bir ses dosyasında "şu an metnin
 * neresindeyiz?" sorusunu oransal tahmin ederek cevaplıyorduk (ses
 * %40'ındaysa metin de %40'ında); kelime zamanlarıyla bunu GERÇEK
 * ölçümle yapabiliyoruz. Öğrencinin basışı doğru hataya çok daha
 * isabetli eşleşiyor.
 *
 * Metin sonradan düzenlenirse zamanlar kayar; o durumda `kelimeHaritasi`
 * null döner ve okuma oransal moda geri düşer (bkz. speech.ts).
 */

/** Bir kelimenin kayıttaki yeri ve metindeki karakter aralığı */
export interface KelimeZamani {
  /** Kelimenin kendisi */
  text: string
  /** Kayıttaki başlangıcı (ms) */
  start: number
  /** Kayıttaki bitişi (ms) */
  end: number
  /** Dökümde bu kelimenin başladığı karakter */
  charStart: number
  charEnd: number
}

export interface DokumSonucu {
  text: string
  words: KelimeZamani[]
  /** Servisin bildirdiği dil kodu — kontrol için */
  language?: string
}

export const isTranscribeConfigured = () =>
  Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY?.trim())

/** ElevenLabs'ın döndürdüğü ham kelime kaydı */
interface ScribeWord {
  text: string
  /** saniye */
  start?: number
  end?: number
  /** 'word' | 'spacing' | 'audio_event' */
  type?: string
}

interface ScribeResponse {
  text?: string
  language_code?: string
  words?: ScribeWord[]
}

/**
 * Kaydı yazıya döker.
 *
 * `signal` ile iptal edilebilir — uzun kayıtlarda hoca vazgeçebilsin.
 */
export async function transcribeAudio(
  blob: Blob,
  opts: { fileName?: string; signal?: AbortSignal } = {},
): Promise<DokumSonucu> {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'ElevenLabs anahtarı tanımlı değil. .env dosyasına VITE_ELEVENLABS_API_KEY ekle.',
    )
  }

  const form = new FormData()
  form.append('file', blob, opts.fileName || 'ders.mp3')
  form.append('model_id', 'scribe_v1')
  // Türkçe olduğunu söylemek doğruluğu belirgin şekilde artırıyor
  form.append('language_code', 'tur')
  form.append('timestamps_granularity', 'word')
  // Konuşmacı ayrıştırma gereksiz: tek bir hoca anlatıyor, işlem süresini uzatır
  form.append('diarize', 'false')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: opts.signal,
  })

  if (!res.ok) {
    const govde = await res.text().catch(() => '')
    throw new Error(hataMesaji(res.status, govde))
  }

  const data = (await res.json()) as ScribeResponse
  const text = (data.text ?? '').trim()
  if (!text) throw new Error('Kayıttan konuşma çıkarılamadı. Ses çok sessiz ya da boş olabilir.')

  return {
    text,
    language: data.language_code,
    words: kelimeleriEsle(text, data.words ?? []),
  }
}

/**
 * Kelimeleri döküm metnindeki karakter konumlarıyla eşler.
 *
 * Scribe kelimelerin yanında boşlukları da ayrı kayıt olarak döndürüyor;
 * metni baştan tarayarak her kelimeyi sırayla buluyoruz. Böylece
 * "metnin 412. karakteri kayıtta kaçıncı saniye?" sorusu cevaplanabilir.
 */
function kelimeleriEsle(text: string, words: ScribeWord[]): KelimeZamani[] {
  const sonuc: KelimeZamani[] = []
  let imlec = 0

  for (const w of words) {
    if (w.type === 'spacing') continue
    const kelime = (w.text ?? '').trim()
    if (!kelime) continue
    if (w.start === undefined || w.end === undefined) continue

    const yer = text.indexOf(kelime, imlec)
    if (yer === -1) continue // döküm ile kelime listesi ayrıştıysa atla

    sonuc.push({
      text: kelime,
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000),
      charStart: yer,
      charEnd: yer + kelime.length,
    })
    imlec = yer + kelime.length
  }

  return sonuc
}

function hataMesaji(status: number, govde: string): string {
  if (status === 401) return 'ElevenLabs anahtarı geçersiz ya da süresi dolmuş.'
  if (status === 413) return 'Ses dosyası servis için fazla büyük. Kaydı bölüp ayrı ayrı dök.'
  if (status === 422) return 'Servis bu dosya biçimini okuyamadı. MP3 ya da WAV olarak dene.'
  if (status === 429) return 'ElevenLabs kotası doldu ya da çok sık istek gönderildi. Biraz bekle.'
  const kisa = govde.slice(0, 200)
  return `Yazıya dökme başarısız (HTTP ${status})${kisa ? ': ' + kisa : ''}`
}

/* ══════════════════════════════════════════════════════════
   ZAMAN ↔ KARAKTER HARİTASI
   ══════════════════════════════════════════════════════════ */

/**
 * Ders metni hâlâ dökümle aynı mı?
 *
 * Hoca dökümü düzeltmiş olabilir (noktalama, yazım). Küçük düzeltmeler
 * kelime zamanlarını bozmaz; ama metin tamamen değiştiyse zamanları
 * kullanmak öğrenciyi yanlış puanlar. Boşluk/noktalama farkını yok
 * sayarak karşılaştırıyoruz.
 */
export function dokumHalaGecerli(script: string, transcript: string): boolean {
  const sade = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const a = sade(script)
  const b = sade(transcript)
  if (!a || !b) return false
  if (a === b) return true
  // Uzunluk çok saptıysa metin gerçekten değişmiştir
  const oran = Math.min(a.length, b.length) / Math.max(a.length, b.length)
  return oran > 0.97 && a.slice(0, 80) === b.slice(0, 80)
}

/**
 * Kayıttaki `ms` anında metnin hangi karakterinde olduğumuzu döner.
 * Kelimeler sıralı olduğu için ikili arama yapıyoruz.
 */
export function charAtTime(words: KelimeZamani[], ms: number): number {
  if (!words.length) return 0
  if (ms <= words[0].start) return words[0].charStart
  const son = words[words.length - 1]
  if (ms >= son.end) return son.charEnd

  let lo = 0
  let hi = words.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (words[mid].start <= ms) lo = mid
    else hi = mid
  }
  const w = words[lo]
  // Kelimenin içindeysek kelime boyunca orantılı ilerlet
  if (ms <= w.end) {
    const sure = Math.max(1, w.end - w.start)
    const oran = Math.min(1, (ms - w.start) / sure)
    return Math.round(w.charStart + oran * (w.charEnd - w.charStart))
  }
  // İki kelime arasındaki sessizlikteysek bir sonrakine kadar bekle
  return w.charEnd
}
