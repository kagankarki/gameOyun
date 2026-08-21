/**
 * Gazi Üniversitesi — Amfi 2.0 Ders Düzenleyici / Hazırlık
 * Yol: /hoca/ders/:id
 *
 * Metin BÖLÜMLERE AYRILMAZ — kesintisiz, aralıksız okunur.
 * Hoca ders notunu / paragraflarını buraya yazar veya yapıştırır.
 * Yanlış cümleleri/ifadeleri seçip işaretler.
 *
 * Her yanlış için:
 * - Neden yanlış olduğu ve doğrusu belirtilir.
 * - Zorluk derecesi (Kolay / Orta / Zor) seçilir.
 * - Yakalayan öğrenciye anında açılacak 5 ŞIKLI (A, B, C, D, E) soru
 *   hazırlanır (Yapay Zekâ ile otomatik üretilebilir veya elle yazılabilir).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import { generateFollowUp, isGeminiConfigured, type Zorluk } from '@/lib/gemini'
import { EASE } from '@/lib/motion'
import type { FollowUpQuestion, Lesson, WrongBlock } from '@/lib/types'
import { cx } from '@/lib/utils'

/** Yeni bir soru eklenirken 5 şıklı başlangıç hâli */
const BOS_SORU_5: FollowUpQuestion = {
  question: '',
  options: ['', '', '', '', ''],
  correctIndex: 0,
  bonus: 50,
  difficulty: 'orta',
}

