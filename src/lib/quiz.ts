/**
 * ÖN TEST / SON TEST — soru yükleme ve puanlama yardımcıları.
 *
 * Hoca soruları tek tek elle yazmak zorunda kalmasın: Word'den ya da
 * bir soru bankasından kopyaladığı metni olduğu gibi yapıştırabilsin
 * diye tolerant bir ayrıştırıcı yazdım. Desteklenen biçimler:
 *
 *   1) Humerus hangi bölgededir?      ← "1." "1)" "S1:" ya da düz satır
 *   A) Kol      B. Kol      a) Kol    ← harf + ) . - :
 *   ...
 *   Cevap: B                          ← "Cevap: B" / "Doğru: B" / "Answer: 2"
 *
 * Doğru şık ayrıca şıkkın başına yıldız/artı konarak da işaretlenebilir:
 *   *B) Kol
 *
 * JSON de kabul edilir: [{ question, options: [...], correctIndex }]
 * (`answer`/`correct` alanları harf ya da 1'den başlayan numara olabilir.)
 */
import type { PublicQuizQuestion, QuizAnswer, QuizQuestion } from './types'
import { uid } from './utils'

/** Şık harfi → indeks. Türkçe İ/I karmaşasına girmemek için sadece ASCII. */
const HARFLER = 'ABCDEFGH'

const harfIndeksi = (raw: string): number => {
  const h = raw.trim().toLocaleUpperCase('en-US')
  const i = HARFLER.indexOf(h)
  return i
}

/** "B", "b", "2", "Cevap: B" gibi girdileri 0 tabanlı indekse çevirir. */
export function cevapIndeksi(raw: unknown, optionCount: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // JSON'da 0 tabanlı `correctIndex` de gelebilir, 1 tabanlı `answer` de.
    // 0 geldiyse zaten indekstir; şık sayısına sığmıyorsa 1 tabanlı sayarız.
    if (raw >= 0 && raw < optionCount) return raw
    if (raw >= 1 && raw <= optionCount) return raw - 1
    return 0
  }
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const harf = harfIndeksi(s[0])
  if (harf >= 0 && harf < optionCount) return harf
  const n = Number(s.replace(/\D/g, ''))
  if (Number.isFinite(n) && n >= 1 && n <= optionCount) return n - 1
  return 0
}

const SORU_BASI = /^\s*(?:S(?:oru)?\s*)?(\d{1,3})\s*[).:\-–]\s*(.+)$/i
const SIK_BASI = /^\s*([*+✓]?)\s*([A-Ha-h])\s*[).:\-–]\s*(\S.*)$/
const CEVAP_SATIRI = /^\s*(?:cevap|doğru|dogru|yanıt|yanit|answer|key)\s*[:=\-]?\s*(.+)$/i

/** Ayrıştırma sonucu — kısmen başarılı olabilir, hataları da döndürüyoruz. */
export interface ParseResult {
  questions: QuizQuestion[]
  /** Kullanıcıya gösterilecek uyarılar (atlanan satırlar vb.) */
  warnings: string[]
}

interface Taslak {
  question: string
  options: string[]
  correctIndex: number | null
  /** Kaynak metindeki satır — hata mesajında göstermek için */
  line: number
}

/**
 * Yapıştırılan/yüklenen metni sorulara çevirir.
 * JSON ise JSON olarak, değilse satır satır okunur.
 */
export function parseQuestions(raw: string): ParseResult {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return { questions: [], warnings: [] }

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return parseJson(text)
    } catch (e) {
      return { questions: [], warnings: [`JSON okunamadı: ${(e as Error).message}`] }
    }
  }
  return parseText(text)
}

function parseJson(text: string): ParseResult {
  const data = JSON.parse(text) as unknown
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { questions?: unknown }).questions)
      ? ((data as { questions: unknown[] }).questions)
      : []
  if (!arr.length) return { questions: [], warnings: ['JSON içinde soru dizisi bulunamadı.'] }

  const warnings: string[] = []
  const questions: QuizQuestion[] = []

  arr.forEach((item, i) => {
    const o = item as Record<string, unknown>
    const question = String(o.question ?? o.soru ?? o.text ?? '').trim()
    const rawOpts = (o.options ?? o.siklar ?? o.şıklar ?? o.choices) as unknown
    const options = Array.isArray(rawOpts)
      ? rawOpts.map((x) => String(x ?? '').trim()).filter(Boolean)
      : []
    if (!question || options.length < 2) {
      warnings.push(`${i + 1}. kayıt atlandı — soru metni ya da şıklar eksik.`)
      return
    }
    const correctRaw = o.correctIndex ?? o.answer ?? o.correct ?? o.cevap ?? o.dogru
    questions.push({
      id: uid('q'),
      question,
      options: options.slice(0, 5),
      correctIndex: cevapIndeksi(correctRaw, Math.min(options.length, 5)),
      points: 1,
    })
  })

  return { questions, warnings }
}

