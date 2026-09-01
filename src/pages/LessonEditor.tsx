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

import AudioUploader from '@/components/AudioUploader'
import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import QuizUploader from '@/components/QuizUploader'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import { generateFollowUp, isGeminiConfigured, type Zorluk } from '@/lib/gemini'
import { kunye, type DersSesi } from '@/lib/audioStore'
import { ara, cumleAraligi, reanchorWrongs, trimRange, type Eslesme } from '@/lib/marking'
import { EASE } from '@/lib/motion'
import type { FollowUpQuestion, Lesson, QuizQuestion, WrongBlock } from '@/lib/types'
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
  const [pretest, setPretest] = useState<QuizQuestion[]>([])
  const [posttest, setPosttest] = useState<QuizQuestion[]>([])
  const [activeTab, setActiveTab] = useState<'content' | 'pretest' | 'posttest'>('content')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)

  /* Form & Seçim State */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  /* Metinde arama + yeri kaybolan işaretler */
  const [arama, setArama] = useState('')
  const [dusenler, setDusenler] = useState<string[]>([])
  /** Hocanın yüklediği ders kaydı — dosya bu cihazda (AudioUploader) */
  const [sesKaydi, setSesKaydi] = useState<DersSesi | null>(null)
  const [explanation, setExplanation] = useState('')
  const [correction, setCorrection] = useState('')
  const [soru, setSoru] = useState<FollowUpQuestion>(BOS_SORU_5)
  const [soruAcik, setSoruAcik] = useState(false)
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
        if (l.script) {
          setScript(l.script)
        } else if (l.blocks?.length) {
          setScript(l.blocks.map((b) => b.text).join('\n\n'))
        }
        if (l.wrongBlocks?.length) {
          setWrongs(l.wrongBlocks)
        } else if (l.blocks?.length) {
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
            offset = end + 2
          })
          if (initialWrongs.length) setWrongs(initialWrongs)
        }
        if (l.pretest?.length) setPretest(l.pretest)
        if (l.posttest?.length) setPosttest(l.posttest)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id])

  const selectedText = selection ? script.slice(selection.start, selection.end).trim() : ''

  const eslesmeler = useMemo<Eslesme[]>(() => ara(script, arama, wrongs), [script, arama, wrongs])

  /**
   * Arama sonucundan doğrudan tuzağa: eşleşmenin geçtiği CÜMLEYİ seçer.
   * Tuzak tek bir kelime değil, öğrencinin duyup yakalayacağı bir ifadedir;
   * hocayı metinde fareyle cümle avlamaya zorlamıyoruz.
   */
  const eslesmeyiIsaretle = (m: Eslesme) => {
    const c = cumleAraligi(script, m.start, m.end)
    setSelection(c)
    const el = areaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(c.start, c.end)
    }
    // Form listenin altında açılıyor — hoca aramayı bırakıp oraya baksın
    setTimeout(
      () => document.getElementById('isaretleme-formu')?.scrollIntoView({ block: 'center' }),
      80,
    )
  }

  const eslesmeyeGit = (m: Eslesme) => {
    setSelection({ start: m.start, end: m.end })
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(m.start, m.end)
    const oran = script.length ? m.start / script.length : 0
    el.scrollTop = Math.max(0, oran * el.scrollHeight - el.clientHeight / 2)
  }

  /**
   * Buton neden basılamıyor? Ölü bir düğme bırakmıyoruz: sebebi
   * ekranda yazıyor. "Bir tuzak ekledim, ikincisini ekleyemiyorum"
   * şikâyetinin kaynağı buydu — çakışma sessizce butonu kapatıyordu.
   */

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
    // Seçimin baştaki/sondaki boşluğunu kırp — kaydedilen metinle
    // birebir örtüşmezse işaret ilk düzenlemede kayboluyordu.
    const kirpik = trimRange(script, start, end)
    if (kirpik.start === kirpik.end) return
    setSelection(kirpik)
  }

  const formuTemizle = () => {
    setSelection(null)
    setExplanation('')
    setCorrection('')
    setSoru(BOS_SORU_5)
    // Varsayılan KAPALI: soru isteğe bağlı, zorunlu gibi görünmesin
    setSoruAcik(false)
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
    toast(
      `${wrongs.length + 1}. tuzak eklendi${followUp ? ' (5 şıklı soruyla)' : ''}. ` +
        'Metinden başka bir cümle seçerek istediğin kadar tuzak ekleyebilirsin.',
      'success',
    )
    formuTemizle()
  }

  const sil = (start: number) => {
    setWrongs((list) =>
      list.filter((w) => w.start !== start).map((x, i) => ({ ...x, blockIndex: i })),
    )
  }

  /**
   * Metin değiştiğinde işaretleri yeni konumlarına taşır.
   * Eskiden kayan işaretler sessizce siliniyordu — birkaç hata işaretleyip
   * metne dokunan hoca hepsini birden kaybediyordu.
   */
  useEffect(() => {
    setWrongs((list) => {
      if (!list.length) return list
      const { wrongs: yeni, dusen } = reanchorWrongs(script, list)
      if (dusen.length) setDusenler(dusen)
      const degisti =
        yeni.length !== list.length ||
        yeni.some((w, i) => w.start !== list[i]?.start || w.end !== list[i]?.end)
      return degisti ? yeni : list
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
        pretest,
        posttest,
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
      if (!silent) toast('Ders ve test soruları başarıyla kaydedildi.', 'success')
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
        pretest: pretest,
        posttest: posttest,
        audio: sesKaydi ? kunye(sesKaydi) : null,
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
            {saving ? 'Kaydediliyor…' : '💾 Tümünü Kaydet'}
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

      {/* ── 3 Aşamalı Akış Sekmeleri ── */}
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-paper-deep rounded-sm border border-paper-edge">
        <button
          type="button"
          onClick={() => setActiveTab('pretest')}
          className={cx(
            'flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-sm font-bold text-xs sm:text-sm transition-all',
            activeTab === 'pretest'
              ? 'bg-paper-card text-ink shadow-paper border border-paper-edge'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          <span>1. Ön Test (PreTest)</span>
          <span
            className={cx(
              'px-2 py-0.5 rounded-full text-[11px] font-mono',
              pretest.length > 0 ? 'bg-flag text-white' : 'bg-paper-edge text-ink-muted',
            )}
          >
            {pretest.length} Soru
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className={cx(
            'flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-sm font-bold text-xs sm:text-sm transition-all',
            activeTab === 'content'
              ? 'bg-paper-card text-ink shadow-paper border border-paper-edge'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          <span>2. Hatayı Yakala (Canlı Ders)</span>
          <span
            className={cx(
              'px-2 py-0.5 rounded-full text-[11px] font-mono',
              wrongs.length > 0 ? 'bg-mark text-white' : 'bg-paper-edge text-ink-muted',
            )}
          >
            {wrongs.length} Tuzak
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('posttest')}
          className={cx(
            'flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-sm font-bold text-xs sm:text-sm transition-all',
            activeTab === 'posttest'
              ? 'bg-paper-card text-ink shadow-paper border border-paper-edge'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          <span>3. Son Test (PostTest)</span>
          <span
            className={cx(
              'px-2 py-0.5 rounded-full text-[11px] font-mono',
              posttest.length > 0 ? 'bg-verify text-white' : 'bg-paper-edge text-ink-muted',
            )}
          >
            {posttest.length} Soru
          </span>
        </button>
      </div>

      {/* ── 1. AŞAMA: ÖN TEST ALANI ── */}
      {activeTab === 'pretest' && (
        <QuizUploader
          baslik="Ön Test Soruları (Pre-Test)"
          aciklama="Ders anlatımı başlamadan önce öğrencilere yöneltilecek ölçme soruları. Word (.docx) veya metin dosyası yükleyebilir ya da Yapay Zekâ ile üretebilirsiniz."
          tone="pre"
          questions={pretest}
          onChange={setPretest}
          lessonTitle={lesson.title}
        />
      )}

      {/* ── 3. AŞAMA: SON TEST ALANI ── */}
      {activeTab === 'posttest' && (
        <QuizUploader
          baslik="Son Test Soruları (Post-Test)"
          aciklama="Ders anlatımı ve tuzak yakalama tamamlandıktan sonra öğrenme kazanımını ve gelişimini ölçmek için yöneltilecek sorular."
          tone="post"
          questions={posttest}
          onChange={setPosttest}
          lessonTitle={lesson.title}
        />
      )}

      {/* ── 2. AŞAMA: DERS METNİ & HATAYI YAKALAMA ALANI ── */}
      {activeTab === 'content' && (
        <>

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

        {/* ── Metinde ara ── */}
        <div className="mt-4 rounded-sm border border-paper-edge bg-paper-deep p-4">
          <label className="field-label" htmlFor="ara-editor">
            METİNDE ARA
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="ara-editor"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="field min-w-[220px] flex-1 text-sm"
              placeholder="Aradığın ifadeyi yaz — sonuca tıkla, o yer seçilsin"
              autoComplete="off"
            />
            {arama.trim().length >= 2 && (
              <span className="label whitespace-nowrap">{eslesmeler.length} EŞLEŞME</span>
            )}
            {arama && (
              <button
                type="button"
                onClick={() => setArama('')}
                className="text-xs font-semibold text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Temizle
              </button>
            )}
          </div>

          {arama.trim().length >= 2 && (
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {eslesmeler.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">Bu metinde geçmiyor.</p>
              ) : (
                eslesmeler.map((m) => (
                  <div
                    key={m.start}
                    className={cx(
                      'flex items-start gap-3 rounded-sm border-l-4 bg-paper-card px-3 py-2',
                      m.isaretli ? 'border-l-mark' : 'border-l-paper-edge',
                    )}
                  >
                    <span className="mt-1 font-mono text-[10px] font-bold text-ink-faint">
                      {m.start}
                    </span>
                    <button
                      type="button"
                      onClick={() => eslesmeyeGit(m)}
                      className="min-w-0 flex-1 text-left font-serif text-sm leading-snug text-ink hover:underline"
                      title="Bu yeri metinde seç"
                    >
                      {m.onizleme.slice(0, m.vurguStart)}
                      <mark className="bg-flag-soft font-semibold text-ink">
                        {m.onizleme.slice(m.vurguStart, m.vurguEnd)}
                      </mark>
                      {m.onizleme.slice(m.vurguEnd)}
                    </button>
                    {/* Aramadan doğrudan tuzak: metinde fareyle cümle avlamaya gerek yok */}
                    {m.isaretli ? (
                      <span className="label-chip mt-0.5 shrink-0 border-mark bg-mark-soft text-mark">
                        İŞARETLİ
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => eslesmeyiIsaretle(m)}
                        className="mt-0.5 shrink-0 rounded-sm border border-mark px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-mark transition-colors hover:bg-mark hover:text-paper"
                      >
                        TUZAK YAP
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {dusenler.length > 0 && (
          <div className="mt-4 rounded-sm border-l-2 border-flag bg-flag-soft p-4 text-[12px] leading-relaxed text-ink">
            <div className="flex items-start justify-between gap-3">
              <p>
                <strong className="font-semibold">{dusenler.length} işaret düştü:</strong> metni
                değiştirdiğin için {dusenler.map((d) => `“${d}”`).join(', ')} artık bulunamıyor.
              </p>
              <button
                type="button"
                onClick={() => setDusenler([])}
                className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:text-ink"
              >
                KAPAT
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ders sesi — TTS yerine hocanın kendi kaydıyla anlatmak için */}
      <AudioUploader lessonId={lesson?.id} onChange={setSesKaydi} />

      {/* ── Yanlış İşaretleme & 5 Şıklı Soru Formu ── */}
      <AnimatePresence>
        {selection && selectedText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: EASE }}
            id="isaretleme-formu"
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
                    5 ŞIKLI EK SORU{' '}
                    <span className="text-ink-muted">· İSTEĞE BAĞLI</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    6 saniyede zili çalan öğrencinin ekranında açılır; doğru bilirse{' '}
                    <strong className="text-verify">+{soru.bonus} ek puan</strong>.{' '}
                    <strong className="text-ink">Boş bırakabilirsin</strong> — tuzak soru olmadan da
                    eklenir.
                  </p>
                </div>

                {/* Zorluk & AI Üretim */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button3D
                    type="button"
                    size="sm"
                    tone="ghost"
                    onClick={() => setSoruAcik((v) => !v)}
                  >
                    {soruAcik ? 'Soruyu Atla' : 'Soru Ekle'}
                  </Button3D>
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

              {!soruAcik && (
                <p className="mt-3 text-xs text-ink-muted">
                  Bu tuzakta ek soru sorulmayacak. Öğrenci hatayı yakaladığında puanını
                  alır, soru ekranı açılmaz.
                </p>
              )}

              {soruAcik && (
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
              )}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button3D
                  type="button"
                  onClick={ekle}
                  size="md"
                  tone="danger"
                  disabled={!explanation.trim() || !!cakisan}
                >
                  {soru.question.trim()
                    ? 'Tuzak Olarak İşaretle (soruyla)'
                    : 'Tuzak Olarak İşaretle'}
                </Button3D>
                <Button3D type="button" onClick={formuTemizle} size="md" tone="ghost">
                  Vazgeç
                </Button3D>
                {cakisan && (
                  <Button3D
                    type="button"
                    size="md"
                    tone="ghost"
                    onClick={() => sil(cakisan.start)}
                  >
                    Çakışan Tuzağı Sil
                  </Button3D>
                )}
              </div>

              {/* Düğme neden kapalı? Sessiz kalmıyoruz. */}
              {(!explanation.trim() || cakisan) && (
                <p className="text-xs leading-relaxed text-mark">
                  {cakisan
                    ? 'Seçtiğin yer mevcut bir tuzakla çakışıyor. Ya çakışmayan bir aralık seç ya da yukarıdaki düğmeyle eski tuzağı sil.'
                    : '“Bu ifade neden yanlış?” alanını doldurunca tuzak eklenebilir. 5 şıklı soru zorunlu değil.'}
                </p>
              )}
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
        </>
      )}
    </motion.div>
  )
}