export default function LessonEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const areaRef = useRef<HTMLTextAreaElement>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [script, setScript] = useState('')
  const [wrongs, setWrongs] = useState<WrongBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)

  /* Form & Seçim State */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [correction, setCorrection] = useState('')
  const [soru, setSoru] = useState<FollowUpQuestion>(BOS_SORU_5)
  const [soruAcik, setSoruAcik] = useState(true)
  const [zorluk, setZorluk] = useState<Zorluk>('orta')
  const [uretiliyor, setUretiliyor] = useState(false)

  /* ── Dersi Getir ── */
  useEffect(() => {
    if (!id) return
    let alive = true
    api.getLesson(id).then((l) => {
      if (!alive) return
      if (l) {
        setLesson(l)
        // Eğer script varsa onu, yoksa eski blokları birleştirip kullan
        if (l.script) {
          setScript(l.script)
        } else if (l.blocks?.length) {
          setScript(l.blocks.map((b) => b.text).join('\n\n'))
        }
        if (l.wrongBlocks?.length) {
          setWrongs(l.wrongBlocks)
        } else if (l.blocks?.length) {
          // Eski bloklardaki isWrong olanları başlangıç olarak dönüştür
          const initialWrongs: WrongBlock[] = []
          let offset = 0
          l.blocks.forEach((b, idx) => {
            const start = offset
            const end = offset + b.text.length
            if (b.isWrong) {
              initialWrongs.push({
                blockIndex: idx,
                text: b.text,
                explanation: b.correction || 'Bu bilgi yanlıştır.',
                correction: b.correction || '',
                points: b.points || 100,
                start,
                end,
                difficulty: 'orta',
              })
            }
            offset = end + 2 // '\n\n' mesafesi
          })
          if (initialWrongs.length) setWrongs(initialWrongs)
        }
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id])

  const selectedText = selection ? script.slice(selection.start, selection.end).trim() : ''

  /** Seçim mevcut bir işaretle çakışıyor mu? */
  const cakisan = useMemo(() => {
    if (!selection) return null
    return wrongs.find((w) => selection.start < w.end && selection.end > w.start) ?? null
  }, [selection, wrongs])

  /** Textarea içindeki seçimi oku */
  const readSelection = () => {
    const el = areaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    if (start === null || end === null || start === end) return
    setSelection({ start, end })
  }

  const formuTemizle = () => {
    setSelection(null)
    setExplanation('')
    setCorrection('')
    setSoru(BOS_SORU_5)
    setSoruAcik(true)
    setZorluk('orta')
  }

  /* ── 5 Şıklı Soru Üret (Gemini) ── */
  const uret = async () => {
    if (!selectedText || !explanation.trim()) {
      toast('Önce seçili yerin neden yanlış olduğunu açıkla — soru ona göre üretilir.', 'error')
      return
    }
    setUretiliyor(true)
    try {
      const r = await generateFollowUp({
        wrongText: selectedText,
        explanation: explanation.trim(),
        correction: correction.trim(),
        zorluk,
        lessonTitle: lesson?.title,
      })
      if (r.error || !r.question) {
        toast(r.error ?? 'Soru üretilemedi.', 'error')
        return
      }

      // 5 şık garantile
      const opts = [...r.question.options]
      while (opts.length < 5) opts.push('')

      setSoru({
        ...r.question,
        options: opts.slice(0, 5),
        difficulty: zorluk,
      })
      setSoruAcik(true)
      const modelName = r.modelUsed ? ` (${r.modelUsed})` : ''
      const correctLetter = String.fromCharCode(65 + (r.question.correctIndex ?? 0))
      toast(`5 şıklı soru üretildi${modelName} — Doğru cevap: ${correctLetter} şıkkı olarak işaretlendi.`, 'success')
    } finally {
      setUretiliyor(false)
    }
  }

  /* ── Hata Olarak Listeye Ekle ── */
  const ekle = () => {
    if (!selection || !selectedText) {
      toast('Lütfen metinden yanlış ifadeyi seç.', 'error')
      return
    }
    if (!explanation.trim()) {
      toast('Lütfen bu cümlenin neden yanlış olduğunu belirt.', 'error')
      return
    }
    if (cakisan) {
      toast('Bu aralık zaten işaretli. Önce mevcut işareti kaldır.', 'error')
      return
    }

    // 5 şıklı soru geçerli mi?
    const filledOptions = soru.options.map((o) => o.trim())
    const validCount = filledOptions.filter(Boolean).length
    const followUp: FollowUpQuestion | undefined =
      soruAcik && soru.question.trim() && validCount >= 2
        ? {
            question: soru.question.trim(),
            options: filledOptions,
            correctIndex: Math.min(soru.correctIndex, filledOptions.length - 1),
            bonus: soru.bonus || 50,
            difficulty: zorluk,
          }
        : undefined

    const w: WrongBlock = {
      blockIndex: wrongs.length,
      text: selectedText,
      explanation: explanation.trim(),
      correction: correction.trim(),
      points: 100,
      start: selection.start,
      end: selection.end,
      difficulty: zorluk,
      ...(followUp ? { followUp } : {}),
    }

    setWrongs((list) =>
      [...list, w].sort((a, b) => a.start - b.start).map((x, i) => ({ ...x, blockIndex: i })),
    )
    toast('Hata ve 5 şıklı soru eklendi.', 'success')
    formuTemizle()
  }

  const sil = (start: number) => {
    setWrongs((list) =>
      list.filter((w) => w.start !== start).map((x, i) => ({ ...x, blockIndex: i })),
    )
  }

  /** Metin değiştiğinde indeksleri koru veya eşleşmeyenleri temizle */
  useEffect(() => {
    setWrongs((list) => {
      const kalan = list.filter(
        (w) => w.end <= script.length && script.slice(w.start, w.end) === w.text,
      )
      return kalan.length === list.length ? list : kalan.map((x, i) => ({ ...x, blockIndex: i }))
    })
  }, [script])

  /* ── Dersi Kaydet ── */
  const kaydet = async (silent?: boolean) => {
    if (!lesson) return
    if (!lesson.title.trim()) {
      toast('Ders başlığı boş olamaz.', 'error')
      return
    }

    setSaving(true)
    try {
      const updated: Lesson = {
        ...lesson,
        teacherId: user?.uid || lesson.teacherId,
        teacherName: user?.name || lesson.teacherName,
        script: script.trim(),
        wrongBlocks: wrongs,
        // Geriye dönük uyumluluk: paragraflardan bloklar oluştur
        blocks: script
          .split(/\n\n+/)
          .filter(Boolean)
          .map((p, idx) => ({
            id: `b_${idx}`,
            text: p.trim(),
            isWrong: wrongs.some((w) => p.includes(w.text)),
            correction: wrongs.find((w) => p.includes(w.text))?.correction || '',
            points: 100,
          })),
        updatedAt: Date.now(),
      }

      await api.saveLesson(updated)
      setLesson(updated)
      if (!silent) toast('Ders başarıyla kaydedildi.', 'success')
      return updated
    } catch (e) {
      toast('Kaydedilirken hata oluştu: ' + (e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ── Amfi 2.0 Başlat (Canlı Oturum) ── */
  const amfiBaslat = async () => {
    if (!lesson || !user) return
    if (!script.trim()) {
      toast('Önce ders metnini girmelisin.', 'error')
      return
    }
    if (!wrongs.length) {
      toast('En az 1 yanlış cümle işaretlemelisin.', 'error')
      return
    }

    setStarting(true)
    try {
      const saved = await kaydet(true)
      if (!saved) return

      const session = await ses.createSession(saved, user.uid, user.name, {
        version: 2,
        readingMode: 'continuous',
        script: saved.script || script,
        wrongBlocks: wrongs,
      })
      nav(`/hoca/amfi-host-v2/${saved.id}?sessionId=${session.id}`)
    } catch (err) {
      toast((err as Error).message || 'Amfi oturumu açılamadı.', 'error')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <Loader label="Ders yükleniyor…" />
  if (!lesson) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div className="file-card max-w-md p-10">
          <p className="label">DOSYA BULUNAMADI</p>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">Ders bulunamadı</h2>
          <div className="mt-7">
            <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )
  }

  const okumaDk = Math.max(1, Math.round(ses.estimateReadMs(script) / 60000))
  const soruluSayi = wrongs.filter((w) => w.followUp).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => nav('/hoca')}
          className="rounded-sm text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          ← Panele dön
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Button3D size="md" tone="ghost" onClick={() => kaydet()} disabled={saving || starting}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button3D>
          <Button3D
            size="md"
            tone="success"
            onClick={amfiBaslat}
            disabled={saving || starting || !wrongs.length || !script.trim()}
          >
            {starting ? 'Başlatılıyor…' : '🎙️ Canlı Dersi Başlat'}
          </Button3D>
        </div>
      </div>

      {/* ── Ders Künyesi ── */}
      <div className="file-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
          <span className="label">DERS BİLGİLERİ</span>
        </div>

        <div className="p-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="title">
                DERS BAŞLIĞI
              </label>
              <input
                id="title"
                className="field"
                value={lesson.title}
                onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                placeholder="Örn. Mezensefalon Anatomisi"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="subject">
                KONU / ALAN
              </label>
              <input
                id="subject"
                className="field"
                value={lesson.subject}
                onChange={(e) => setLesson({ ...lesson, subject: e.target.value })}
                placeholder="Anatomi"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Kesintisiz Ders Notu Alanı ── */}
      <div className="file-card space-y-3 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <label className="label font-bold" htmlFor="script">
              KESİNTİSİZ DERS NOTU (METİN ARALIKSIZ OKUNUR)
            </label>
            <p className="mt-1 text-xs text-ink-muted">
              Ders sırasında metin tek seferde okunur. Yanlış olan cümleyi veya ifadeyi fareyle seçtiğinde
              aşağıda <strong className="text-ink">5 şıklı soru formu</strong> açılır.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-chip border-paper-edge bg-paper-deep">
              {script.length} KARAKTER
            </span>
            <span className="label-chip border-paper-edge bg-paper-deep">~{okumaDk} DK OKUMA</span>
            <span
              className={cx(
                'label-chip',
                wrongs.length > 0
                  ? 'border-mark bg-mark-soft text-mark font-bold'
                  : 'border-paper-edge bg-paper-deep text-ink-muted',
              )}
            >
              {wrongs.length} TUZAK
            </span>
          </div>
        </div>

        <textarea
          id="script"
          ref={areaRef}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          onSelect={readSelection}
          onMouseUp={readSelection}
          onTouchEnd={readSelection}
          onKeyUp={readSelection}
          className="field min-h-[260px] resize-y font-serif text-base leading-relaxed"
          placeholder="Ders notunu veya paragraflarını buraya yapıştır…&#10;&#10;Örn: Arkadaşlar bugün size mezensefalon hakkında bilgiler vereceğim. Mezensefalon 3 ana alt başlıkta incelenir…"
        />
      </div>

      {/* ── Yanlış İşaretleme & 5 Şıklı Soru Formu ── */}
      <AnimatePresence>
        {selection && selectedText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="file-card space-y-5 border-l-4 border-l-mark p-6 shadow-lift"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="label font-bold text-mark">SEÇİLEN YANLIŞ İFADE</span>
              <span className="font-mono text-xs text-ink-muted">
                {selection.start} – {selection.end} karakter
              </span>
            </div>

            <p className="rounded-sm border border-mark-edge bg-mark-soft p-3 font-serif text-base font-medium text-mark">
              “{selectedText}”
            </p>

            {cakisan && (
              <p className="rounded-sm border-l-2 border-flag bg-flag-soft px-4 py-3 text-sm text-ink">
                Bu aralık zaten işaretli (“{cakisan.text}”). Lütfen önce mevcut işareti kaldır.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="why">
                  BU İFADE NEDEN YANLIŞ? <span className="text-mark">*</span>
                </label>
                <textarea
                  id="why"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="field min-h-[80px] resize-none text-sm leading-relaxed"
                  placeholder="Örn: Mezensefalon arka beyinde değil, orta beyinde yer alır."
                />
              </div>

              <div>
                <label className="field-label" htmlFor="fix">
                  DOĞRUSU NEDİR? (ÖĞRENCİYE GÖSTERİLİR)
                </label>
                <textarea
                  id="fix"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  className="field min-h-[80px] resize-none text-sm leading-relaxed"
                  placeholder="Örn: Doğrusu: Mezensefalon, beyin sapının orta kısmını oluşturan orta beyindir."
                />
              </div>
            </div>

            {/* ── 5 Şıklı Ek Soru Bölümü ── */}
            <div className="rounded-sm border border-paper-edge bg-paper-deep p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label font-bold text-ink">
                    YANLIŞI BULAN ÖĞRENCİYE ANINDA AÇILACAK 5 ŞIKLI SORU
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    6 saniyede zili çalan öğrencilerin ekranında anında bu 5 şıklı soru açılır. Doğru
                    bilirse <strong className="text-verify">+{soru.bonus} ek puan</strong> kazanır!
                  </p>
                </div>

                {/* Zorluk & AI Üretim */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-sm border border-paper-edge bg-paper-card p-1">
                    <span className="px-1.5 font-mono text-[10px] font-bold text-ink-muted">
                      ZORLUK:
                    </span>
                    {(['kolay', 'orta', 'zor'] as const).map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZorluk(z)}
                        className={cx(
                          'rounded-xs px-2 py-1 font-mono text-[11px] font-bold uppercase transition-colors',
                          zorluk === z
                            ? 'bg-ink text-paper'
                            : 'text-ink-muted hover:bg-paper-deep hover:text-ink',
                        )}
                      >
                        {z}
                      </button>
                    ))}
                  </div>

                  <Button3D
                    type="button"
                    size="sm"
                    tone="gold"
                    onClick={uret}
                    disabled={uretiliyor || !isGeminiConfigured}
                  >
                    {uretiliyor ? 'Üretiliyor…' : '✨ 5 Şıklı Soru Üret'}
                  </Button3D>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="field-label" htmlFor="q">
                    SORU METNİ
                  </label>
                  <textarea
                    id="q"
                    value={soru.question}
                    onChange={(e) => setSoru({ ...soru, question: e.target.value })}
                    className="field min-h-[60px] resize-none"
                    placeholder="Örn: Okunan ifadedeki yanlış bilgiye göre mezensefalonun doğru konumu aşağıdakilerden hangisidir?"
                  />
                </div>

                <div className="space-y-2">
                  <p className="field-label mb-1">
                    5 SEÇENEK (A, B, C, D, E) — <span className="text-verify">Doğru olan şıkkın harfine tıkla</span>
                  </p>
                  {['A', 'B', 'C', 'D', 'E'].map((letter, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSoru({ ...soru, correctIndex: i })}
                        className={cx(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                          soru.correctIndex === i
                            ? 'border-verify bg-verify text-white shadow-md ring-2 ring-verify/30'
                            : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                        )}
                        title={`${letter} şıkkını doğru cevap yap`}
                      >
                        {letter}
                      </button>
                      <input
                        value={soru.options[i] ?? ''}
                        onChange={(e) => {
                          const next = [...soru.options]
                          while (next.length < 5) next.push('')
                          next[i] = e.target.value
                          setSoru({ ...soru, options: next })
                        }}
                        className={cx(
                          'field py-1.5 transition-colors',
                          soru.correctIndex === i && 'border-verify bg-verify-soft/25 font-medium text-ink ring-1 ring-verify',
                        )}
                        placeholder={`${letter} şıkkı`}
                      />
                      {soru.correctIndex === i && (
                        <span className="shrink-0 font-mono text-[11px] font-bold text-verify animate-pulse">
                          ✓ DOĞRU ŞIK
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button3D
                type="button"
                onClick={ekle}
                size="md"
                tone="danger"
                disabled={!explanation.trim() || !!cakisan}
              >
                Tuzak Olarak İşaretle (+5 Şıklı Soru)
              </Button3D>
              <Button3D type="button" onClick={formuTemizle} size="md" tone="ghost">
                Vazgeç
              </Button3D>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── İşaretlenen Tuzaklar / Sorular Listesi ── */}
      <div className="file-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-paper-edge pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">
              İşaretlenen Hatalar ({wrongs.length})
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              Öğrenciler ders okunurken bu tuzakları duyduklarında 6 saniye içinde zili çalacaktır.
            </p>
          </div>
          <span className="label font-bold text-verify">{soruluSayi} TANESİNDE 5 ŞIKLI SORU HAZIR</span>
        </div>

        {wrongs.length === 0 ? (
          <div className="py-12 text-center">
            <p className="label">HENÜZ TUZAK İŞARETLENMEDİ</p>
            <p className="mt-2 text-sm text-ink-muted">
              Yukarıdaki metinden yanlış olan bir cümleyi fareyle seçerek ilk hatayı işaretleyebilirsin.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {wrongs.map((w, i) => (
              <div
                key={w.start}
                className="rounded-sm border-l-4 border-l-mark bg-mark-soft p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-mark font-mono text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="font-serif text-base font-semibold text-mark">“{w.text}”</p>
                      <p className="text-xs leading-relaxed text-ink">
                        <strong>Neden Yanlış:</strong> {w.explanation}
                      </p>
                      {w.correction && (
                        <p className="text-xs leading-relaxed text-verify">
                          <strong>Doğrusu:</strong> {w.correction}
                        </p>
                      )}
                      {w.followUp && (
                        <div className="mt-2 rounded-xs border border-verify-edge bg-verify-soft p-2.5">
                          <p className="font-mono text-xs font-bold text-verify">
                            5 ŞIKLI SORU ({w.followUp.difficulty ?? 'orta'}): {w.followUp.question}
                          </p>
                          <div className="mt-1.5 grid gap-1 font-mono text-[11px] text-ink sm:grid-cols-2">
                            {w.followUp.options.map((opt, optIdx) => (
                              <span
                                key={optIdx}
                                className={cx(
                                  'truncate',
                                  optIdx === w.followUp?.correctIndex
                                    ? 'font-bold text-verify'
                                    : 'text-ink-muted',
                                )}
                              >
                                {String.fromCharCode(65 + optIdx)}) {opt}
                                {optIdx === w.followUp?.correctIndex ? ' ✓' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => sil(w.start)}
                    className="shrink-0 rounded-sm px-2 py-1 font-mono text-xs font-bold text-mark hover:bg-mark-soft"
                    title="İşareti sil"
                  >
                    ✕ SİL
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Alt Başlat Çubuğu ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-paper-edge bg-paper-card p-5">
        <div>
          <p className="font-display text-base font-bold text-ink">
            Ders Hazır: {wrongs.length} Tuzak · {soruluSayi} 5 Şıklı Soru
          </p>
          <p className="text-xs text-ink-muted">
            Öğrencilerin cevaplama penceresi: 6 saniye · En hızlı cevap veren en yüksek puanı alır.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button3D size="lg" tone="ghost" onClick={() => kaydet()} disabled={saving || starting}>
            {saving ? 'Kaydediliyor…' : 'Taslağı Kaydet'}
          </Button3D>
          <Button3D
            size="lg"
            tone="success"
            onClick={amfiBaslat}
            disabled={saving || starting || !wrongs.length || !script.trim()}
          >
            {starting ? 'Oturum Açılıyor…' : '🎙️ Canlı Dersi Başlat'}
          </Button3D>
        </div>
      </div>
    </motion.div>
  )
}
