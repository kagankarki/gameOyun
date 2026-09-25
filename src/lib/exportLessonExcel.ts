/**
 * DERS BAZLI ÇOK OYUNLU (ÇOK OTURUMLU) DETAYLI EXCEL RAPORU
 *
 * `exportExcel.ts` tek bir oturumu (oyunu) dışa aktarır. Bu modül ise
 * AYNI DERSTEN açılmış BÜTÜN oyunları tek bir çalışma kitabında, oyunlar
 * arası karşılaştırma ve ham Firebase kayıtlarıyla birlikte üretir.
 *
 * Sekmeler:
 *   1. Genel Bakış            — ders künyesi + oyunlar karşılaştırma tablosu + genel toplamlar
 *   2. Öğrenci (Oyun Bazlı)   — her oyundaki her katılımcı ayrı satır
 *   3. Öğrenci Genel Toplam   — aynı öğrencinin oyunlar arası birleşik istatistiği
 *   4. Yakalama Kayıtları     — HER "HATA VAR" basışının ham dökümü (event log)
 *   5. Tuzak Analizi          — oyun bazında her hata/tuzak için yakalama başarısı
 *   6. Ön/Son Test            — oyun bazında öğrenci kazanımı (pre → post)
 *   7. Anket                  — alt boyut ortalamaları + bireysel M1–M15 yanıtlar
 *   8. Değerlendirmeler       — oyunlar arası 5 yıldız + yorumlar
 *
 * Çıktı: Microsoft Excel ile uyumlu, biçimlendirilmiş SpreadsheetML (.xls).
 */
import { altBoyutOrtalamalari, CALISMA_BASLIGI } from './survey'
import type {
  Catch,
  Lesson,
  LiveSession,
  Participant,
  QuizAnswer,
  SessionRating,
  SessionSecret,
  SurveyResponse,
  WrongBlock,
} from './types'
import { fmtDate, fmtSec } from './utils'

/** Bir oyunun (oturumun) Firebase'den toplanmış tüm alt verisi */
export interface GameData {
  session: LiveSession
  secret: SessionSecret | null
  participants: Participant[]
  catches: Catch[]
  ratings: SessionRating[]
  surveys: SurveyResponse[]
  quizAnswers: QuizAnswer[]
}

export interface LessonExportData {
  lesson: Lesson
  /** Eskiden yeniye sıralı oyunlar (Oyun 1, Oyun 2, …) */
  games: GameData[]
}

/* ── Düşük seviyeli XML yardımcıları ─────────────────────── */

function xmlEscape(val: any): string {
  if (val === undefined || val === null) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cell(
  val: any,
  styleId = 'sData',
  type: 'String' | 'Number' = 'String',
  mergeAcross = 0,
): string {
  const isNum = type === 'Number' && val !== '' && val !== null && val !== undefined && !isNaN(Number(val))
  const t = isNum ? 'Number' : 'String'
  const mergeAttr = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : ''
  return `<Cell ss:StyleID="${styleId}"${mergeAttr}><Data ss:Type="${t}">${xmlEscape(val)}</Data></Cell>`
}

function row(cells: string[], height = 22): string {
  return `<Row ss:Height="${height}">\n${cells.join('\n')}\n</Row>`
}

const blank = () => row([])

/* ── Biçim / alan yardımcıları ───────────────────────────── */

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const letter = (i?: number) => (i === undefined || i < 0 ? '-' : OPTION_LETTERS[i] ?? String(i + 1))

/** Saniye hassasiyetli tam zaman damgası (yakalama olayları için) */
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const modeLabel = (s: LiveSession) => {
  const surum = s.version === 2 ? 'Amfi 2.0 (Not Yazma)' : 'Amfi 1.0 (Zil)'
  const okuma =
    s.readingMode === 'continuous' ? 'Sürekli Okuma' : 'Parçalı Okuma'
  const kaynak = s.video ? 'Video' : s.audio ? 'Ses Kaydı' : 'TTS'
  return `${surum} · ${okuma} · ${kaynak}`
}

/** Bir oyunun hatalarını (tuzaklarını) en güvenilir kaynaktan çıkarır */
function wrongsOf(lesson: Lesson, g: GameData): WrongBlock[] {
  if (g.secret?.wrongBlocks?.length) return g.secret.wrongBlocks
  if (lesson.wrongBlocks?.length) return lesson.wrongBlocks
  return (lesson.blocks || [])
    .filter((b) => b.isWrong)
    .map((b, idx) => ({
      blockIndex: idx,
      text: b.text,
      explanation: '',
      correction: b.correction || '',
      points: 100,
      start: 0,
      end: b.text.length,
      difficulty: 'orta' as const,
    }))
}

/** Öğrenci birleştirme anahtarı — oyunlar arası aynı kişiyi tek satırda topla */
const studentKey = (p: Participant) =>
  p.studentId ?? `ad:${p.name.trim().toLocaleLowerCase('tr-TR')}`

interface GameStats {
  students: number
  wrongCount: number
  hits: number
  misses: number
  falseAlarms: number
  avgScore: number
  hitRate: number
  avgStars: number
  ratingCount: number
  surveyCount: number
  preAvg: number | null
  postAvg: number | null
  gain: number | null
}

function statsOf(lesson: Lesson, g: GameData): GameStats {
  const { participants: ps, catches, ratings, surveys, quizAnswers } = g
  const hits = ps.reduce((s, p) => s + p.hits, 0)
  const misses = ps.reduce((s, p) => s + p.misses, 0)
  const falseAlarms = ps.reduce((s, p) => s + p.falseAlarms, 0)
  const chances = hits + misses
  const wrongCount = g.session.wrongCount || wrongsOf(lesson, g).length
  const avgScore = ps.length ? Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length) : 0
  const hitRate = chances
    ? Math.round((hits / chances) * 100)
    : ps.length && wrongCount
      ? Math.round((hits / (ps.length * wrongCount)) * 100)
      : 0
  const avgStars = ratings.length
    ? Number((ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1))
    : 0

  const avgPercent = (kind: 'pre' | 'post'): number | null => {
    const vals = quizAnswers
      .filter((a) => a.kind === kind && typeof a.percent === 'number')
      .map((a) => a.percent as number)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
  }
  const preAvg = avgPercent('pre')
  const postAvg = avgPercent('post')

  return {
    students: ps.length,
    wrongCount,
    hits,
    misses,
    falseAlarms,
    avgScore,
    hitRate,
    avgStars,
    ratingCount: ratings.length,
    surveyCount: surveys.length,
    preAvg,
    postAvg,
    gain: preAvg !== null && postAvg !== null ? postAvg - preAvg : null,
  }
}

