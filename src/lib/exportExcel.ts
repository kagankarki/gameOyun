/**
 * EXCEL / SPREADSHEETML ÇOK SAYFALI RAPOR DIŞA AKTARIMI
 * Oturum sonuçları, öğrenci skorları, soru analizleri, araştırma anketi ve değerlendirmeleri
 * Microsoft Excel ile %100 uyumlu, sekmeli (multi-sheet), renkli ve biçimlendirilmiş .xls formatında üretir.
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
  /** Ön test / son test kâğıtları — hoca cihazında notlanmış hâlleri */
  quizAnswers?: QuizAnswer[]
}

function xmlEscape(val: any): string {
  if (val === undefined || val === null) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function makeCell(
  val: any,
  styleId = 'sData',
  type: 'String' | 'Number' = 'String',
  mergeAcross = 0,
): string {
  const isNum = type === 'Number' && !isNaN(Number(val)) && val !== ''
  const t = isNum ? 'Number' : 'String'
  const v = xmlEscape(val)
  const mergeAttr = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : ''
  return `<Cell ss:StyleID="${styleId}"${mergeAttr}><Data ss:Type="${t}">${v}</Data></Cell>`
}

function makeRow(cells: string[], height = 22): string {
  return `<Row ss:Height="${height}">\n${cells.join('\n')}\n</Row>`
}

/**
 * Oturumun tüm verilerini içeren çok sekmeli, biçimlendirilmiş bir Excel çalışma kitabı oluşturur ve indirir.
 */
export function exportSessionToExcel(data: ExportData) {
  const { lesson, session, participants, catches, secret, surveys, ratings } = data
  const quizAnswers = data.quizAnswers ?? []

  const hitsTotal = participants.reduce((s, p) => s + p.hits, 0)
  const missesTotal = participants.reduce((s, p) => s + p.misses, 0)
  const falseAlarmsTotal = participants.reduce((s, p) => s + p.falseAlarms, 0)
  const chancesTotal = hitsTotal + missesTotal
  const avgScore = participants.length
    ? Math.round(participants.reduce((s, p) => s + p.score, 0) / participants.length)
    : 0
  const hitRate = chancesTotal
    ? Math.round((hitsTotal / chancesTotal) * 100)
    : participants.length && (session.wrongCount || lesson.wrongBlocks?.length)
      ? Math.round(
          (hitsTotal /
            (participants.length * (session.wrongCount || lesson.wrongBlocks?.length || 1))) *
            100,
        )
      : 0
  const avgStars = ratings.length
    ? (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1)
    : '0.0'

  const ranked = [...participants].sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  )

  const wrongs = secret?.wrongBlocks?.length
    ? secret.wrongBlocks
    : lesson.wrongBlocks?.length
      ? lesson.wrongBlocks
      : (lesson.blocks || [])
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

  const boyutlar = surveys.length ? altBoyutOrtalamalari(surveys.map((s) => s.likert)) : []

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 1: OTURUM ÖZETİ
  // ══════════════════════════════════════════════════════════════════
  const sheet1Rows: string[] = [
    makeRow(
      [
        makeCell(
          'GAZİ ÜNİVERSİTESİ - HATAYI YAKALA CANLI DERS RAPORU',
          'sMainTitle',
          'String',
          4,
        ),
      ],
      32,
    ),
    makeRow([makeCell(CALISMA_BASLIGI, 'sFaint', 'String', 4)], 34),
    makeRow([makeCell(`Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, 'sFaint', 'String', 4)], 18),
    makeRow([]), // boş satır
    makeRow([makeCell('1. OTURUM KİMLİK BİLGİLERİ', 'sSectionHeader', 'String', 4)], 24),
    makeRow([
      makeCell('Ders Başlığı', 'sLabelBold'),
      makeCell(lesson.title, 'sData', 'String', 3),
    ]),
    makeRow([
      makeCell('Ders Alanı / Konu', 'sLabelBold'),
      makeCell(lesson.subject || 'Belirtilmemiş', 'sData', 'String', 3),
    ]),
    makeRow([
      makeCell('Öğretim Üyesi', 'sLabelBold'),
      makeCell(lesson.teacherName || session.teacherName, 'sData', 'String', 3),
    ]),
    makeRow([
      makeCell('Oturum PIN / Kodu', 'sLabelBold'),
      makeCell(session.code, 'sDataBoldCenter', 'String', 3),
    ]),
    makeRow([
      makeCell('Oturum Modu', 'sLabelBold'),
      makeCell(
        session.version === 2
          ? 'Canlı Amfi (Kesintisiz Sesli Anlatım)'
          : 'Klasik Mod (Parçalı Okuma)',
        'sData',
        'String',
        3,
      ),
    ]),
    makeRow([
      makeCell('Oturum Tarihi', 'sLabelBold'),
      makeCell(fmtDate(session.createdAt), 'sData', 'String', 3),
    ]),
    makeRow([]), // boş satır
    makeRow([makeCell('2. SINIF PERFORMANS VE İSTATİSTİK ÖZETİ', 'sSectionHeader', 'String', 4)], 24),
    makeRow([
      makeCell('Toplam Katılan Öğrenci', 'sLabelBold'),
      makeCell(participants.length, 'sDataCenter', 'Number'),
      makeCell('Öğrenci', 'sFaint'),
    ]),
    makeRow([
      makeCell('Dersteki Gizli Hata Sayısı', 'sLabelBold'),
      makeCell(session.wrongCount || wrongs.length, 'sDataCenter', 'Number'),
      makeCell('Hata', 'sFaint'),
    ]),
    makeRow([
      makeCell('Sınıf Ortalama Puanı', 'sLabelBold'),
      makeCell(avgScore, 'sDataCenter', 'Number'),
      makeCell('Puan', 'sFaint'),
    ]),
    makeRow([
      makeCell('Sınıf Hata Yakalama Başarısı', 'sLabelBold'),
      makeCell(`%${hitRate}`, 'sDataCenter', 'String'),
      makeCell('Yakalama Oranı', 'sFaint'),
    ]),
    makeRow([
      makeCell('Toplam Doğru Yakalama (Hits)', 'sLabelBold'),
      makeCell(hitsTotal, 'sDataCenter', 'Number'),
      makeCell('Adet', 'sFaint'),
    ]),
    makeRow([
      makeCell('Toplam Kaçırılan Hata (Misses)', 'sLabelBold'),
      makeCell(missesTotal, 'sDataCenter', 'Number'),
      makeCell('Adet', 'sFaint'),
    ]),
    makeRow([
      makeCell('Toplam Hatalı Basış (False Alarms)', 'sLabelBold'),
      makeCell(falseAlarmsTotal, 'sDataCenter', 'Number'),
      makeCell('Adet', 'sFaint'),
    ]),
    makeRow([
      makeCell('Ders Sonu Memnuniyet Ortalaması', 'sLabelBold'),
      makeCell(`${avgStars} / 5`, 'sDataCenter', 'String'),
      makeCell(`${ratings.length} Öğrenci Oyu`, 'sFaint'),
    ]),
    makeRow([
      makeCell('Tamamlanan Araştırma Anketi', 'sLabelBold'),
      makeCell(surveys.length, 'sDataCenter', 'Number'),
      makeCell('Öğrenci Yanıtı', 'sFaint'),
    ]),
  ]

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 2: ÖĞRENCİ SIRALAMASI
  // ══════════════════════════════════════════════════════════════════
  const sheet2Rows: string[] = [
    makeRow(
      [
        makeCell(
          'ÖĞRENCİ PERFORMANS VE DERECELENDİRME SIRALAMASI',
          'sMainTitle',
          'String',
          8,
        ),
      ],
      30,
    ),
    makeRow([
      makeCell('Sıra', 'sHeaderCenter'),
      makeCell('Öğrenci Adı Soyadı', 'sHeaderLeft'),
      makeCell('Toplam Puan', 'sHeaderRight'),
      makeCell('Doğru Yakalama (Hits)', 'sHeaderRight'),
      makeCell('Kaçırılan Hata (Misses)', 'sHeaderRight'),
      makeCell('Hatalı Basış (False Alarms)', 'sHeaderRight'),
      makeCell('Başarı Oranı %', 'sHeaderCenter'),
      makeCell('Katılım Zamanı', 'sHeaderCenter'),
      makeCell('Ders Yıldızı (1-5)', 'sHeaderCenter'),
    ], 26),
  ]

  if (ranked.length === 0) {
    sheet2Rows.push(
      makeRow([makeCell('Bu oturuma henüz katılan öğrenci bulunmuyor.', 'sDataCenter', 'String', 8)], 26),
    )
  } else {
    ranked.forEach((p, i) => {
      const totalTries = p.hits + p.misses
      const pSuccess = totalTries ? Math.round((p.hits / totalTries) * 100) : 0
      const pRating = ratings.find((r) => r.participantId === p.id)?.stars ?? '-'

      let rankStyle = 'sDataCenter'
      let nameStyle = 'sDataBold'
      if (i === 0) {
        rankStyle = 'sGold'
        nameStyle = 'sGold'
      } else if (i === 1) {
        rankStyle = 'sSilver'
        nameStyle = 'sSilver'
      } else if (i === 2) {
        rankStyle = 'sBronze'
        nameStyle = 'sBronze'
      }

      sheet2Rows.push(
        makeRow([
          makeCell(i + 1, rankStyle, 'Number'),
          makeCell(p.name, nameStyle),
          makeCell(p.score, 'sDataNumberBold', 'Number'),
          makeCell(p.hits, 'sDataNumberGreen', 'Number'),
          makeCell(p.misses, 'sDataNumberRed', 'Number'),
          makeCell(p.falseAlarms, 'sDataNumberOrange', 'Number'),
          makeCell(`%${pSuccess}`, 'sDataCenter', 'String'),
          makeCell(fmtDate(p.joinedAt), 'sDataCenter', 'String'),
          makeCell(pRating !== '-' ? `${pRating} ⭐` : '-', 'sDataCenter', 'String'),
        ], 22),
      )
    })
  }

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 3: TUZAKLAR VE 5 ŞIKLI SORULAR
  // ══════════════════════════════════════════════════════════════════
  const sheet3Rows: string[] = [
    makeRow(
      [
        makeCell(
          'TUZAKLAR VE 5 ŞIKLI SORULAR BAŞARI ANALİZİ',
          'sMainTitle',
          'String',
          10,
        ),
      ],
      30,
    ),
    makeRow([
      makeCell('No', 'sHeaderCenter'),
      makeCell('Okunan Hatalı Cümle (Tuzak)', 'sHeaderLeft'),
      makeCell('Neden Yanlış (Açıklama)', 'sHeaderLeft'),
      makeCell('Doğru İfade', 'sHeaderLeft'),
      makeCell('Zorluk', 'sHeaderCenter'),
      makeCell('Yakalayan Öğrenci', 'sHeaderRight'),
      makeCell('Sınıf Yakalama %', 'sHeaderCenter'),
      makeCell('5 Şıklı Ek Soru', 'sHeaderLeft'),
      makeCell('Ek Soruyu Yanıtlayan', 'sHeaderRight'),
      makeCell('Doğru Bilen', 'sHeaderRight'),
      makeCell('Ek Soru Başarı %', 'sHeaderCenter'),
    ], 26),
  ]

  if (wrongs.length === 0) {
    sheet3Rows.push(
      makeRow([makeCell('Bu derste tanımlanmış hata/tuzak bulunmuyor.', 'sDataCenter', 'String', 10)], 26),
    )
  } else {
    wrongs.forEach((w, i) => {
      const hits = catches.filter(
        (c) => c.status === 'hit' && (c.wrongIndex === i || c.wrongIndex === (w as any).blockIndex),
      )
      const cevaplanan = hits.filter((c) => c.answerCorrect !== undefined)
      const dogru = cevaplanan.filter((c) => c.answerCorrect).length
      const pct = participants.length ? Math.round((hits.length / participants.length) * 100) : 0
      const fuPct = cevaplanan.length ? Math.round((dogru / cevaplanan.length) * 100) : 0

      sheet3Rows.push(
        makeRow([
          makeCell(i + 1, 'sDataCenter', 'Number'),
          makeCell(w.text, 'sData'),
          makeCell(w.explanation || '-', 'sData'),
          makeCell(w.correction || '-', 'sDataGreen'),
          makeCell(w.difficulty?.toUpperCase() || 'ORTA', 'sDataCenter'),
          makeCell(hits.length, 'sDataNumber', 'Number'),
          makeCell(`%${pct}`, 'sDataCenter', 'String'),
          makeCell(w.followUp?.question || '-', 'sData'),
          makeCell(cevaplanan.length, 'sDataNumber', 'Number'),
          makeCell(dogru, 'sDataNumberGreen', 'Number'),
          makeCell(`%${fuPct}`, 'sDataCenter', 'String'),
        ], 24),
      )
    })
  }

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 4: ARAŞTIRMA ANKETİ (ÖZET & BİREYSEL)
  // ══════════════════════════════════════════════════════════════════
  const sheet4Rows: string[] = [
    makeRow(
      [
        makeCell(
          'ARAŞTIRMA ANKETİ ALT BOYUTLARI VE ORTALAMALARI',
          'sMainTitle',
          'String',
          4,
        ),
      ],
      30,
    ),
    makeRow([
      makeCell('Alt Boyut Kodu', 'sHeaderCenter'),
      makeCell('Alt Boyut Başlığı', 'sHeaderLeft'),
      makeCell('Ortalama Puan (1 - 5)', 'sHeaderRight'),
      makeCell('Dolduran Öğrenci Sayısı', 'sHeaderCenter'),
    ], 26),
  ]

  if (boyutlar.length === 0) {
    sheet4Rows.push(
      makeRow([makeCell('Henüz doldurulmuş araştırma anketi bulunmuyor.', 'sDataCenter', 'String', 3)], 26),
    )
  } else {
    boyutlar.forEach((b) => {
      sheet4Rows.push(
        makeRow([
          makeCell(b.kod, 'sDataCenter'),
          makeCell(b.baslik, 'sDataBold'),
          makeCell(b.ortalama.toFixed(2), 'sDataNumberBold', 'Number'),
          makeCell(surveys.length, 'sDataCenter', 'Number'),
        ], 22),
      )
    })
  }

  sheet4Rows.push(makeRow([]))
  sheet4Rows.push(
    makeRow([makeCell('BİREYSEL ÖĞRENCİ ANKET YANITLARI (M1–M30 LIKERT)', 'sSectionHeader', 'String', 33)], 24),
  )

  const surveyHeaderCells = [
    makeCell('Sıra', 'sHeaderCenter'),
    makeCell('Öğrenci Adı / Kodu', 'sHeaderLeft'),
    makeCell('Katılımcı Kodu', 'sHeaderCenter'),
    makeCell('Grup Kodu', 'sHeaderCenter'),
    makeCell('Daha Önce Ders Aldı mı?', 'sHeaderCenter'),
    makeCell('Tarih', 'sHeaderCenter'),
    ...Array.from({ length: 30 }, (_, idx) => makeCell(`M${idx + 1}`, 'sHeaderCenter')),
  ]
  sheet4Rows.push(makeRow(surveyHeaderCells, 24))

  if (surveys.length === 0) {
    sheet4Rows.push(
      makeRow([makeCell('Henüz anket yanıtı kaydedilmedi.', 'sDataCenter', 'String', 35)], 24),
    )
  } else {
    surveys.forEach((s, idx) => {
      const p = participants.find((part) => part.id === s.participantId)
      const pName = p ? p.name : s.participantId
      const itemCells = Array.from({ length: 30 }, (_, mIdx) => {
        const val = s.likert[mIdx + 1]
        return makeCell(val !== undefined ? val : '-', 'sDataCenter', typeof val === 'number' ? 'Number' : 'String')
      })

      sheet4Rows.push(
        makeRow([
          makeCell(idx + 1, 'sDataCenter', 'Number'),
          makeCell(pName, 'sDataBold'),
          makeCell(s.katilimciKodu || '-', 'sDataCenter'),
          makeCell(s.grupKodu || '-', 'sDataCenter'),
          makeCell(s.oncekiDers?.toUpperCase() || '-', 'sDataCenter'),
          makeCell(fmtDate(s.createdAt), 'sDataCenter'),
          ...itemCells,
        ], 22),
      )
    })
  }

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 5: DERS SONU YILDIZ DEĞERLENDİRMELERİ
  // ══════════════════════════════════════════════════════════════════
  const sheet5Rows: string[] = [
    makeRow(
      [
        makeCell(
          'DERS SONU 5 YILDIZ DEĞERLENDİRMELERİ VE YORUMLAR',
          'sMainTitle',
          'String',
          4,
        ),
      ],
      30,
    ),
    makeRow([
      makeCell('Sıra', 'sHeaderCenter'),
      makeCell('Öğrenci Adı Soyadı', 'sHeaderLeft'),
      makeCell('Verilen Yıldız (1–5)', 'sHeaderCenter'),
      makeCell('Öğrencinin Yorumu / Geri Bildirimi', 'sHeaderLeft'),
      makeCell('Değerlendirme Tarihi', 'sHeaderCenter'),
    ], 26),
  ]

  if (ratings.length === 0) {
    sheet5Rows.push(
      makeRow([makeCell('Henüz ders değerlendirmesi yapılmadı.', 'sDataCenter', 'String', 4)], 26),
    )
  } else {
    ratings.forEach((r, idx) => {
      const p = participants.find((part) => part.id === r.participantId)
      const pName = p ? p.name : r.participantName || r.participantId

      sheet5Rows.push(
        makeRow([
          makeCell(idx + 1, 'sDataCenter', 'Number'),
          makeCell(pName, 'sDataBold'),
          makeCell(`${r.stars} Yıldız (${r.stars}/5)`, 'sDataCenter', 'String'),
          makeCell(r.comment || '(Yorum yazılmadı)', 'sData'),
          makeCell(fmtDate(r.createdAt), 'sDataCenter'),
        ], 24),
      )
    })
  }

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 6: ÖN TEST — SON TEST KARŞILAŞTIRMASI
  // Araştırmanın asıl ölçümü: aynı öğrencinin ders öncesi ve sonrası
  // başarısı ile aradaki fark (kazanım).
  // ══════════════════════════════════════════════════════════════════
  const preByPart = new Map(quizAnswers.filter((a) => a.kind === 'pre').map((a) => [a.participantId, a]))
  const postByPart = new Map(quizAnswers.filter((a) => a.kind === 'post').map((a) => [a.participantId, a]))

  const yuzde = (a: QuizAnswer | undefined) =>
    a?.percent !== undefined ? a.percent : null

  const sheet6Rows: string[] = [
    makeRow(
      [makeCell('ÖN TEST — SON TEST KARŞILAŞTIRMASI (ÖĞRENME KAZANIMI)', 'sMainTitle', 'String', 7)],
      30,
    ),
    makeRow([
      makeCell('Sıra', 'sHeaderCenter'),
      makeCell('Öğrenci Adı Soyadı', 'sHeaderLeft'),
      makeCell('Ön Test Doğru', 'sHeaderCenter'),
      makeCell('Ön Test %', 'sHeaderCenter'),
      makeCell('Son Test Doğru', 'sHeaderCenter'),
      makeCell('Son Test %', 'sHeaderCenter'),
      makeCell('Değişim (puan)', 'sHeaderCenter'),
      makeCell('Durum', 'sHeaderCenter'),
    ], 26),
  ]

  if (!quizAnswers.length) {
    sheet6Rows.push(
      makeRow(
        [makeCell('Bu oturumda ön test / son test uygulanmadı.', 'sDataCenter', 'String', 7)],
        26,
      ),
    )
  } else {
    const satirlar = participants
      .map((p) => {
        const pre = preByPart.get(p.id)
        const post = postByPart.get(p.id)
        const preP = yuzde(pre)
        const postP = yuzde(post)
        return {
          ad: p.name,
          pre,
          post,
          preP,
          postP,
          fark: preP !== null && postP !== null ? postP - preP : null,
        }
      })
      .sort((a, b) => (b.fark ?? -999) - (a.fark ?? -999))

    satirlar.forEach((r, idx) => {
      sheet6Rows.push(
        makeRow([
          makeCell(idx + 1, 'sDataCenter', 'Number'),
          makeCell(r.ad, 'sDataBold'),
          makeCell(r.pre ? `${r.pre.correctCount ?? '-'}/${r.pre.total ?? '-'}` : '—', 'sDataCenter'),
          makeCell(r.preP === null ? '—' : r.preP, 'sDataCenter', r.preP === null ? 'String' : 'Number'),
          makeCell(r.post ? `${r.post.correctCount ?? '-'}/${r.post.total ?? '-'}` : '—', 'sDataCenter'),
          makeCell(r.postP === null ? '—' : r.postP, 'sDataCenter', r.postP === null ? 'String' : 'Number'),
          makeCell(r.fark === null ? '—' : r.fark, 'sDataCenter', r.fark === null ? 'String' : 'Number'),
          makeCell(
            r.fark === null
              ? 'Eksik ölçüm'
              : r.fark > 0
                ? 'Yükseldi'
                : r.fark < 0
                  ? 'Düştü'
                  : 'Değişmedi',
            'sDataCenter',
          ),
        ], 24),
      )
    })

    // Sınıf ortalamaları
    const ort = (list: (number | null)[]) => {
      const v = list.filter((x): x is number => x !== null)
      return v.length ? Math.round(v.reduce((t, x) => t + x, 0) / v.length) : null
    }
    const preOrt = ort(satirlar.map((r) => r.preP))
    const postOrt = ort(satirlar.map((r) => r.postP))

    sheet6Rows.push(makeRow([]))
    sheet6Rows.push(
      makeRow([
        makeCell('', 'sDataCenter'),
        makeCell('SINIF ORTALAMASI', 'sHeaderLeft'),
        makeCell('', 'sDataCenter'),
        makeCell(preOrt === null ? '—' : preOrt, 'sDataCenter', preOrt === null ? 'String' : 'Number'),
        makeCell('', 'sDataCenter'),
        makeCell(postOrt === null ? '—' : postOrt, 'sDataCenter', postOrt === null ? 'String' : 'Number'),
        makeCell(
          preOrt === null || postOrt === null ? '—' : postOrt - preOrt,
          'sDataCenter',
          preOrt === null || postOrt === null ? 'String' : 'Number',
        ),
        makeCell('', 'sDataCenter'),
      ], 26),
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // SPREADSHEETML XML ÇERÇEVESİ VE STİLLER
  // ══════════════════════════════════════════════════════════════════
  const xmlWorkbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${xmlEscape(CALISMA_BASLIGI)}</Title>
    <Author>Prof. Dr. Tuncay Peker - Gazi Üniversitesi</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="sMainTitle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="14" ss:Bold="1" ss:Color="#1B2A4A"/>
    </Style>
    <Style ss:ID="sSectionHeader">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1B2A4A"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      </Borders>
    </Style>
    <Style ss:ID="sHeaderCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      </Borders>
    </Style>
    <Style ss:ID="sHeaderLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      </Borders>
    </Style>
    <Style ss:ID="sHeaderRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1B2A4A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334E68"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
      </Borders>
    </Style>
    <Style ss:ID="sLabelBold">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#334155"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>
    <Style ss:ID="sData">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataBold">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataBoldCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1B2A4A"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataNumberBold">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataNumberGreen">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataNumberRed">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataNumberOrange">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#C2410C"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sDataGreen">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sFaint">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/>
    </Style>
    <Style ss:ID="sGold">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#92400E"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCD34D"/>
      </Borders>
    </Style>
    <Style ss:ID="sSilver">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#334155"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>
    <Style ss:ID="sBronze">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#7C2D12"/>
      <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      </Borders>
    </Style>
  </Styles>

  <!-- SEKME 1: OTURUM ÖZETİ -->
  <Worksheet ss:Name="Oturum Ozeti">
    <Table ss:DefaultRowHeight="20">
      <Column ss:Width="200"/>
      <Column ss:Width="160"/>
      <Column ss:Width="140"/>
      <Column ss:Width="140"/>
      <Column ss:Width="120"/>
      ${sheet1Rows.join('\n      ')}
    </Table>
  </Worksheet>

  <!-- SEKME 2: ÖĞRENCİ SIRALAMASI -->
  <Worksheet ss:Name="Ogrenci Siralamasi">
    <Table ss:DefaultRowHeight="20">
      <Column ss:Width="50"/>
      <Column ss:Width="220"/>
      <Column ss:Width="110"/>
      <Column ss:Width="140"/>
      <Column ss:Width="140"/>
      <Column ss:Width="150"/>
      <Column ss:Width="120"/>
      <Column ss:Width="160"/>
      <Column ss:Width="130"/>
      ${sheet2Rows.join('\n      ')}
    </Table>
  </Worksheet>

  <!-- SEKME 3: TUZAK VE SORU ANALİZİ -->
  <Worksheet ss:Name="Tuzak ve Soru Analizi">
    <Table ss:DefaultRowHeight="20">
      <Column ss:Width="45"/>
      <Column ss:Width="280"/>
      <Column ss:Width="240"/>
      <Column ss:Width="200"/>
      <Column ss:Width="90"/>
      <Column ss:Width="130"/>
      <Column ss:Width="120"/>
      <Column ss:Width="280"/>
      <Column ss:Width="140"/>
      <Column ss:Width="110"/>
      <Column ss:Width="120"/>
      ${sheet3Rows.join('\n      ')}
    </Table>
  </Worksheet>

  <!-- SEKME 4: ARAŞTIRMA ANKETİ -->
  <Worksheet ss:Name="Arastirma Anketi">
    <Table ss:DefaultRowHeight="20">
      <Column ss:Width="100"/>
      <Column ss:Width="260"/>
      <Column ss:Width="140"/>
      <Column ss:Width="150"/>
      <Column ss:Width="150"/>
      <Column ss:Width="140"/>
      ${Array.from({ length: 30 }, () => '<Column ss:Width="45"/>').join('\n      ')}
      ${sheet4Rows.join('\n      ')}
    </Table>
  </Worksheet>

  <!-- SEKME 5: DERS DEĞERLENDİRMELERİ -->
  <Worksheet ss:Name="Ders Degerlendirmeleri">
    <Table ss:DefaultRowHeight="20">
      <Column ss:Width="50"/>
      <Column ss:Width="200"/>
      <Column ss:Width="140"/>
      <Column ss:Width="380"/>
      <Column ss:Width="160"/>
      ${sheet5Rows.join('\n      ')}
    </Table>
  </Worksheet>
</Workbook>`

  // ══════════════════════════════════════════════════════════════════
  // DOSYA İNDİRME (.xls olarak doğrudan Excel'e bağlama)
  // ══════════════════════════════════════════════════════════════════
  const blob = new Blob([xmlWorkbook], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)

  const sanitizedTitle = lesson.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_')
  const fileName = `GaziOyun_Rapor_${sanitizedTitle}_${session.code}_${new Date().toISOString().slice(0, 10)}.xls`

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
