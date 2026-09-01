/**
 * HATA İŞARETLEME YARDIMCILARI
 *
 * Hoca ders notunda yanlış yerleri fareyle seçip işaretliyor; her işaret
 * metindeki bir karakter aralığı (`start`–`end`) olarak saklanıyor.
 *
 * Buradaki iki fonksiyon, işaretlerin kaybolmasına yol açan iki sorunu
 * çözüyor:
 *
 * 1. `trimRange` — fare seçimi neredeyse her zaman baştan/sondan boşluk
 *    kapıyor (çift tıklama kelimeyle birlikte sonraki boşluğu da alır).
 *    Kaydedilen `text` ise kırpılmış hâli. Aralığı da kırpmazsak
 *    `script.slice(start, end) !== text` olur ve işaret "bozuk" sayılır.
 *
 * 2. `reanchorWrongs` — metin düzenlenince işaretin altındaki yazı kayar.
 *    Eskiden bu durumda işaret SESSİZCE siliniyordu; hoca birkaç hata
 *    işaretleyip metne dokununca hepsi birden uçuyordu. Artık işaretin
 *    metnini arayıp yeni konumuna taşıyoruz, gerçekten kaybolduysa
 *    düşürüyor ve kimin düştüğünü geri bildiriyoruz.
 */
import type { WrongBlock } from './types'

/** Aralığın baştaki/sondaki boşluklarını kırpar — `text` ile birebir örtüşsün. */
export function trimRange(
  source: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let s = Math.max(0, Math.min(start, source.length))
  let e = Math.max(s, Math.min(end, source.length))
  while (s < e && /\s/.test(source[s])) s++
  while (e > s && /\s/.test(source[e - 1])) e--
  return { start: s, end: e }
}

export interface ReanchorResult {
  wrongs: WrongBlock[]
  /** Yeni konumuna taşınan işaretlerin metinleri */
  tasinan: string[]
  /** Metinde bulunamadığı için düşen işaretlerin metinleri */
  dusen: string[]
}

/**
 * İşaretleri güncel metne göre yeniden konumlandırır.
 *
 * Yerinde duranlara dokunmaz. Kaymış olanlar için metni arar; birden çok
 * eşleşme varsa ESKİ KONUMA EN YAKIN olanı seçer (aynı cümle iki kez
 * geçiyorsa hocanın kastettiği yer büyük ihtimalle yakın olan).
 */
export function reanchorWrongs(script: string, list: WrongBlock[]): ReanchorResult {
  const tasinan: string[] = []
  const dusen: string[] = []
  const sonuc: WrongBlock[] = []
  /** Aynı yere iki işaret oturmasın */
  const dolu: Array<{ start: number; end: number }> = []

  const cakisiyor = (s: number, e: number) => dolu.some((d) => s < d.end && e > d.start)

  for (const w of list) {
    const metin = w.text?.trim()
    if (!metin) {
      dusen.push(w.text ?? '')
      continue
    }

    // Yerinde mi?
    if (w.end <= script.length && script.slice(w.start, w.end) === metin && !cakisiyor(w.start, w.end)) {
      sonuc.push(w)
      dolu.push({ start: w.start, end: w.end })
      continue
    }

    // Kaymış — metni ara, eski konuma en yakın boş eşleşmeyi al
    const adaylar: number[] = []
    for (let i = script.indexOf(metin); i !== -1; i = script.indexOf(metin, i + 1)) {
      if (!cakisiyor(i, i + metin.length)) adaylar.push(i)
      // Çok tekrar eden kısa metinlerde sonsuz listeye gerek yok
      if (adaylar.length > 200) break
    }

    if (!adaylar.length) {
      dusen.push(metin)
      continue
    }

    const yeni = adaylar.reduce((a, b) =>
      Math.abs(b - w.start) < Math.abs(a - w.start) ? b : a,
    )
    sonuc.push({ ...w, start: yeni, end: yeni + metin.length, text: metin })
    dolu.push({ start: yeni, end: yeni + metin.length })
    if (yeni !== w.start) tasinan.push(metin)
  }

  const sirali = sonuc
    .sort((a, b) => a.start - b.start)
    .map((w, i) => ({ ...w, blockIndex: i }))

  return { wrongs: sirali, tasinan, dusen }
}

