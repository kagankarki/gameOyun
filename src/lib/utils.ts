export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m} dk ${r} sn` : `${r} sn`
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('')

/** 0–100 arası oranı renk sınıfına çevirir */
export const scoreTone = (pct: number) =>
  pct >= 80 ? 'text-verify' : pct >= 50 ? 'text-flag' : 'text-mark'

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/* ══════════════════════════════════════════════════════════
   DERS NOTUNU PARÇALARA BÖLME (Amfi 2.0)
   ══════════════════════════════════════════════════════════ */

export interface TextSegment {
  text: string
  /** Ham metindeki başlangıç indeksi — hocanın seçtiği aralığı eşlemek için */
  start: number
  /** Bitiş indeksi (hariç) */
  end: number
}

/** Bundan kısa parçalar bir öncekine yapıştırılır */
const MIN_SEGMENT = 40

const SENTENCE_END = '.!?…'

/**
 * Noktadan sonra küçük harf geliyorsa cümle bitmemiştir — kısaltmadır.
 * Anatomi metni bunlarla dolu: "N. radialis", "M. deltoideus", "A. brachialis".
 * Bu kontrol olmadan her kısaltma metni ortadan ikiye bölüyordu.
 */
const startsNewSentence = (raw: string, from: number) => {
  const rest = raw.slice(from)
  const next = rest.match(/\S/)
  if (!next) return true // metnin sonu
  return !/\p{Ll}/u.test(next[0])
}

/**
 * Ders notunu sesli okunacak parçalara böler: önce paragraf (boş satır),
 * sonra cümle sonu.
 *
 * Tek kelimelik parçalar hem kötü okunuyor hem de hız bonusunu anlamsız
 * kılıyordu; bu yüzden MIN_SEGMENT'ten kısa olanlar öncekiyle birleşir.
 * Dönen aralıklar ham metne göredir — hoca bir yeri seçtiğinde hangi
 * parçaya düştüğünü buradan buluyoruz.
 */
export function splitSegments(raw: string): TextSegment[] {
  const out: TextSegment[] = []
  let cursor = 0

  const push = (end: number) => {
    const slice = raw.slice(cursor, end)
    const lead = slice.search(/\S/)
    cursor = end
    if (lead < 0) return // yalnızca boşluk

    const text = slice.trim()
    const start = cursor - slice.length + lead
    const prev = out[out.length - 1]

    if (prev && text.length < MIN_SEGMENT) {
      prev.text = `${prev.text} ${text}`
      prev.end = start + text.length
      return
    }
    out.push({ text, start, end: start + text.length })
  }

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]

    if (SENTENCE_END.includes(c)) {
      // "..." gibi ardışık işaretleri tek sayıyoruz
      let j = i
      while (j + 1 < raw.length && SENTENCE_END.includes(raw[j + 1])) j++
      const next = raw[j + 1]
      const atBoundary = next === undefined || /\s/.test(next)
      if (atBoundary && startsNewSentence(raw, j + 1)) push(j + 1)
      i = j
    } else if (c === '\n' && raw[i + 1] === '\n') {
      push(i)
    }
  }
  push(raw.length)

  return out
}

/** Verilen konumun hangi parçaya düştüğü (taşarsa son parça) */
export function segmentIndexAt(segments: TextSegment[], pos: number): number {
  const i = segments.findIndex((s) => pos < s.end)
  return i < 0 ? segments.length - 1 : i
}
