/**
 * EXCEL / CSV RAPOR DIŞA AKTARIMI
 * Oturum sonuçları, öğrenci skorları, soru analizleri, araştırma anketi ve değerlendirmeleri
 * Excel ile %100 uyumlu UTF-8 formatında dışa aktarır.
 */
import { altBoyutOrtalamalari } from './survey'
import type {
  Catch,
  Lesson,
  LiveSession,
  Participant,
  SessionRating,
  SessionSecret,
  SurveyResponse,
} from './types'
import { fmtDate } from './utils'

export interface ExportData {
  lesson: Lesson
  session: LiveSession
  participants: Participant[]
  catches: Catch[]
  secret: SessionSecret | null
  surveys: SurveyResponse[]
  ratings: SessionRating[]
}

/** CSV alanlarını Excel için güvenli hâle getirir */
function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * Oturumun tüm verilerini içeren detaylı bir Excel/CSV raporu oluşturur ve indirir.
 */
export function exportSessionToExcel(data: ExportData) {
  const { lesson, session, participants, catches, secret, surveys, ratings } = data

  const rows: string[] = []

  const addLine = (...cols: (string | number | undefined | null)[]) => {
    rows.push(cols.map(escapeCsv).join(';'))
  }
  const addBlank = () => rows.push('')

  // ─────────────────────────────────────────────────────────────
  // 1. BAŞLIK VE OTURUM ÖZETİ
  // ─────────────────────────────────────────────────────────────
  addLine('GAZİ ÜNİVERSİTESİ - HATAYI YAKALA CANLI DERS OTURUM RAPORU')
  addLine('Rapor Oluşturma Tarihi:', new Date().toLocaleString('tr-TR'))
  addBlank()

  addLine('─── 1. OTURUM GENEL BİLGİLERİ ───')
  addLine('Ders Başlığı', lesson.title)
  addLine('Ders Konusu / Alan', lesson.subject || 'Belirtilmemiş')
  addLine('Öğretim Üyesi', lesson.teacherName || session.teacherName)
  addLine('Oturum Kodu (PIN)', session.code)
  addLine('Oturum Modu', session.version === 2 ? 'Amfi 2.0 (Kesintisiz Okuma)' : 'Amfi v1')
  addLine('Oturum Tarihi', fmtDate(session.createdAt))
  addLine('Toplam Katılımcı Sayısı', participants.length)

  const hitsTotal = participants.reduce((s, p) => s + p.hits, 0)
  const missesTotal = participants.reduce((s, p) => s + p.misses, 0)
  const chancesTotal = hitsTotal + missesTotal
  const avgScore = participants.length
    ? Math.round(participants.reduce((s, p) => s + p.score, 0) / participants.length)
    : 0
  const hitRate = chancesTotal ? Math.round((hitsTotal / chancesTotal) * 100) : 0
  const avgStars = ratings.length
    ? (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1)
    : '0.0'

  addLine('Sınıf Ortalama Puanı', avgScore)
  addLine('Genel Hata Yakalama Başarısı', `%${hitRate}`)
  addLine('Genel Memnuniyet (Yıldız / 5)', `${avgStars} / 5 (${ratings.length} Oy)`)
  addBlank()

  // ─────────────────────────────────────────────────────────────
  // 2. ÖĞRENCİ SKOR TABLOSU & SIRALAMA
  // ─────────────────────────────────────────────────────────────
  addLine('─── 2. ÖĞRENCİ PERFORMANS VE SIRALAMA LİSTESİ ───')
  addLine(
    'Sıra',
    'Öğrenci Adı',
    'Toplam Puan',
    'Doğru Yakalama (Hits)',
    'Kaçırılan Hata (Misses)',
    'Boş / Yanlış Basış (False Alarms)',
    'Yakalama Başarı %',
    'Katılım Saati',
    'Değerlendirme Yıldızı',
  )

  const ranked = [...participants].sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  )

  ranked.forEach((p, i) => {
    const totalTries = p.hits + p.misses
    const pSuccess = totalTries ? Math.round((p.hits / totalTries) * 100) : 0
    const pRating = ratings.find((r) => r.participantId === p.id)?.stars ?? '-'

    addLine(
      i + 1,
      p.name,
      p.score,
      p.hits,
      p.misses,
      p.falseAlarms,
      `%${pSuccess}`,
      fmtDate(p.joinedAt),
      pRating,
    )
  })
  addBlank()

  // ─────────────────────────────────────────────────────────────
  // 3. HATA / TUZAK & 5 ŞIKLI SORU BAŞARI ANALİZİ
  // ─────────────────────────────────────────────────────────────
  addLine('─── 3. TUZAKLAR VE 5 ŞIKLI SORULAR BAŞARI ANALİZİ ───')
  addLine(
    'Tuzak No',
    'Okunan Hatalı Cümle',
    'Neden Yanlış (Açıklama)',
    'Doğrusu',
    'Zorluk',
    'Yakalayan Öğrenci Sayısı',
    'Sınıf Yakalama Oranı %',
    'Ek Soruyu Yanıtlayan',
    'Ek Soruyu Doğru Bilen',
    'Ek Soru Başarı %',
  )

  const wrongs = secret?.wrongBlocks?.length ? secret.wrongBlocks : (lesson.wrongBlocks ?? [])
  wrongs.forEach((w, i) => {
    const hits = catches.filter((c) => c.status === 'hit' && c.wrongIndex === i)
    const cevaplanan = hits.filter((c) => c.answerCorrect !== undefined)
    const dogru = cevaplanan.filter((c) => c.answerCorrect).length
    const pct = participants.length ? Math.round((hits.length / participants.length) * 100) : 0
    const fuPct = cevaplanan.length ? Math.round((dogru / cevaplanan.length) * 100) : 0

    addLine(
      i + 1,
      w.text,
      w.explanation,
      w.correction || '-',
      w.difficulty?.toUpperCase() || 'ORTA',
      hits.length,
      `%${pct}`,
      cevaplanan.length,
      dogru,
      `%${fuPct}`,
    )
  })
  addBlank()

  // ─────────────────────────────────────────────────────────────
  // 4. ARAŞTIRMA ANKETİ ALT BOYUTLARI
  // ─────────────────────────────────────────────────────────────
  addLine('─── 4. ARAŞTIRMA ANKETİ ALT BOYUT ORTALAMALARI ───')
  addLine('Boyut Kodu', 'Boyut Başlığı', 'Ortalama Puan (1 - 5)', 'Toplam Yanıt Sayısı')

  const boyutlar = surveys.length ? altBoyutOrtalamalari(surveys.map((s) => s.likert)) : []
  boyutlar.forEach((b) => {
    addLine(b.kod, b.baslik, b.ortalama.toFixed(2), surveys.length)
  })
  addBlank()

  // ─────────────────────────────────────────────────────────────
  // 5. BİREYSEL ANKET YANITLARI
  // ─────────────────────────────────────────────────────────────
  addLine('─── 5. ÖĞRENCİ BAZINDA BİREYSEL ANKET YANITLARI ───')
  if (surveys.length > 0) {
    const surveyHeaders = [
      'Öğrenci Adı',
      'Anket Tarihi',
      ...Array.from({ length: 30 }, (_, idx) => `M${idx + 1}`),
    ]
    addLine(...surveyHeaders)

    surveys.forEach((s) => {
      const p = participants.find((part) => part.id === s.participantId)
      const pName = p ? p.name : s.participantId
      const itemScores = Array.from({ length: 30 }, (_, idx) => s.likert[idx + 1] ?? '-')
      addLine(pName, fmtDate(s.createdAt), ...itemScores)
    })
  } else {
    addLine('Bu oturum için henüz doldurulmuş anket bulunmuyor.')
  }
  addBlank()

  // ─────────────────────────────────────────────────────────────
  // 6. DERS SONU YILDIZ VE GERİ BİLDİRİMLER
  // ─────────────────────────────────────────────────────────────
  addLine('─── 6. DERS SONU YILDIZ DEĞERLENDİRMELERİ VE YORUMLAR ───')
  addLine('Öğrenci Adı', 'Yıldız (1-5)', 'Tarih')
  if (ratings.length > 0) {
    ratings.forEach((r) => {
      const p = participants.find((part) => part.id === r.participantId)
      addLine(p ? p.name : r.participantId, `${r.stars} Yıldız`, fmtDate(r.createdAt))
    })
  } else {
    addLine('Henüz yıldız değerlendirmesi yapılmadı.')
  }

  // ─────────────────────────────────────────────────────────────
  // DOSYA İNDİRME TETİKLEME (UTF-8 BOM ile Excel uyumlu)
  // ─────────────────────────────────────────────────────────────
  const csvContent = '\uFEFF' + rows.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const sanitizedTitle = lesson.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_')
  const fileName = `Oturum_Raporu_${sanitizedTitle}_${session.code}_${new Date().toISOString().slice(0, 10)}.csv`

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