function parseText(text: string): ParseResult {
  const lines = text.split('\n')
  const warnings: string[] = []
  const taslaklar: Taslak[] = []
  let aktif: Taslak | null = null

  const kapat = () => {
    if (!aktif) return
    if (aktif.options.length >= 2 && aktif.question.trim()) {
      taslaklar.push(aktif)
    } else if (aktif.question.trim()) {
      warnings.push(`"${kisalt(aktif.question)}" atlandı — en az 2 şık gerekiyor.`)
    }
    aktif = null
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return

    // 1) Cevap satırı — açık sorunun doğru şıkkını belirler
    const cevap = trimmed.match(CEVAP_SATIRI)
    if (cevap && aktif && aktif.options.length) {
      aktif.correctIndex = cevapIndeksi(cevap[1], aktif.options.length)
      return
    }

    // 2) Şık satırı
    const sik = trimmed.match(SIK_BASI)
    if (sik && aktif) {
      // Yıldızlı şık doğru cevaptır
      if (sik[1]) aktif.correctIndex = aktif.options.length
      aktif.options.push(sik[3].trim())
      return
    }

    // 3) Numaralı soru satırı
    const soru = trimmed.match(SORU_BASI)
    if (soru) {
      kapat()
      aktif = { question: soru[2].trim(), options: [], correctIndex: null, line: idx + 1 }
      return
    }

    // 4) Şık toplanmamış düz satır — yeni soru sayılır.
    //    Şıklar başladıysa önceki şıkkın devamıdır (uzun şıklar sarabilir).
    if (aktif && aktif.options.length) {
      aktif.options[aktif.options.length - 1] += ' ' + trimmed
      return
    }
    if (aktif) {
      aktif.question += ' ' + trimmed
      return
    }
    aktif = { question: trimmed, options: [], correctIndex: null, line: idx + 1 }
  })
  kapat()

  const questions = taslaklar.map((t) => {
    if (t.correctIndex === null) {
      warnings.push(`"${kisalt(t.question)}" — doğru şık bulunamadı, A olarak işaretlendi.`)
    }
    return {
      id: uid('q'),
      question: t.question.trim(),
      options: t.options.slice(0, 5),
      correctIndex: Math.min(t.correctIndex ?? 0, Math.min(t.options.length, 5) - 1),
      points: 1,
    } satisfies QuizQuestion
  })

  if (!questions.length) {
    warnings.push(
      'Hiç soru okunamadı. Beklenen biçim: “1) Soru”, altına “A) şık”, sonra “Cevap: B”.',
    )
  }
  return { questions, warnings }
}

const kisalt = (s: string) => (s.length > 42 ? s.slice(0, 42) + '…' : s)

/* ══════════════════════════════════════════════════════════
   ÖĞRENCİYE GİDEN HÂL
   ══════════════════════════════════════════════════════════ */

/**
 * Doğru şıkları söker. Öğrencinin telefonu oturum dokümanını okuyabildiği
 * için sorular oraya YALNIZCA bu hâlde yazılır.
 */
export const publicQuestions = (list: QuizQuestion[]): PublicQuizQuestion[] =>
  list.map((q) => ({ id: q.id, question: q.question, options: q.options }))

/* ══════════════════════════════════════════════════════════
   PUANLAMA — hoca cihazında çalışır
   ══════════════════════════════════════════════════════════ */

export interface QuizScore {
  correctCount: number
  total: number
  percent: number
}

export function scoreQuiz(answer: QuizAnswer, questions: QuizQuestion[]): QuizScore {
  const total = questions.length
  const correctCount = questions.reduce(
    (n, q) => n + (answer.answers?.[q.id] === q.correctIndex ? 1 : 0),
    0,
  )
  return {
    correctCount,
    total,
    percent: total ? Math.round((correctCount / total) * 100) : 0,
  }
}

/** Ön test → son test değişimi (yüzde puan farkı). */
export const kazanim = (pre?: QuizScore | null, post?: QuizScore | null): number | null =>
  pre && post ? post.percent - pre.percent : null