/* ══════════════════════════════════════════════════════════
   METİN İÇİNDE ARAMA
   Uzun ders notunda hatayı gözle aramak yerine kutuya yazıp
   eşleşmeler arasında gezinmek için.
   ══════════════════════════════════════════════════════════ */

export interface Eslesme {
  start: number
  end: number
  /** Eşleşmenin çevresinden kısa bir alıntı — listede göstermek için */
  onizleme: string
  /** Eşleşmenin `onizleme` içindeki konumu — vurgulamak için */
  vurguStart: number
  vurguEnd: number
  /** Bu aralık zaten işaretli mi? */
  isaretli: boolean
}

const ONIZLEME_PAY = 45

/**
 * Metinde arama. Türkçe'ye duyarlı, büyük/küçük harf ayırmaz.
 *
 * `toLocaleLowerCase('tr-TR')` bazı harflerde (İ→i̇) uzunluğu
 * değiştirebildiği için indeksleri kaydırmasın diye küçültmeyi
 * karakter karakter değil, güvenli tarafta kalarak yapıyoruz:
 * uzunluk değişirse ASCII küçültmeye düşüyoruz.
 */
export function ara(script: string, terim: string, wrongs: WrongBlock[]): Eslesme[] {
  const q = terim.trim()
  if (q.length < 2) return []

  const kucult = (s: string) => {
    const tr = s.toLocaleLowerCase('tr-TR')
    return tr.length === s.length ? tr : s.toLowerCase()
  }

  const hay = kucult(script)
  const needle = kucult(q)
  if (!needle) return []

  const sonuc: Eslesme[] = []
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    const end = i + needle.length
    const from = Math.max(0, i - ONIZLEME_PAY)
    const to = Math.min(script.length, end + ONIZLEME_PAY)
    sonuc.push({
      start: i,
      end,
      onizleme:
        (from > 0 ? '…' : '') + script.slice(from, to).replace(/\s+/g, ' ') + (to < script.length ? '…' : ''),
      vurguStart: i - from + (from > 0 ? 1 : 0),
      vurguEnd: end - from + (from > 0 ? 1 : 0),
      isaretli: wrongs.some((w) => i < w.end && end > w.start),
    })
    if (sonuc.length >= 100) break
  }
  return sonuc
}

/**
 * Verilen aralığı, içinde bulunduğu CÜMLEYE genişletir.
 *
 * Arama sonucundan tek tuşla tuzak yapılırken kullanılıyor: hoca
 * "miyozis" arayıp tuzak dediğinde işaretlenmesi gereken şey o kelime
 * değil, öğrencinin duyacağı cümlenin tamamı.
 *
 * Anatomi metni kısaltmalarla dolu ("N. radialis", "M. deltoideus");
 * noktadan sonra küçük harf geliyorsa cümle bitmemiştir.
 */
export function cumleAraligi(
  script: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const BITIS = '.!?…\n'

  const cumleBitti = (i: number) => {
    if (!BITIS.includes(script[i])) return false
    if (script[i] === '\n') return true
    // Kısaltma mı? Noktadan sonraki ilk harf küçükse cümle sürüyor
    const sonrasi = script.slice(i + 1, i + 4)
    const harf = sonrasi.trim()[0]
    if (!harf) return true
    return harf === harf.toLocaleUpperCase('tr-TR')
  }

  let s = start
  while (s > 0 && !cumleBitti(s - 1)) s--

  let e = end
  while (e < script.length && !cumleBitti(e)) e++
  if (e < script.length && script[e] !== '\n') e++ // noktalama da dâhil

  return trimRange(script, s, e)
}
