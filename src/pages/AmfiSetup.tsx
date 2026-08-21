/**
 * Amfi — HOCA HAZIRLIK EKRANI
 * Yol: /hoca/amfi-setup/:lessonId
 *
 * Metin PARÇALARA BÖLÜNMEZ. Hoca notu yapıştırır, yanlış yerleri fareyle
 * seçer; ders sırasında metnin tamamı tek seferde okunur. Öğrenci hangi
 * hataya bastığı, okuma sırasında tutulan karakter/zaman çizelgesinden
 * hesaplanır (bkz. AmfiHostV2).
 *
 * Her hataya, yakalayan öğrenciye sorulacak bir çoktan seçmeli soru
 * eklenebilir. Sorular BURADA hazırlanır — ders sırasında yapay zekâya
 * gidilmez.
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

/** Yeni bir hata işaretlenirken formun başlangıç hâli (5 şıklı) */
const BOS_SORU: FollowUpQuestion = {
  question: '',
  options: ['', '', '', '', ''],
  correctIndex: 0,
  bonus: 50,
  difficulty: 'orta',
}

export default function AmfiSetup() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const areaRef = useRef<HTMLTextAreaElement>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [script, setScript] = useState('')
  const [wrongs, setWrongs] = useState<WrongBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  /* Seçim + form */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [correction, setCorrection] = useState('')
  const [soru, setSoru] = useState<FollowUpQuestion>(BOS_SORU)
  const [soruAcik, setSoruAcik] = useState(false)
  const [zorluk, setZorluk] = useState<Zorluk>('orta')
  const [uretiliyor, setUretiliyor] = useState(false)

  /* ── Dersi getir, notu ön-doldur ── */
  useEffect(() => {
    if (!lessonId) return
    let alive = true
    api.getLesson(lessonId).then((l) => {
      if (!alive) return
      setLesson(l)
      if (l?.script) {
        setScript(l.script)
      } else if (l?.blocks?.length) {
        setScript(l.blocks.map((b) => b.text).join('\n\n'))
      }
      if (l?.wrongBlocks?.length) {
        setWrongs(l.wrongBlocks)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [lessonId])

  const selectedText = selection ? script.slice(selection.start, selection.end).trim() : ''

  /** Seçim mevcut bir işaretle çakışıyor mu? */
  const cakisan = useMemo(() => {
    if (!selection) return null
    return wrongs.find((w) => selection.start < w.end && selection.end > w.start) ?? null
  }, [selection, wrongs])

  /**
   * Seçimi textarea'nın kendi imleç konumundan okuyoruz — window.getSelection()
   * bir textarea'nın İÇİNDEKİ metni görmez. React'in onSelect'i pencere odakta
   * değilken tetiklenmediği için fare/klavye olaylarına da bağlıyoruz.
   */
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
    setSoru(BOS_SORU)
    setSoruAcik(false)
  }

  const uret = async () => {
    if (!selectedText || !explanation.trim()) {
      toast('Önce hatanın ne olduğunu yaz — soruyu ona göre üretiyor.', 'error')
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
      const opts = [...r.question.options]
      while (opts.length < 5) opts.push('')

      setSoru({
        ...r.question,
        options: opts.slice(0, 5),
        difficulty: zorluk,
      })
      setSoruAcik(true)
      const modelName = r.modelUsed ? ` (${r.modelUsed})` : ''
      toast(`5 şıklı soru üretildi${modelName} — kontrol edip düzeltebilirsin.`, 'success')
    } finally {
      setUretiliyor(false)
    }
  }

  const ekle = () => {
    if (!selection || !explanation.trim()) return
    if (cakisan) {
      toast('Bu yer zaten işaretli. Önce onu sil.', 'error')
      return
    }

    // Soru yalnızca metni ve en az iki dolu şıkkı varsa kaydedilir
    const sikDolu = soru.options.filter((o) => o.trim()).length
    const followUp =
      soruAcik && soru.question.trim() && sikDolu >= 2
        ? {
            question: soru.question.trim(),
            options: soru.options.map((o) => o.trim()).filter(Boolean),
            correctIndex: Math.min(soru.correctIndex, sikDolu - 1),
            bonus: soru.bonus,
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
      ...(followUp ? { followUp } : {}),
    }

    setWrongs((list) =>
      [...list, w].sort((a, b) => a.start - b.start).map((x, i) => ({ ...x, blockIndex: i })),
    )
    formuTemizle()
  }

  const sil = (start: number) =>
    setWrongs((list) =>
      list.filter((w) => w.start !== start).map((x, i) => ({ ...x, blockIndex: i })),
    )

  /**
   * Metin değişince karakter aralıkları kayar. Metnin kısaldığı ya da
   * işaretin altındaki yazının değiştiği durumda o işaret artık yanlış yeri
   * gösterir — sessizce yanlış puanlamaktansa düşürüyoruz.
   */
  useEffect(() => {
    setWrongs((list) => {
      const kalan = list.filter((w) => w.end <= script.length && script.slice(w.start, w.end) === w.text)
      return kalan.length === list.length ? list : kalan.map((x, i) => ({ ...x, blockIndex: i }))
    })
  }, [script])

  const baslat = async () => {
    if (!lesson || !user) return
    if (!script.trim()) {
      toast('Önce ders notunu gir.', 'error')
      return
    }
    if (!wrongs.length) {
      toast('En az bir yanlış işaretlemelisin.', 'error')
      return
    }

    setBusy(true)
    try {
      const session = await ses.createSession(lesson, user.uid, user.name, {
        version: 2,
        readingMode: 'continuous',
        script,
        wrongBlocks: wrongs,
      })
      navigate(`/hoca/amfi-host-v2/${lesson.id}?sessionId=${session.id}`)
    } catch (err) {
      toast((err as Error).message || 'Oturum açılamadı.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader label="Ders yükleniyor…" />

  if (!lesson)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">DERS BULUNAMADI</p>
          <div className="mt-6">
            <Button3D onClick={() => navigate('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )

  const soruluSayi = wrongs.filter((w) => w.followUp).length
  const okumaDk = Math.max(1, Math.round(ses.estimateReadMs(script) / 60000))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto min-h-[calc(100dvh-68px)] max-w-4xl space-y-6 px-5 py-10 sm:px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <p className="label">AMFİ HAZIRLIK</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          {lesson.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Ders notunu yapıştır, yanlış yerleri fareyle seçip işaretle. Ders sırasında metin
          <strong className="text-ink"> tek seferde, kesintisiz </strong>
          okunur; öğrenci hatayı duyduğu an butona basar.
        </p>
      </motion.div>

      {/* Ders notu */}
      <div className="file-card space-y-3 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label className="label font-bold" htmlFor="script">
            DERS NOTU
          </label>
          <span className="label">
            {script.length} KARAKTER · ~{okumaDk} DK OKUMA
          </span>
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
          className="field min-h-[280px] resize-y font-serif leading-relaxed"
          placeholder="Ders metnini buraya yapıştır…"
        />
        <p className="text-xs text-ink-muted">
          Yanlış olan yeri fareyle seç — aşağıda işaretleme formu açılır.
        </p>
      </div>

      {/* İşaretleme formu */}
      <AnimatePresence>
        {selection && selectedText && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="file-card space-y-5 border-l-4 border-l-mark p-6"
          >
            <div>
              <p className="label font-bold">SEÇİLEN</p>
              <p className="mt-1.5 font-serif text-base text-mark">“{selectedText}”</p>
            </div>

            {cakisan && (
              <p className="rounded-sm border-l-2 border-flag bg-flag-soft px-4 py-3 text-sm text-ink">
                Bu yer zaten işaretli (“{cakisan.text}”). Önce mevcut işareti sil.
              </p>
            )}

            <div>
              <label className="field-label" htmlFor="why">
                NEDEN YANLIŞ?
              </label>
              <textarea
                id="why"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="field min-h-[80px] resize-none"
                placeholder="Örn: Omuz kuşağını clavicula ve scapula oluşturur; sternum gövde iskeletine aittir."
              />
            </div>

            <div>
              <label className="field-label" htmlFor="fix">
                DOĞRUSU (isteğe bağlı)
              </label>
              <textarea
                id="fix"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                className="field min-h-[60px] resize-none"
                placeholder="Yakalayan öğrenciye gösterilecek doğru bilgi"
              />
            </div>

            {/* ── Ek soru ── */}
            <div className="rounded-sm border border-paper-edge bg-paper-deep p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label font-bold">YAKALAYANA SORULACAK SORU</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    İsteğe bağlı. Doğru bilirse +{soru.bonus} puan, bilemezse ceza yok.
                  </p>
                </div>
                {!soruAcik && (
                  <Button3D type="button" size="sm" tone="ghost" onClick={() => setSoruAcik(true)}>
                    Soru Ekle
                  </Button3D>
                )}
              </div>

              {soruAcik && (
                <div className="mt-4 space-y-4">
                  {/* AI yardımcısı */}
                  <div className="flex flex-wrap items-center gap-3 rounded-sm bg-paper-card p-3">
                    <span className="label">ZORLUK</span>
                    <div className="flex gap-1.5">
                      {(['kolay', 'orta', 'zor'] as const).map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZorluk(z)}
                          className={cx(
                            'rounded-sm border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
                            zorluk === z
                              ? 'border-ink bg-ink text-paper'
                              : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                          )}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                    <Button3D
                      type="button"
                      size="sm"
                      onClick={uret}
                      disabled={uretiliyor || !isGeminiConfigured}
                      className="ml-auto"
                    >
                      {uretiliyor ? 'Üretiliyor…' : 'Yapay Zekâ ile Üret'}
                    </Button3D>
                  </div>
                  {!isGeminiConfigured && (
                    <p className="text-xs text-ink-muted">
                      Gemini anahtarı tanımlı değil — soruyu elle yazabilirsin.
                    </p>
                  )}

                  <div>
                    <label className="field-label" htmlFor="q">
                      SORU
                    </label>
                    <textarea
                      id="q"
                      value={soru.question}
                      onChange={(e) => setSoru({ ...soru, question: e.target.value })}
                      className="field min-h-[60px] resize-none"
                      placeholder="Örn: Omuz kuşağını oluşturan diğer kemik hangisidir?"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="field-label mb-0">ŞIKLAR — doğru olanı işaretle</p>
                    {soru.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={`${i + 1}. şık doğru`}
                          onClick={() => setSoru({ ...soru, correctIndex: i })}
                          className={cx(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                            soru.correctIndex === i
                              ? 'border-verify bg-verify text-white shadow-md ring-2 ring-verify/30'
                              : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </button>
                        <input
                          value={o}
                          onChange={(e) => {
                            const next = [...soru.options]
                            next[i] = e.target.value
                            setSoru({ ...soru, options: next })
                          }}
                          className={cx(
                            'field',
                            soru.correctIndex === i && 'border-verify bg-verify-soft/25 font-medium text-ink ring-1 ring-verify',
                          )}
                          placeholder={`${i + 1}. şık`}
                        />
                        {soru.correctIndex === i && (
                          <span className="shrink-0 font-mono text-[11px] font-bold text-verify animate-pulse">
                            ✓ DOĞRU ŞIK
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSoru(BOS_SORU)
                      setSoruAcik(false)
                    }}
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:text-mark"
                  >
                    Soruyu kaldır
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button3D
                type="button"
                onClick={ekle}
                size="md"
                tone="danger"
                disabled={!explanation.trim() || !!cakisan}
              >
                Yanlış Olarak İşaretle
              </Button3D>
              <Button3D type="button" onClick={formuTemizle} size="md" tone="ghost">
                Vazgeç
              </Button3D>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* İşaretlenenler */}
      {wrongs.length > 0 && (
        <div className="file-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="label font-bold">{wrongs.length} YANLIŞ İŞARETLENDİ</p>
            <span className="label">{soruluSayi} TANESİNDE SORU VAR</span>
          </div>
          <div className="mt-4 space-y-2">
            {wrongs.map((w, i) => (
              <div key={w.start} className="rounded-sm border-l-4 border-l-mark bg-mark-soft px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] font-bold text-ink-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-sm font-semibold text-mark">“{w.text}”</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{w.explanation}</p>
                    {w.followUp && (
                      <p className="mt-1.5 font-mono text-[11px] text-verify">
                        ✓ SORU: {w.followUp.question.slice(0, 60)}
                        {w.followUp.question.length > 60 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => sil(w.start)}
                    className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mark hover:underline"
                  >
                    SİL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Başlat */}
      <div className="flex flex-wrap gap-3">
        <Button3D
          onClick={baslat}
          size="lg"
          tone="success"
          disabled={busy || !wrongs.length || !script.trim()}
        >
          {busy ? 'Hazırlanıyor…' : 'Oturumu Aç'}
        </Button3D>
        <Button3D onClick={() => navigate('/hoca')} size="lg" tone="ghost" disabled={busy}>
          İptal
        </Button3D>
      </div>
    </motion.div>
  )
}
