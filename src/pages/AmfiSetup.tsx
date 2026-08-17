/**
 * Amfi 2.0 — Hoca notu yükleme ve yanlış işaretleme
 * Yol: /hoca/amfi-setup/:lessonId
 *
 * Hoca ders notunu yapıştırır, metin cümle/paragraf parçalarına bölünür.
 * Yanlış olan parçalar işaretlenir; oturum bu parçalarla açılır ve
 * AmfiHostV2 onları sırayla okur.
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
import { EASE } from '@/lib/motion'
import type { Lesson, LiveSessionMode, WrongBlock } from '@/lib/types'
import { cx, segmentIndexAt, splitSegments } from '@/lib/utils'

export default function AmfiSetup() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const areaRef = useRef<HTMLTextAreaElement>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [text, setText] = useState('')
  const [wrongBlocks, setWrongBlocks] = useState<WrongBlock[]>([])
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [correction, setCorrection] = useState('')
  const [mode, setMode] = useState<LiveSessionMode>('capture')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  /* ── Dersi getir, notu ön-doldur ── */
  useEffect(() => {
    if (!lessonId) return
    let alive = true
    api.getLesson(lessonId).then((l) => {
      if (!alive) return
      setLesson(l)
      // LessonEditor'da girilmiş bloklar varsa buradan devam et
      if (l?.blocks?.length) setText(l.blocks.map((b) => b.text).join('\n\n'))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [lessonId])

  /* ── Metnin sesli okunacak parçaları ── */
  const segments = useMemo(() => splitSegments(text), [text])

  /** Seçilen aralık hangi parçaya düşüyor */
  const targetIndex = useMemo(
    () => (selection && segments.length ? segmentIndexAt(segments, selection.start) : -1),
    [selection, segments],
  )
  const targetSegment = targetIndex >= 0 ? segments[targetIndex] : null
  const selectedText = selection ? text.slice(selection.start, selection.end).trim() : ''
  const alreadyMarked = wrongBlocks.some((w) => w.blockIndex === targetIndex)

  /**
   * Seçimi textarea'nın kendi imleç konumundan okuyoruz.
   * window.getSelection() bir textarea'nın İÇİNDEKİ metni görmez —
   * eski sürüm bu yüzden hiçbir zaman aralık yakalayamıyordu.
   *
   * React'in `onSelect`i pencere odakta değilken tetiklenmeyebiliyor;
   * fare/klavye olaylarına da bağlıyoruz ki seçim hep yakalansın.
   */
  const readSelection = () => {
    const el = areaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    if (start === null || end === null || start === end) return
    setSelection({ start, end })
  }

  const addWrong = () => {
    if (!selection || targetIndex < 0 || !explanation.trim()) return
    if (alreadyMarked) {
      toast('Bu parçada zaten bir yanlış var. Önce onu sil.', 'error')
      return
    }

    const wrong: WrongBlock = {
      blockIndex: targetIndex,
      text: selectedText,
      explanation: explanation.trim(),
      correction: correction.trim(),
      points: 100,
    }

    setWrongBlocks((list) => [...list, wrong].sort((a, b) => a.blockIndex - b.blockIndex))
    setSelection(null)
    setExplanation('')
    setCorrection('')
  }

  const removeWrong = (blockIndex: number) =>
    setWrongBlocks((list) => list.filter((w) => w.blockIndex !== blockIndex))

  /**
   * Metin değişince parça sınırları kayar; eski işaretler yanlış parçayı
   * gösterebilir. Artık var olmayan parçalara düşenleri atıyoruz.
   */
  useEffect(() => {
    setWrongBlocks((list) => {
      const kept = list.filter((w) => w.blockIndex < segments.length)
      return kept.length === list.length ? list : kept
    })
  }, [segments.length])

  const start = async () => {
    if (!lesson || !user) return
    if (!text.trim()) {
      toast('Önce ders notunu gir.', 'error')
      return
    }
    if (!wrongBlocks.length) {
      toast('En az bir yanlış işaretlemelisin.', 'error')
      return
    }

    setBusy(true)
    try {
      const session = await ses.createSession(lesson, user.uid, user.name, {
        mode,
        version: 2,
        segments: segments.map((s) => s.text),
        wrongBlocks,
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
        <p className="label">AMFİ 2.0 · HAZIRLIK</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          {lesson.title}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Ders notunu yapıştır, yanlış olan yerleri seçip işaretle. Ders sırasında metin
          parça parça okunur; öğrenciler hatayı duyunca telefonlarına notunu yazar.
        </p>
      </motion.div>

      {/* Mod */}
      <div className="file-card space-y-3 p-6">
        <p className="label font-bold">MOD</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['capture', 'Sesli Okuma', 'TTS parçayı okur, okuma boyunca not penceresi açıktır.'],
              ['quiz', 'Sessiz Mod', 'Ses yok. Metin perdede durur, pencereyi sen açıp kapatırsın.'],
            ] as const
          ).map(([m, title, desc]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                'rounded-sm border-2 px-4 py-3 text-left transition-colors',
                mode === m
                  ? 'border-ink bg-paper-deep'
                  : 'border-paper-edge bg-paper-card hover:border-ink',
              )}
            >
              <p className="font-display font-bold text-ink">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Ders notu */}
      <div className="file-card space-y-3 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <label className="label font-bold" htmlFor="script">
            DERS NOTU
          </label>
          <span className="label">{segments.length} PARÇA</span>
        </div>
        <textarea
          id="script"
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSelect={readSelection}
          onMouseUp={readSelection}
          onTouchEnd={readSelection}
          onKeyUp={readSelection}
          className="field min-h-[280px] resize-y font-serif leading-relaxed"
          placeholder="Ders metnini buraya yapıştır. Cümleler ve paragraflar otomatik olarak parçalara ayrılır…"
        />
        <p className="text-xs text-ink-muted">
          Yanlış olan yeri fareyle seç — aşağıda işaretleme formu açılır.
        </p>
      </div>

      {/* Yanlış ekleme formu */}
      <AnimatePresence>
        {selection && targetSegment && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="file-card space-y-4 border-l-4 border-l-mark p-6"
          >
            <div>
              <p className="label font-bold">SEÇİLEN</p>
              <p className="mt-1.5 font-serif text-base text-mark">“{selectedText}”</p>
              <p className="mt-3 rounded-sm bg-paper-deep p-3 text-xs leading-relaxed text-ink-muted">
                <span className="font-mono font-bold text-ink">
                  PARÇA {String(targetIndex + 1).padStart(2, '0')}
                </span>{' '}
                — bu parçanın tamamı okunacak: “{targetSegment.text}”
              </p>
            </div>

            {alreadyMarked && (
              <p className="rounded-sm border-l-2 border-flag bg-flag-soft px-4 py-3 text-sm text-ink">
                Bu parçada zaten işaretli bir yanlış var. Bir parçaya yalnızca bir yanlış
                konabilir — önce mevcut olanı sil.
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
                placeholder="Örn: Humerus üst ekstremitede; burada femur denmesi yanlış."
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                Gemini öğrencinin notunu bu açıklamayla karşılaştırıp puanlayacak — net yaz.
              </p>
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
                placeholder="Bölüm kapanınca perdede gösterilecek doğru bilgi"
              />
            </div>

            <div className="flex gap-3">
              <Button3D
                type="button"
                onClick={addWrong}
                size="md"
                tone="danger"
                disabled={!explanation.trim() || alreadyMarked}
              >
                Yanlış Olarak İşaretle
              </Button3D>
              <Button3D
                type="button"
                onClick={() => {
                  setSelection(null)
                  setExplanation('')
                  setCorrection('')
                }}
                size="md"
                tone="ghost"
              >
                Vazgeç
              </Button3D>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parça önizlemesi */}
      {segments.length > 0 && (
        <div className="file-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="label font-bold">OKUMA SIRASI</p>
            <span className="label">{wrongBlocks.length} YANLIŞ İŞARETLİ</span>
          </div>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {segments.map((seg, i) => {
              const wrong = wrongBlocks.find((w) => w.blockIndex === i)
              return (
                <div
                  key={i}
                  className={cx(
                    'rounded-sm border-l-4 px-3 py-2.5',
                    wrong ? 'border-l-mark bg-mark-soft' : 'border-l-paper-edge bg-paper-deep',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-[11px] font-bold text-ink-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-sm leading-relaxed text-ink">{seg.text}</p>
                      {wrong && (
                        <p className="mt-1.5 text-xs text-mark">
                          <span className="font-bold">YANLIŞ:</span> {wrong.explanation}
                        </p>
                      )}
                    </div>
                    {wrong && (
                      <button
                        type="button"
                        onClick={() => removeWrong(i)}
                        className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mark hover:underline"
                      >
                        SİL
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Başlat */}
      <div className="flex flex-wrap gap-3">
        <Button3D
          onClick={start}
          size="lg"
          tone="success"
          disabled={busy || !wrongBlocks.length || !text.trim()}
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
