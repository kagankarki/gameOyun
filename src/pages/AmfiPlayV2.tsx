/**
 * Amfi — ÖĞRENCİNİN TELEFONU
 *
 * Ekranda ders metni YOKTUR. Öğrenci hocayı dinler, hatayı duyduğu an
 * kocaman butona basar. Bastığı an yalnızca bir zaman damgası gider;
 * hangi hataya denk geldiğini ve kaç puan olduğunu hoca cihazı hesaplar.
 *
 * Yakaladıysa hocanın önceden hazırladığı çoktan seçmeli soru düşer:
 * doğru bilirse ek puan, bilemezse yakalama puanı elinde kalır — ceza yok.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import { RatingForm } from '@/components/Rating'
import SurveyForm from '@/components/SurveyForm'
import * as ses from '@/lib/session'
import type { Catch, LiveSession, Participant, SessionRating } from '@/lib/types'
import { cx } from '@/lib/utils'

interface Props {
  sessionId: string
  participantId: string
}

export default function AmfiPlayV2({ sessionId, participantId }: Props) {
  const [session, setSession] = useState<LiveSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [catches, setCatches] = useState<Catch[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])

  const [busy, setBusy] = useState(false)
  const [delta, setDelta] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)

  const prevScore = useRef<number | null>(null)

  useEffect(() => ses.watchSession(sessionId, setSession), [sessionId])
  useEffect(() => ses.watchParticipants(sessionId, setParticipants), [sessionId])
  useEffect(() => ses.watchCatches(sessionId, setCatches), [sessionId])
  useEffect(() => ses.watchRatings(sessionId, setRatings), [sessionId])

  const me = useMemo(
    () => participants.find((p) => p.id === participantId) ?? null,
    [participants, participantId],
  )
  const rank = useMemo(
    () => participants.findIndex((p) => p.id === participantId) + 1,
    [participants, participantId],
  )

  /** Bu öğrencinin basışları, yeniden eskiye */
  const mine = useMemo(
    () =>
      catches
        .filter((c) => c.participantId === participantId)
        .sort((a, b) => b.flaggedAt - a.flaggedAt),
    [catches, participantId],
  )

  /** Cevap bekleyen soru — bir seferde yalnızca biri */
  const bekleyenSoru = useMemo(
    () => mine.find((c) => c.status === 'hit' && c.question && c.answerIndex === undefined) ?? null,
    [mine],
  )
  /** Az önce cevaplanıp sonucu gelen soru */
  const sonucGelen = useMemo(
    () => mine.find((c) => c.answerCorrect !== undefined) ?? null,
    [mine],
  )
  const sonBasis = mine[0] ?? null

  /* Puan değişince kısa bir geri bildirim */
  useEffect(() => {
    if (!me) return
    if (prevScore.current !== null && me.score !== prevScore.current) {
      setDelta(me.score - prevScore.current)
      prevScore.current = me.score
      const t = setTimeout(() => setDelta(null), 2600)
      return () => clearTimeout(t)
    }
    prevScore.current = me.score
  }, [me?.score])

  const acik = session?.phase === 'speaking' || session?.phase === 'grace'
  /** İşlenmemiş bir basışı varken tekrar basmasın */
  const bekleyenBasis = mine.some((c) => c.status === 'pending')
  const basabilir = Boolean(acik && !busy && !bekleyenBasis && !bekleyenSoru)

  const bas = async () => {
    if (!session || !basabilir) return
    setBusy(true)
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
    // Amfide kendi telefonunun sesi duyulmaz; dokunsal geri bildirim iyi olur
    navigator.vibrate?.(60)
    try {
      await ses.sendCatch(session, participantId)
    } finally {
      setBusy(false)
    }
  }

  const cevapla = async (i: number) => {
    if (!bekleyenSoru) return
    navigator.vibrate?.(30)
    await ses.answerCatch(bekleyenSoru, i)
  }

  /* Boşluk tuşu (bilgisayardan katılan olursa) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (document.activeElement?.tagName === 'TEXTAREA') return
      e.preventDefault()
      void bas()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [basabilir, session])

  if (!session)
    return (
      <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
        <p className="text-sm text-ink-muted">Oturuma bağlanılıyor…</p>
      </div>
    )

  /* ══════════════ DERS BİTTİ ══════════════ */
  if (session.phase === 'ended') {
    const yakaladi = mine.filter((c) => c.status === 'hit').length
    const bosa = mine.filter((c) => c.status === 'miss').length
    const dogruCevap = mine.filter((c) => c.answerCorrect === true).length

    return (
      <div className="mx-auto max-w-md space-y-5 px-5 py-10">
        <div className="file-card p-8 text-center">
          <span className="stamp-verify animate-stamp">DERS BİTTİ</span>
          <p className="mt-8 font-display text-6xl font-bold text-ink">{me?.score ?? 0}</p>
          <p className="label mt-2">TOPLAM PUAN</p>

          <div className="mt-8 grid grid-cols-4 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge">
            {(
              [
                ['YAKALADIN', yakaladi, 'text-verify'],
                ['SORU', dogruCevap, 'text-flag'],
                ['BOŞA', bosa, 'text-mark'],
                ['KAÇAN', me?.misses ?? 0, 'text-ink-muted'],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="bg-paper-card p-3">
                <p className={cx('font-display text-xl font-bold', c)}>{v}</p>
                <p className="label mt-0.5">{k}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 font-display text-2xl font-bold text-ink">
            {rank || '—'}. sıra
            <span className="ml-2 text-sm font-normal text-ink-muted">
              / {participants.length}
            </span>
          </p>
        </div>

        <RatingForm sessionId={sessionId} participant={me} ratings={ratings} />
        <SurveyForm sessionId={sessionId} participant={me} />
      </div>
    )
  }

  /* ══════════════ OYUN ══════════════ */
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-68px)] max-w-md flex-col px-5 py-5">
      {/* Künye */}
      <div className="file-card flex items-center gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{me?.name}</p>
          <p className="label mt-0.5">KOD {session.code}</p>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-ink">{rank || '—'}</p>
            <p className="label mt-1">SIRA</p>
          </div>
          <div className="relative text-right">
            <p className="font-display text-xl font-bold leading-none text-ink">
              {me?.score ?? 0}
            </p>
            <p className="label mt-1">PUAN</p>
            <AnimatePresence>
              {delta !== null && (
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: -18 }}
                  exit={{ opacity: 0 }}
                  className={cx(
                    'absolute right-0 top-0 font-display text-lg font-bold',
                    delta > 0 ? 'text-verify' : 'text-mark',
                  )}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 py-5">
        {/* ── Ek soru ── */}
        {bekleyenSoru && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col rounded-sm border-2 border-verify bg-verify-soft p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="stamp-verify">YAKALADIN</span>
              <span className="font-display text-2xl font-bold text-verify">
                +{bekleyenSoru.points}
              </span>
            </div>

            <p className="mt-5 font-display text-lg font-semibold leading-snug text-ink">
              {bekleyenSoru.question}
            </p>

            <div className="mt-4 space-y-2">
              {bekleyenSoru.options?.map((o, i) => (
                <button
                  key={i}
                  onClick={() => cevapla(i)}
                  className="flex w-full items-center gap-3 rounded-sm border-2 border-paper-edge bg-paper-card px-3 py-3 text-left transition-colors hover:border-ink active:translate-y-px"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-xs font-bold text-ink">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm font-medium text-ink">{o}</span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-ink-muted">
              Doğru bilirsen ek puan. Bilemezsen bir şey kaybetmezsin.
            </p>
          </motion.div>
        )}

        {/* ── Soru sonucu ── */}
        {!bekleyenSoru && sonucGelen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cx(
              'rounded-sm border-2 p-4',
              sonucGelen.answerCorrect
                ? 'border-verify bg-verify-soft'
                : 'border-paper-edge bg-paper-deep',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className={cx(
                  'font-display text-lg font-bold',
                  sonucGelen.answerCorrect ? 'text-verify' : 'text-ink-muted',
                )}
              >
                {sonucGelen.answerCorrect ? `✓ Doğru · +${sonucGelen.bonus}` : '✗ Bu sefer olmadı'}
              </p>
              {!sonucGelen.answerCorrect && sonucGelen.revealIndex !== undefined && (
                <span className="font-mono text-xs font-bold text-ink">
                  Doğrusu: {String.fromCharCode(65 + sonucGelen.revealIndex)}
                </span>
              )}
            </div>
            {sonucGelen.revealText && (
              <p className="mt-2 text-sm leading-relaxed text-ink">{sonucGelen.revealText}</p>
            )}
          </motion.div>
        )}

        {/* ── Zil ── */}
        {!bekleyenSoru && (
          <motion.button
            onClick={bas}
            disabled={!basabilir}
            animate={flash ? { scale: [1, 0.96, 1] } : {}}
            transition={{ duration: 0.35 }}
            className={cx(
              'flex min-h-[260px] flex-1 flex-col items-center justify-center gap-4',
              'rounded-sm border-4 font-display font-bold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink focus-visible:ring-offset-2',
              basabilir
                ? 'border-mark bg-mark text-white shadow-lift active:translate-y-1'
                : 'border-paper-edge bg-paper-deep text-ink-faint',
            )}
          >
            <span className="text-[44px] leading-none sm:text-[56px]">
              {bekleyenBasis ? 'GÖNDERİLDİ' : 'HATA VAR'}
            </span>
            <span className="font-sans text-sm font-normal opacity-80">
              {basabilir
                ? 'Hatayı duyduğun an bas'
                : bekleyenBasis
                  ? 'Kontrol ediliyor…'
                  : session.phase === 'lobby'
                    ? 'Ders başlamak üzere'
                    : 'Ders bitiyor'}
            </span>
          </motion.button>
        )}

        {/* Son basışın sonucu */}
        {!bekleyenSoru && sonBasis?.status === 'miss' && (
          <p className="rounded-sm border-l-4 border-l-mark bg-mark-soft px-4 py-3 text-center text-sm text-ink">
            Orada bir hata yoktu — <strong>{ses.FALSE_ALARM_PENALTY} puan</strong> gitti.
            Emin olmadan basma.
          </p>
        )}
      </div>

      {/* Durum */}
      <p
        className={cx(
          'rounded-sm border-l-4 px-4 py-2.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.16em]',
          session.phase === 'speaking' && 'border-l-mark bg-mark-soft text-mark',
          session.phase === 'grace' && 'border-l-flag bg-flag-soft text-flag',
          session.phase === 'lobby' && 'border-l-paper-edge bg-paper-deep text-ink-muted',
          session.phase === 'reveal' && 'border-l-ink bg-paper-deep text-ink',
        )}
      >
        {session.phase === 'lobby' && 'KATILIM ALINDI · BEKLE'}
        {session.phase === 'speaking' && '● DİNLE'}
        {session.phase === 'grace' && '● SON SANİYELER'}
        {session.phase === 'reveal' && '■ BEKLE'}
      </p>
    </div>
  )
}
