import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import type { Attempt, Lesson } from '@/lib/types'
import { EASE } from '@/lib/motion'
import { cx, fmtDuration, uid } from '@/lib/utils'

const FALSE_ALARM_PENALTY = 40

type Judge = { kind: 'hit' | 'miss' | 'false'; text: string; points: number } | null

export default function LessonPlay() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [flagged, setFlagged] = useState<string[]>([])
  const [judge, setJudge] = useState<Judge>(null)
  const [locked, setLocked] = useState(false)
  const [done, setDone] = useState(false)
  const [saved, setSaved] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const results = useRef<{ correct: number; missed: number; falseAlarm: number }>({
    correct: 0,
    missed: 0,
    falseAlarm: 0,
  })

  useEffect(() => {
    let alive = true
    api.getLesson(id!).then((l) => {
      if (!alive) return
      setLesson(l)
      setLoading(false)
      startedAt.current = Date.now()
    })
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    if (done) return
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000)
    return () => clearInterval(t)
  }, [done])

  const block = lesson?.blocks[i]
  const total = lesson?.blocks.length ?? 0
  const traps = useMemo(() => lesson?.blocks.filter((b) => b.isWrong).length ?? 0, [lesson])

  const advance = useCallback(() => {
    setJudge(null)
    setLocked(false)
    if (i + 1 >= total) setDone(true)
    else setI(i + 1)
  }, [i, total])

  /* ── "Burada Yanlış Var!" ── */
  const flag = useCallback(() => {
    if (!block || locked || done) return
    setLocked(true)
    setFlagged((f) => [...f, block.id])

    if (block.isWrong) {
      const p = block.points ?? 100
      results.current.correct += 1
      setScore((s) => s + p)
      setJudge({
        kind: 'hit',
        points: p,
        text: block.correction || 'Doğru yakaladın!',
      })
    } else {
      results.current.falseAlarm += 1
      setScore((s) => s - FALSE_ALARM_PENALTY)
      setJudge({
        kind: 'false',
        points: -FALSE_ALARM_PENALTY,
        text: 'Bu bilgi doğruydu. Acele etme, dikkatli dinle.',
      })
    }
  }, [block, locked, done])

  /* ── "Devam" ── */
  const next = useCallback(() => {
    if (!block || done) return
    if (!locked && block.isWrong) {
      // hatayı kaçırdı
      results.current.missed += 1
      setLocked(true)
      setJudge({
        kind: 'miss',
        points: 0,
        text: block.correction || 'Burada bir hata vardı ve kaçırdın.',
      })
      return
    }
    advance()
  }, [block, locked, done, advance])

  /* ── Klavye kısayolları ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return
      if (e.code === 'Space') {
        e.preventDefault()
        flag()
      } else if (e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flag, next, done])

  /* ── Bitişte sonucu kaydet ── */
  useEffect(() => {
    if (!done || saved || !lesson || !user) return
    const attempt: Attempt = {
      id: uid('att'),
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      studentId: user.uid,
      studentName: user.name,
      flagged,
      correct: results.current.correct,
      missed: results.current.missed,
      falseAlarm: results.current.falseAlarm,
      score: Math.max(0, score),
      durationMs: Date.now() - startedAt.current,
      finishedAt: Date.now(),
    }
    setSaved(true)
    api
      .saveAttempt(attempt)
      .then(() => toast('Sonucun kaydedildi.', 'success'))
      .catch(() => toast('Sonuç kaydedilemedi.', 'error'))
  }, [done, saved, lesson, user, score, flagged, toast])

  if (loading) return <Loader label="Dosya hazırlanıyor…" />
  if (!lesson || lesson.blocks.length === 0)
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 text-center">
        <div className="file-card max-w-md p-10">
          <p className="label">DOSYA BULUNAMADI</p>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">
            Bu ders yok ya da içi boş
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Ders silinmiş veya henüz hiç bölüm eklenmemiş olabilir.
          </p>
          <div className="mt-7">
            <Button3D onClick={() => nav('/dersler')}>Derslere Dön</Button3D>
          </div>
        </div>
      </div>
    )

  /* ══════════════ DOSYA RAPORU (SONUÇ) ══════════════ */
  if (done) {
    const acc = traps ? Math.round((results.current.correct / traps) * 100) : 100
    const verdict =
      acc >= 90
        ? { label: 'ÜSTÜN DENETİM', tone: 'stamp-verify' }
        : acc >= 60
          ? { label: 'YETERLİ DENETİM', tone: 'stamp-verify' }
          : acc >= 30
            ? { label: 'EKSİK DENETİM', tone: 'stamp-flag' }
            : { label: 'DENETİM BAŞARISIZ', tone: 'stamp-mark' }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-4xl px-5 py-12 sm:px-6"
      >
        {/* Rapor künyesi */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="file-card mb-8 overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">DOSYA RAPORU</span>
            <span className="label ml-auto">{lesson.subject.toLocaleUpperCase('tr-TR')}</span>
          </div>

          <div className="p-8 text-center sm:p-10">
            <div className="flex justify-center">
              <span className={cx(verdict.tone, 'animate-stamp')}>{verdict.label}</span>
            </div>

            <h1 className="mt-7 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {lesson.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">{lesson.teacherName}</p>

            <div className="mt-8">
              <p className="font-display text-6xl font-bold text-ink sm:text-7xl">
                {Math.max(0, score)}
              </p>
              <p className="label mt-2">TOPLAM PUAN</p>
            </div>

            <div className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge sm:grid-cols-4">
              {(
                [
                  ['YAKALANAN', results.current.correct, 'text-verify'],
                  ['KAÇAN', results.current.missed, 'text-flag'],
                  ['BOŞA BASMA', results.current.falseAlarm, 'text-mark'],
                  ['SÜRE', fmtDuration(Date.now() - startedAt.current), 'text-ink'],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="bg-paper-card p-4">
                  <p className={cx('font-display text-2xl font-bold', c)}>{v}</p>
                  <p className="label mt-1">{k}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button3D onClick={() => nav('/dersler')}>Derslere Dön</Button3D>
              <Button3D tone="ghost" onClick={() => nav('/siralama')}>
                Sıralamayı Gör
              </Button3D>
              <Button3D tone="ghost" onClick={() => window.location.reload()}>
                Tekrar Oyna
              </Button3D>
            </div>
          </div>
        </motion.div>

        {/* İnceleme dökümü */}
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            İnceleme dökümü
          </h2>
          <span className="text-sm text-ink-muted">— dosyadaki her bölüm ve senin işaretin</span>
        </div>

        <div className="space-y-3">
          {lesson.blocks.map((b, idx) => {
            const wasFlagged = flagged.includes(b.id)
            const state = b.isWrong ? (wasFlagged ? 'hit' : 'miss') : wasFlagged ? 'false' : 'ok'

            const edge = {
              hit: 'border-l-verify',
              miss: 'border-l-flag',
              false: 'border-l-mark',
              ok: 'border-l-paper-edge',
            }[state]

            const badge = {
              hit: ['YAKALADIN', 'border-verify-edge bg-verify-soft text-verify'],
              miss: ['KAÇIRDIN', 'border-flag-edge bg-flag-soft text-flag'],
              false: ['BOŞA BASTIN', 'border-mark-edge bg-mark-soft text-mark'],
              ok: ['DOĞRU BİLGİ', 'border-paper-edge bg-paper-deep text-ink-muted'],
            }[state]

            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.4), ease: EASE }}
                className={cx('file-card-tabbed p-5', edge)}
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[11px] font-medium text-ink-faint">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className={cx('label-chip', badge[1])}>{badge[0]}</span>
                </div>

                <p
                  className={cx(
                    'text-[15px] leading-relaxed text-ink',
                    b.isWrong && 'mark-underline',
                  )}
                >
                  {b.text}
                </p>

                {b.isWrong && b.correction && (
                  <p className="marginalia mt-4">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                      DOĞRUSU
                    </span>
                    <br />
                    {b.correction}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    )
  }

  /* ══════════════ İNCELEME EKRANI (OYUN) ══════════════ */
  const progress = ((i + (locked ? 1 : 0)) / total) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex min-h-[calc(100vh-68px)] max-w-4xl flex-col px-5 py-8 sm:px-6"
    >
      {/* Dosya künyesi */}
      <div className="file-card mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{lesson.title}</p>
          <p className="label mt-0.5">{lesson.teacherName.toLocaleUpperCase('tr-TR')}</p>
        </div>

        {/*
          AŞAMA 2 SLOTU — Amfi modunda power-up rozetleri ("Zamanı Yavaşlat")
          ve blok geri sayım halkası buraya girecek. Yer şimdiden ayrıldı ki
          o özellik gelince düzen yeniden tasarlanmasın.
        */}

        <div className="ml-auto flex items-center gap-5">
          <div className="text-right">
            <p className="font-mono text-sm font-medium text-ink">
              {String(i + 1).padStart(2, '0')}
              <span className="text-ink-faint">/{String(total).padStart(2, '0')}</span>
            </p>
            <p className="label mt-0.5">BÖLÜM</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-medium text-ink">{fmtDuration(elapsed)}</p>
            <p className="label mt-0.5">SÜRE</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-ink">
              {Math.max(0, score)}
            </p>
            <p className="label mt-1">PUAN</p>
          </div>
        </div>
      </div>

      {/* İlerleme — mürekkep çizgisi */}
      <div className="mb-8 h-[3px] overflow-hidden rounded-full bg-paper-deep">
        <motion.div
          className="h-full rounded-full bg-ink"
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>

      {/* Dosya sayfası */}
      <div className="flex flex-1 items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={block?.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="w-full"
          >
            <div
              className={cx(
                'file-card-tabbed p-7 transition-colors duration-300 sm:p-10',
                judge?.kind === 'hit' && 'border-l-verify',
                judge?.kind === 'false' && 'border-l-mark',
                judge?.kind === 'miss' && 'border-l-flag',
                !judge && 'border-l-ink',
              )}
            >
              <div className="mb-6 flex items-center gap-3">
                <span className="label">BÖLÜM {String(i + 1).padStart(2, '0')}</span>
                <span className="h-px flex-1 bg-paper-edge" />
              </div>

              <p
                className={cx(
                  'font-display text-[22px] leading-[1.55] text-ink sm:text-[27px] sm:leading-[1.5]',
                  locked && block?.isWrong && 'mark-underline',
                )}
              >
                {block?.text}
              </p>

              {/* Hakem kararı */}
              <AnimatePresence>
                {judge && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="mt-8"
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <span
                        className={cx(
                          'animate-stamp',
                          judge.kind === 'hit' && 'stamp-verify',
                          judge.kind === 'false' && 'stamp-mark',
                          judge.kind === 'miss' && 'stamp-flag',
                        )}
                      >
                        {judge.kind === 'hit'
                          ? 'YAKALANDI'
                          : judge.kind === 'false'
                            ? 'HATA YOK'
                            : 'KAÇIRILDI'}
                      </span>

                      {judge.points !== 0 && (
                        <span
                          className={cx(
                            'ml-auto font-display text-xl font-bold',
                            judge.points > 0 ? 'text-verify' : 'text-mark',
                          )}
                        >
                          {judge.points > 0 ? `+${judge.points}` : judge.points}
                        </span>
                      )}
                    </div>

                    <p
                      className={cx(
                        judge.kind === 'false'
                          ? 'rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm leading-relaxed text-ink'
                          : 'marginalia',
                      )}
                    >
                      {judge.kind !== 'false' && (
                        <>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                            DOĞRUSU
                          </span>
                          <br />
                        </>
                      )}
                      {judge.text}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Aksiyonlar */}
      <div className="mt-8 flex flex-col items-center gap-4 pb-6">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button3D
            tone="danger"
            size="xl"
            onClick={flag}
            disabled={locked}
            className={cx(!locked && 'animate-markpulse')}
          >
            Burada Yanlış Var!
          </Button3D>

          <Button3D
            tone={locked ? 'primary' : 'ghost'}
            size="xl"
            onClick={next}
            icon={i + 1 >= total ? '■' : '→'}
          >
            {locked ? (i + 1 >= total ? 'Bitir' : 'Devam Et') : i + 1 >= total ? 'Bitir' : 'Doğru, geç'}
          </Button3D>
        </div>

        <p className="text-[12px] text-ink-muted">
          Kısayol:{' '}
          <kbd className="rounded-sm border border-paper-edge bg-paper-card px-1.5 py-0.5 font-mono text-[11px]">
            Boşluk
          </kbd>{' '}
          = yanlış bildir ·{' '}
          <kbd className="rounded-sm border border-paper-edge bg-paper-card px-1.5 py-0.5 font-mono text-[11px]">
            Enter
          </kbd>{' '}
          = devam
        </p>
      </div>
    </motion.div>
  )
}