const gameName = (i: number, g: GameData) => `Oyun ${i + 1} · ${g.session.code}`

/* ══════════════════════════════════════════════════════════
   ANA FONKSİYON
   ══════════════════════════════════════════════════════════ */
export function exportLessonToExcel(data: LessonExportData) {
  const { lesson } = data
  // En eski oyun "Oyun 1" olsun
  const games = [...data.games].sort((a, b) => a.session.createdAt - b.session.createdAt)
  const allStats = games.map((g) => statsOf(lesson, g))

  // ────────────────────────────────────────────────────────
  // SAYFA 1 — GENEL BAKIŞ
  // ────────────────────────────────────────────────────────
  const totStudents = allStats.reduce((s, x) => s + x.students, 0)
  const totHits = allStats.reduce((s, x) => s + x.hits, 0)
  const totMiss = allStats.reduce((s, x) => s + x.misses, 0)
  const totFalse = allStats.reduce((s, x) => s + x.falseAlarms, 0)
  const totRatings = allStats.reduce((s, x) => s + x.ratingCount, 0)
  const totSurveys = allStats.reduce((s, x) => s + x.surveyCount, 0)
  const overallHitRate = totHits + totMiss ? Math.round((totHits / (totHits + totMiss)) * 100) : 0
  const starVals = games.flatMap((g) => g.ratings.map((r) => r.stars))
  const overallStars = starVals.length
    ? (starVals.reduce((s, v) => s + v, 0) / starVals.length).toFixed(1)
    : '0.0'

  const s1: string[] = [
    row([cell('GAZİ ÜNİVERSİTESİ — HATAYI YAKALA · DERS DETAY RAPORU', 'sMainTitle', 'String', 16)], 32),
    row([cell(CALISMA_BASLIGI, 'sFaint', 'String', 16)], 20),
    row([cell(`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, 'sFaint', 'String', 16)], 18),
    blank(),
    row([cell('1. DERS KİMLİĞİ', 'sSectionHeader', 'String', 16)], 24),
    row([cell('Ders Başlığı', 'sLabelBold'), cell(lesson.title, 'sDataBold', 'String', 6)]),
    row([cell('Ders Alanı / Konu', 'sLabelBold'), cell(lesson.subject || 'Belirtilmemiş', 'sData', 'String', 6)]),
    row([cell('Öğretim Üyesi', 'sLabelBold'), cell(lesson.teacherName || '-', 'sData', 'String', 6)]),
    row([cell('Toplam Oynatılan Oyun (Oturum)', 'sLabelBold'), cell(games.length, 'sDataBoldCenter', 'Number')]),
    row([cell('Derse Tanımlı Hata/Tuzak Sayısı', 'sLabelBold'), cell(lesson.wrongBlocks?.length || 0, 'sDataCenter', 'Number')]),
    row([cell('Ön Test Soru Sayısı', 'sLabelBold'), cell(lesson.pretest?.length || 0, 'sDataCenter', 'Number')]),
    row([cell('Son Test Soru Sayısı', 'sLabelBold'), cell(lesson.posttest?.length || 0, 'sDataCenter', 'Number')]),
    blank(),
    row([cell('2. TÜM OYUNLARIN TOPLAMI', 'sSectionHeader', 'String', 16)], 24),
    row([cell('Toplam Katılım (kişi-oyun)', 'sLabelBold'), cell(totStudents, 'sDataBoldCenter', 'Number')]),
    row([cell('Genel Doğru Yakalama (Hits)', 'sLabelBold'), cell(totHits, 'sDataNumberGreen', 'Number')]),
    row([cell('Genel Kaçırılan Hata (Misses)', 'sLabelBold'), cell(totMiss, 'sDataNumberRed', 'Number')]),
    row([cell('Genel Hatalı Basış (False Alarms)', 'sLabelBold'), cell(totFalse, 'sDataNumberOrange', 'Number')]),
    row([cell('Genel Hata Yakalama Oranı', 'sLabelBold'), cell(`%${overallHitRate}`, 'sDataBoldCenter', 'String')]),
    row([cell('Genel Memnuniyet Ortalaması', 'sLabelBold'), cell(`${overallStars} / 5`, 'sDataBoldCenter', 'String'), cell(`${totRatings} oy`, 'sFaint')]),
    row([cell('Toplam Araştırma Anketi Yanıtı', 'sLabelBold'), cell(totSurveys, 'sDataCenter', 'Number')]),
    blank(),
    row([cell('3. OYUNLARIN KARŞILAŞTIRMASI', 'sSectionHeader', 'String', 16)], 24),
    row([
      cell('#', 'sHeaderCenter'),
      cell('Oyun / PIN', 'sHeaderLeft'),
      cell('Tarih', 'sHeaderCenter'),
      cell('Mod', 'sHeaderLeft'),
      cell('Katılan', 'sHeaderCenter'),
      cell('Hata', 'sHeaderCenter'),
      cell('Ort. Puan', 'sHeaderRight'),
      cell('Yakalama %', 'sHeaderCenter'),
      cell('Hits', 'sHeaderRight'),
      cell('Misses', 'sHeaderRight'),
      cell('F.Alarm', 'sHeaderRight'),
      cell('Ort. ⭐', 'sHeaderCenter'),
      cell('Anket', 'sHeaderCenter'),
      cell('Ön Test %', 'sHeaderCenter'),
      cell('Son Test %', 'sHeaderCenter'),
      cell('Kazanım', 'sHeaderCenter'),
    ], 30),
  ]

  if (games.length === 0) {
    s1.push(row([cell('Bu derse ait hiç oyun (oturum) bulunamadı.', 'sDataCenter', 'String', 16)], 26))
  } else {
    games.forEach((g, i) => {
      const st = allStats[i]
      s1.push(
        row([
          cell(i + 1, 'sDataCenter', 'Number'),
          cell(g.session.code, 'sDataBold'),
          cell(fmtDate(g.session.createdAt), 'sDataCenter'),
          cell(modeLabel(g.session), 'sData'),
          cell(st.students, 'sDataCenter', 'Number'),
          cell(st.wrongCount, 'sDataCenter', 'Number'),
          cell(st.avgScore, 'sDataNumberBold', 'Number'),
          cell(`%${st.hitRate}`, 'sDataCenter'),
          cell(st.hits, 'sDataNumberGreen', 'Number'),
          cell(st.misses, 'sDataNumberRed', 'Number'),
          cell(st.falseAlarms, 'sDataNumberOrange', 'Number'),
          cell(st.ratingCount ? st.avgStars : '-', 'sDataCenter'),
          cell(st.surveyCount, 'sDataCenter', 'Number'),
          cell(st.preAvg === null ? '—' : st.preAvg, 'sDataCenter', st.preAvg === null ? 'String' : 'Number'),
          cell(st.postAvg === null ? '—' : st.postAvg, 'sDataCenter', st.postAvg === null ? 'String' : 'Number'),
          cell(
            st.gain === null ? '—' : (st.gain > 0 ? `+${st.gain}` : String(st.gain)),
            st.gain === null ? 'sDataCenter' : st.gain > 0 ? 'sDataGreen' : st.gain < 0 ? 'sDataNumberRed' : 'sDataCenter',
          ),
        ], 24),
      )
    })
    s1.push(
      row([
        cell('', 'sTotalCell'),
        cell('GENEL TOPLAM', 'sTotalCell'),
        cell('', 'sTotalCell'),
        cell(`${games.length} oyun`, 'sTotalCell'),
        cell(totStudents, 'sTotalCell', 'Number'),
        cell('', 'sTotalCell'),
        cell('', 'sTotalCell'),
        cell(`%${overallHitRate}`, 'sTotalCell'),
        cell(totHits, 'sTotalCell', 'Number'),
        cell(totMiss, 'sTotalCell', 'Number'),
        cell(totFalse, 'sTotalCell', 'Number'),
        cell(overallStars, 'sTotalCell'),
        cell(totSurveys, 'sTotalCell', 'Number'),
        cell('', 'sTotalCell'),
        cell('', 'sTotalCell'),
        cell('', 'sTotalCell'),
      ], 26),
    )
  }

  // ────────────────────────────────────────────────────────
  // SAYFA 2 — ÖĞRENCİ PERFORMANSI (OYUN BAZLI)
  // ────────────────────────────────────────────────────────
  const s2: string[] = [
    row([cell('ÖĞRENCİ PERFORMANSI — OYUN BAZLI', 'sMainTitle', 'String', 10)], 30),
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('Sıra', 'sHeaderCenter'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Puan', 'sHeaderRight'),
      cell('Hits', 'sHeaderRight'),
      cell('Misses', 'sHeaderRight'),
      cell('F.Alarm', 'sHeaderRight'),
      cell('Başarı %', 'sHeaderCenter'),
      cell('Katılım', 'sHeaderCenter'),
      cell('⭐', 'sHeaderCenter'),
    ], 26),
  ]

  let anyPart = false
  games.forEach((g, gi) => {
    const ranked = [...g.participants].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    if (ranked.length === 0) return
    anyPart = true
    ranked.forEach((p, i) => {
      const tries = p.hits + p.misses
      const succ = tries ? Math.round((p.hits / tries) * 100) : 0
      const star = g.ratings.find((r) => r.participantId === p.id)?.stars
      s2.push(
        row([
          cell(gameName(gi, g), i === 0 ? 'sDataBold' : 'sData'),
          cell(i + 1, i === 0 ? 'sGold' : 'sDataCenter', 'Number'),
          cell(p.name, 'sDataBold'),
          cell(p.score, 'sDataNumberBold', 'Number'),
          cell(p.hits, 'sDataNumberGreen', 'Number'),
          cell(p.misses, 'sDataNumberRed', 'Number'),
          cell(p.falseAlarms, 'sDataNumberOrange', 'Number'),
          cell(`%${succ}`, 'sDataCenter'),
          cell(fmtDate(p.joinedAt), 'sDataCenter'),
          cell(star ? `${star} ⭐` : '-', 'sDataCenter'),
        ], 22),
      )
    })
    s2.push(blank())
  })
  if (!anyPart) s2.push(row([cell('Hiçbir oyunda katılımcı bulunmuyor.', 'sDataCenter', 'String', 9)], 26))

  // ────────────────────────────────────────────────────────
  // SAYFA 3 — ÖĞRENCİ GENEL TOPLAM (OYUNLAR ARASI)
  // ────────────────────────────────────────────────────────
  interface Agg {
    name: string
    games: number
    totalScore: number
    bestScore: number
    hits: number
    misses: number
    falseAlarms: number
  }
  const aggMap = new Map<string, Agg>()
  games.forEach((g) => {
    g.participants.forEach((p) => {
      const key = studentKey(p)
      const a = aggMap.get(key) ?? {
        name: p.name,
        games: 0,
        totalScore: 0,
        bestScore: 0,
        hits: 0,
        misses: 0,
        falseAlarms: 0,
      }
      a.name = p.name
      a.games += 1
      a.totalScore += p.score
      a.bestScore = Math.max(a.bestScore, p.score)
      a.hits += p.hits
      a.misses += p.misses
      a.falseAlarms += p.falseAlarms
      aggMap.set(key, a)
    })
  })
  const aggList = [...aggMap.values()].sort((a, b) => b.totalScore - a.totalScore)

  const s3: string[] = [
    row([cell('ÖĞRENCİ GENEL TOPLAMI — OYUNLAR ARASI BİRLEŞİK', 'sMainTitle', 'String', 9)], 30),
    row([cell('Aynı öğrencinin bütün oyunlardaki performansı tek satırda birleştirilmiştir.', 'sFaint', 'String', 9)], 18),
    row([
      cell('Sıra', 'sHeaderCenter'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Oynadığı Oyun', 'sHeaderCenter'),
      cell('Toplam Puan', 'sHeaderRight'),
      cell('En İyi Puan', 'sHeaderRight'),
      cell('Ort. Puan', 'sHeaderRight'),
      cell('Toplam Hits', 'sHeaderRight'),
      cell('Toplam Misses', 'sHeaderRight'),
      cell('Genel Başarı %', 'sHeaderCenter'),
    ], 26),
  ]
  if (aggList.length === 0) {
    s3.push(row([cell('Katılımcı bulunmuyor.', 'sDataCenter', 'String', 8)], 26))
  } else {
    aggList.forEach((a, i) => {
      const tries = a.hits + a.misses
      const succ = tries ? Math.round((a.hits / tries) * 100) : 0
      s3.push(
        row([
          cell(i + 1, i < 3 ? 'sGold' : 'sDataCenter', 'Number'),
          cell(a.name, 'sDataBold'),
          cell(a.games, 'sDataCenter', 'Number'),
          cell(a.totalScore, 'sDataNumberBold', 'Number'),
          cell(a.bestScore, 'sDataNumber', 'Number'),
          cell(Math.round(a.totalScore / a.games), 'sDataNumber', 'Number'),
          cell(a.hits, 'sDataNumberGreen', 'Number'),
          cell(a.misses, 'sDataNumberRed', 'Number'),
          cell(`%${succ}`, 'sDataCenter'),
        ], 22),
      )
    })
  }

  // ────────────────────────────────────────────────────────
  // SAYFA 4 — YAKALAMA KAYITLARI (HAM EVENT LOG)
  // ────────────────────────────────────────────────────────
  const s4: string[] = [
    row([cell('YAKALAMA KAYITLARI — HAM OLAY DÖKÜMÜ (FIREBASE)', 'sMainTitle', 'String', 11)], 30),
    row([cell('Her "HATA VAR" basışı ayrı satırdır. Firebase\'deki catches koleksiyonunun tam dökümü.', 'sFaint', 'String', 11)], 18),
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Basış Saati', 'sHeaderCenter'),
      cell('Durum', 'sHeaderCenter'),
      cell('Hata No', 'sHeaderCenter'),
      cell('Denk Gelen Hata', 'sHeaderLeft'),
      cell('Puan', 'sHeaderRight'),
      cell('Ek Soru', 'sHeaderLeft'),
      cell('Cevap', 'sHeaderCenter'),
      cell('Sonuç', 'sHeaderCenter'),
      cell('Bonus', 'sHeaderRight'),
    ], 26),
  ]

  const statusLabel: Record<Catch['status'], string> = {
    hit: 'YAKALADI',
    miss: 'BOŞA BASTI',
    pending: 'BEKLEMEDE',
  }
  const statusStyle: Record<Catch['status'], string> = {
    hit: 'sDataGreen',
    miss: 'sDataNumberRed',
    pending: 'sFaint',
  }

  let totalCatches = 0
  games.forEach((g, gi) => {
    if (g.catches.length === 0) return
    const wrongs = wrongsOf(lesson, g)
    const pName = (id: string) => g.participants.find((p) => p.id === id)?.name ?? id
    g.catches.forEach((c) => {
      totalCatches++
      const w = c.wrongIndex !== undefined ? wrongs[c.wrongIndex] : undefined
      const trapText = w
        ? w.videoTimestamp !== undefined
          ? `[⏱️ ${fmtSec(w.videoTimestamp)}] ${w.text}`
          : w.text
        : '—'
      s4.push(
        row([
          cell(gameName(gi, g), 'sData'),
          cell(pName(c.participantId), 'sDataBold'),
          cell(fmtTime(c.flaggedAt), 'sDataCenter'),
          cell(statusLabel[c.status], statusStyle[c.status]),
          cell(c.wrongIndex !== undefined ? c.wrongIndex + 1 : '-', 'sDataCenter'),
          cell(trapText, 'sData'),
          cell(c.points, c.points >= 0 ? 'sDataNumberGreen' : 'sDataNumberRed', 'Number'),
          cell(c.question || '-', 'sData'),
          cell(c.answerIndex !== undefined ? letter(c.answerIndex) : '-', 'sDataCenter'),
          cell(
            c.answerCorrect === undefined ? '-' : c.answerCorrect ? 'DOĞRU' : 'YANLIŞ',
            c.answerCorrect ? 'sDataGreen' : c.answerCorrect === false ? 'sDataNumberRed' : 'sDataCenter',
          ),
          cell(c.bonus ?? 0, 'sDataNumber', 'Number'),
        ], 22),
      )
    })
    s4.push(blank())
  })
  if (totalCatches === 0) {
    s4.push(row([cell('Hiçbir oyunda kayıtlı yakalama (basış) bulunmuyor.', 'sDataCenter', 'String', 10)], 26))
  }

  // ────────────────────────────────────────────────────────
  // SAYFA 5 — TUZAK / HATA ANALİZİ (OYUN BAZLI)
  // ────────────────────────────────────────────────────────
  const s5: string[] = [
    row([cell('TUZAK / HATA ANALİZİ — OYUN BAZLI', 'sMainTitle', 'String', 11)], 30),
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('No', 'sHeaderCenter'),
      cell('Hatalı İfade (Tuzak)', 'sHeaderLeft'),
      cell('Doğrusu', 'sHeaderLeft'),
      cell('Zorluk', 'sHeaderCenter'),
      cell('Yakalayan', 'sHeaderRight'),
      cell('Sınıf %', 'sHeaderCenter'),
      cell('Ek Soru', 'sHeaderLeft'),
      cell('Yanıtlayan', 'sHeaderRight'),
      cell('Doğru Bilen', 'sHeaderRight'),
      cell('Ek Soru %', 'sHeaderCenter'),
    ], 26),
  ]

  let anyTrap = false
  games.forEach((g, gi) => {
    const wrongs = wrongsOf(lesson, g)
    if (wrongs.length === 0) return
    anyTrap = true
    wrongs.forEach((w, i) => {
      const hits = g.catches.filter(
        (c) => c.status === 'hit' && (c.wrongIndex === i || c.wrongIndex === w.blockIndex),
      )
      const answered = hits.filter((c) => c.answerCorrect !== undefined)
      const correct = answered.filter((c) => c.answerCorrect).length
      const pct = g.participants.length ? Math.round((hits.length / g.participants.length) * 100) : 0
      const fuPct = answered.length ? Math.round((correct / answered.length) * 100) : 0
      const trapText = w.videoTimestamp !== undefined ? `[⏱️ ${fmtSec(w.videoTimestamp)}] ${w.text}` : w.text
      s5.push(
        row([
          cell(gameName(gi, g), i === 0 ? 'sDataBold' : 'sData'),
          cell(i + 1, 'sDataCenter', 'Number'),
          cell(trapText, 'sData'),
          cell(w.correction || '-', 'sDataGreen'),
          cell(w.difficulty?.toUpperCase() || 'ORTA', 'sDataCenter'),
          cell(hits.length, 'sDataNumber', 'Number'),
          cell(`%${pct}`, 'sDataCenter'),
          cell(w.followUp?.question || '-', 'sData'),
          cell(answered.length, 'sDataNumber', 'Number'),
          cell(correct, 'sDataNumberGreen', 'Number'),
          cell(`%${fuPct}`, 'sDataCenter'),
        ], 24),
      )
    })
    s5.push(blank())
  })
  if (!anyTrap) s5.push(row([cell('Tanımlı hata/tuzak bulunmuyor.', 'sDataCenter', 'String', 10)], 26))

  // ────────────────────────────────────────────────────────
  // SAYFA 6 — ÖN / SON TEST (OYUN BAZLI KAZANIM)
  // ────────────────────────────────────────────────────────
  const s6: string[] = [
    row([cell('ÖN TEST — SON TEST KARŞILAŞTIRMASI (ÖĞRENME KAZANIMI)', 'sMainTitle', 'String', 9)], 30),
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Ön Doğru', 'sHeaderCenter'),
      cell('Ön %', 'sHeaderCenter'),
      cell('Son Doğru', 'sHeaderCenter'),
      cell('Son %', 'sHeaderCenter'),
      cell('Değişim', 'sHeaderCenter'),
      cell('Durum', 'sHeaderCenter'),
    ], 26),
  ]

  let anyQuiz = false
  games.forEach((g, gi) => {
    if (g.quizAnswers.length === 0) return
    anyQuiz = true
    const pre = new Map(g.quizAnswers.filter((a) => a.kind === 'pre').map((a) => [a.participantId, a]))
    const post = new Map(g.quizAnswers.filter((a) => a.kind === 'post').map((a) => [a.participantId, a]))
    const rows = g.participants
      .map((p) => {
        const a = pre.get(p.id)
        const b = post.get(p.id)
        const pP = a?.percent ?? null
        const poP = b?.percent ?? null
        return { name: p.name, a, b, pP, poP, diff: pP !== null && poP !== null ? poP - pP : null }
      })
      .filter((r) => r.a || r.b)
      .sort((x, y) => (y.diff ?? -999) - (x.diff ?? -999))

    rows.forEach((r) => {
      s6.push(
        row([
          cell(gameName(gi, g), 'sData'),
          cell(r.name, 'sDataBold'),
          cell(r.a ? `${r.a.correctCount ?? '-'}/${r.a.total ?? '-'}` : '—', 'sDataCenter'),
          cell(r.pP === null ? '—' : r.pP, 'sDataCenter', r.pP === null ? 'String' : 'Number'),
          cell(r.b ? `${r.b.correctCount ?? '-'}/${r.b.total ?? '-'}` : '—', 'sDataCenter'),
          cell(r.poP === null ? '—' : r.poP, 'sDataCenter', r.poP === null ? 'String' : 'Number'),
          cell(r.diff === null ? '—' : (r.diff > 0 ? `+${r.diff}` : String(r.diff)),
            r.diff === null ? 'sDataCenter' : r.diff > 0 ? 'sDataGreen' : r.diff < 0 ? 'sDataNumberRed' : 'sDataCenter'),
          cell(
            r.diff === null ? 'Eksik ölçüm' : r.diff > 0 ? 'Yükseldi' : r.diff < 0 ? 'Düştü' : 'Değişmedi',
            'sDataCenter',
          ),
        ], 22),
      )
    })
    // Oyun ortalaması
    const st = allStats[gi]
    s6.push(
      row([
        cell('', 'sTotalCell'),
        cell(`${gameName(gi, g)} — SINIF ORT.`, 'sTotalCell'),
        cell('', 'sTotalCell'),
        cell(st.preAvg === null ? '—' : st.preAvg, 'sTotalCell', st.preAvg === null ? 'String' : 'Number'),
        cell('', 'sTotalCell'),
        cell(st.postAvg === null ? '—' : st.postAvg, 'sTotalCell', st.postAvg === null ? 'String' : 'Number'),
        cell(st.gain === null ? '—' : (st.gain > 0 ? `+${st.gain}` : String(st.gain)), 'sTotalCell'),
        cell('', 'sTotalCell'),
      ], 24),
    )
    s6.push(blank())
  })
  if (!anyQuiz) s6.push(row([cell('Hiçbir oyunda ön/son test uygulanmadı.', 'sDataCenter', 'String', 8)], 26))

  // ────────────────────────────────────────────────────────
  // SAYFA 7 — ANKET (ALT BOYUT + BİREYSEL)
  // ────────────────────────────────────────────────────────
  const allSurveys = games.flatMap((g) => g.surveys)
  const boyutlar = allSurveys.length ? altBoyutOrtalamalari(allSurveys.map((s) => s.likert)) : []

  const s7: string[] = [
    row([cell(CALISMA_BASLIGI, 'sMainTitle', 'String', 21)], 30),
    row([cell('Tüm oyunların anket yanıtları birleştirilmiştir. Ters maddeler (13,14) çevrilmiştir.', 'sFaint', 'String', 21)], 18),
    row([cell('ALT BOYUT ORTALAMALARI', 'sSectionHeader', 'String', 21)], 24),
    row([
      cell('Kod', 'sHeaderCenter'),
      cell('Alt Boyut', 'sHeaderLeft'),
      cell('Maddeler', 'sHeaderCenter'),
      cell('Ortalama (1–5)', 'sHeaderRight'),
      cell('Yanıt (n)', 'sHeaderCenter'),
    ], 26),
  ]
  if (boyutlar.length === 0) {
    s7.push(row([cell('Doldurulmuş anket bulunmuyor.', 'sDataCenter', 'String', 4)], 26))
  } else {
    boyutlar.forEach((b) => {
      s7.push(
        row([
          cell(b.kod, 'sDataCenter'),
          cell(b.baslik, 'sDataBold'),
          cell(`Madde ${b.maddeAraligi}`, 'sDataCenter'),
          cell(b.ortalama.toFixed(2), 'sDataNumberBold', 'Number'),
          cell(allSurveys.length, 'sDataCenter', 'Number'),
        ], 22),
      )
    })
  }
  s7.push(blank())
  s7.push(row([cell('BİREYSEL YANITLAR (M1–M15)', 'sSectionHeader', 'String', 21)], 24))
  s7.push(
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Katılımcı Kodu', 'sHeaderCenter'),
      cell('Grup', 'sHeaderCenter'),
      cell('Önceki Ders', 'sHeaderCenter'),
      cell('Tarih', 'sHeaderCenter'),
      ...Array.from({ length: 15 }, (_, i) => cell(`M${i + 1}`, 'sHeaderCenter')),
    ], 24),
  )
  if (allSurveys.length === 0) {
    s7.push(row([cell('Anket yanıtı kaydedilmedi.', 'sDataCenter', 'String', 21)], 24))
  } else {
    games.forEach((g, gi) => {
      g.surveys.forEach((s) => {
        const p = g.participants.find((x) => x.id === s.participantId)
        s7.push(
          row([
            cell(gameName(gi, g), 'sData'),
            cell(p?.name ?? s.participantId, 'sDataBold'),
            cell(s.katilimciKodu || '-', 'sDataCenter'),
            cell(s.grupKodu || '-', 'sDataCenter'),
            cell(s.oncekiDers?.toUpperCase() || '-', 'sDataCenter'),
            cell(fmtDate(s.createdAt), 'sDataCenter'),
            ...Array.from({ length: 15 }, (_, i) => {
              const v = s.likert[i + 1]
              return cell(v ?? '-', 'sDataCenter', typeof v === 'number' ? 'Number' : 'String')
            }),
          ], 22),
        )
      })
    })
  }

  // ────────────────────────────────────────────────────────
  // SAYFA 8 — DERS DEĞERLENDİRMELERİ (YILDIZ + YORUM)
  // ────────────────────────────────────────────────────────
  const s8: string[] = [
    row([cell('DERS SONU DEĞERLENDİRMELERİ (5 YILDIZ + YORUM)', 'sMainTitle', 'String', 5)], 30),
    row([
      cell('Oyun', 'sHeaderLeft'),
      cell('Öğrenci', 'sHeaderLeft'),
      cell('Yıldız', 'sHeaderCenter'),
      cell('Yorum / Geri Bildirim', 'sHeaderLeft'),
      cell('Tarih', 'sHeaderCenter'),
    ], 26),
  ]
  let anyRating = false
  games.forEach((g, gi) => {
    g.ratings.forEach((r) => {
      anyRating = true
      const p = g.participants.find((x) => x.id === r.participantId)
      s8.push(
        row([
          cell(gameName(gi, g), 'sData'),
          cell(p?.name ?? r.participantName ?? r.participantId, 'sDataBold'),
          cell(`${r.stars} / 5`, 'sDataCenter'),
          cell(r.comment || '(Yorum yazılmadı)', 'sData'),
          cell(fmtDate(r.createdAt), 'sDataCenter'),
        ], 24),
      )
    })
  })
  if (!anyRating) s8.push(row([cell('Hiç değerlendirme yapılmadı.', 'sDataCenter', 'String', 4)], 26))

  // ────────────────────────────────────────────────────────
  // ÇALIŞMA KİTABI ÇERÇEVESİ
  // ────────────────────────────────────────────────────────
  const styles = `
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/><Borders/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/><Interior/><NumberFormat/><Protection/>
    </Style>
    <Style ss:ID="sMainTitle"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="14" ss:Bold="1" ss:Color="#1B2A4A"/></Style>
    <Style ss:ID="sSectionHeader"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1B2A4A"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/></Borders></Style>
    <Style ss:ID="sHeaderCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/></Borders></Style>
    <Style ss:ID="sHeaderLeft"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/></Borders></Style>
    <Style ss:ID="sHeaderRight"><Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/></Borders></Style>
    <Style ss:ID="sLabelBold"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#334155"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
    <Style ss:ID="sData"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataBold"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataBoldCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1B2A4A"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataNumber"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataNumberBold"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataNumberGreen"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataNumberRed"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataNumberOrange"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#C2410C"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sDataGreen"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
    <Style ss:ID="sFaint"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/></Style>
    <Style ss:ID="sGold"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#92400E"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/></Borders></Style>
    <Style ss:ID="sTotalCell"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#334E68" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1B2A4A"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1B2A4A"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1B2A4A"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1B2A4A"/></Borders></Style>`

  const colsFrom = (widths: number[]) => widths.map((w) => `<Column ss:Width="${w}"/>`).join('\n      ')

  const sheet = (name: string, widths: number[], rows: string[]) => `
  <Worksheet ss:Name="${xmlEscape(name)}">
    <Table ss:DefaultRowHeight="20">
      ${colsFrom(widths)}
      ${rows.join('\n      ')}
    </Table>
  </Worksheet>`

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${xmlEscape(lesson.title)} — Ders Detay Raporu</Title>
    <Author>Gazi Üniversitesi · Hatayı Yakala</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <Styles>${styles}
  </Styles>${sheet('Genel Bakis', [45, 130, 130, 220, 70, 55, 80, 90, 60, 65, 70, 65, 60, 80, 80, 80], s1)}${sheet(
    'Ogrenci (Oyun Bazli)',
    [150, 50, 200, 90, 70, 70, 80, 90, 150, 60],
    s2,
  )}${sheet('Ogrenci Genel Toplam', [50, 200, 110, 110, 110, 100, 110, 120, 120], s3)}${sheet(
    'Yakalama Kayitlari',
    [150, 180, 150, 110, 70, 300, 70, 280, 70, 90, 70],
    s4,
  )}${sheet(
    'Tuzak Analizi',
    [150, 45, 300, 220, 90, 90, 90, 280, 100, 100, 100],
    s5,
  )}${sheet('On-Son Test', [150, 200, 90, 70, 90, 70, 90, 110], s6)}${sheet(
    'Anket',
    [150, 200, 130, 90, 100, 130, ...Array.from({ length: 15 }, () => 42)],
    s7,
  )}${sheet('Degerlendirmeler', [150, 200, 90, 420, 160], s8)}
</Workbook>`

  // İndir
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const safeTitle = lesson.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_')
  const fileName = `GaziOyun_DersRaporu_${safeTitle}_${games.length}oyun_${new Date().toISOString().slice(0, 10)}.xls`
  const a = document.createElement('a')
  a.href = url
  a.setAttribute('download', fileName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
