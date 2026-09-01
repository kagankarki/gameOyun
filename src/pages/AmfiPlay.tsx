import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import QuizRunner from '@/components/QuizRunner'
import { RatingForm } from '@/components/Rating'
import * as ses from '@/lib/session'
import type { LiveSession, Participant, SessionRating } from '@/lib/types'
import { cx } from '@/lib/utils'

interface Props {
  sessionId: string
  participantId: string
  /** Katılımı bırakıp katılım ekranına dön — cihaz bu oturuma çakılı kalmasın. */
  onLeave: () => void
}

/**
 * Öğrencinin telefonu — zil.
 * Metin YOK: öğrenci hocayı/sesi dinler, hatayı duyduğu an basar.
 */
export default function AmfiPlay({ sessionId, participantId, onLeave }: Props) {
  const [session, setSession] = useState<LiveSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  /** Bu öğrencinin bastığı bölüm — aynı bölüme ikinci kez basamasın */
  const [buzzedBlock, setBuzzedBlock] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const prevScore = useRef<number | null>(null)
  const [delta, setDelta] = useState<number | null>(null)

  useEffect(() => ses.watchSession(sessionId, setSession), [sessionId])
  useEffect(() => ses.watchParticipants(sessionId, setParticipants), [sessionId])
  useEffect(() => ses.watchRatings(sessionId, setRatings), [sessionId])

  const me = useMemo(
    () => participants.find((p) => p.id === participantId) ?? null,
    [participants, participantId],
  )
  const rank = useMemo(
    () => participants.findIndex((p) => p.id === participantId) + 1,
    [participants, participantId],
  )

  /* Puan değişince kısa bir geri bildirim göster */
  useEffect(() => {
    if (!me) return
    if (prevScore.current !== null && me.score !== prevScore.current) {
      setDelta(me.score - prevScore.current)
      const t = setTimeout(() => setDelta(null), 2200)
      prevScore.current = me.score
      return () => clearTimeout(t)
    }
    prevScore.current = me.score
  }, [me?.score])

  const windowOpen = session?.phase === 'speaking' || session?.phase === 'grace'
  const alreadyBuzzed = session ? buzzedBlock === session.currentBlockIndex : false
  const canBuzz = Boolean(session && windowOpen && !alreadyBuzzed)

  const doBuzz = () => {
    if (!session || !canBuzz) return
    setBuzzedBlock(session.currentBlockIndex)
    setFlash(true)
    setTimeout(() => setFlash(false), 450)
    // Titreşim varsa kullan — amfide sesi duyulmaz, dokunsal geri bildirim iyi olur
    navigator.vibrate?.(60)
    ses.sendBuzz(session, participantId)
  }

  /* Boşluk tuşu da çalışsın (bilgisayardan katılan olursa) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        doBuzz()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, canBuzz])

  if (!session)
    return (
      <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
        <p className="text-sm text-ink-muted">Oturuma bağlanılıyor…</p>
      </div>
    )

  /* ══════════════ ÖN TEST / SON TEST ══════════════
     Ders akışı: ön test → dersi dinle → son test. Test açıkken oyun
     ekranı değil, soru kâğıdı görünür. */
  if (session.phase === 'pretest' || session.phase === 'posttest')
    return <QuizRunner session={session} participant={me} />

  /* ── Ders bitti ── */
  if (session.phase === 'ended') {
    return (
      <div className="mx-auto max-w-md space-y-5 px-5 py-10">
        <div className="file-card w-full p-8 text-center">
          <span className="stamp-verify animate-stamp">DERS BİTTİ</span>
          <p className="mt-8 font-display text-6xl font-bold text-ink">{me?.score ?? 0}</p>
          <p className="label mt-2">TOPLAM PUAN</p>

          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge">
            {(
              [
                ['YAKALADIN', me?.hits ?? 0, 'text-verify'],
                ['KAÇIRDIN', me?.misses ?? 0, 'text-flag'],
                ['BOŞA', me?.falseAlarms ?? 0, 'text-mark'],
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

        {/* 5 yıldız üzerinden ders değerlendirmesi */}
        <RatingForm sessionId={sessionId} participant={me} ratings={ratings} />
        {/* Ders bitti — cihaz bu oturumda takılı kalmasın, sıradaki derse
            girebilmek için katılımı bırakabilmeli. */}
        <Button3D full tone="ghost" onClick={onLeave}>
          Oturumdan çık · yeni derse katıl
        </Button3D>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-68px)] max-w-md flex-col px-5 py-5">
      {/* Üst künye */}
      <div className="file-card flex items-center gap-4 px-4 py-3">
        <div>
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

            {delta !== null && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: -14 }}
                exit={{ opacity: 0 }}
                className={cx(
                  'absolute right-0 top-0 font-display text-lg font-bold',
                  delta > 0 ? 'text-verify' : 'text-mark',
                )}
              >
                {delta > 0 ? `+${delta}` : delta}
              </motion.span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onLeave}
        className="mt-2 self-end text-[11px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Bu oturumdan çık
      </button>
      {/* ZİL */}
      <div className="flex flex-1 items-center py-6">
        <motion.button
          onClick={doBuzz}
          disabled={!canBuzz}
          animate={flash ? { scale: [1, 0.95, 1] } : {}}
          transition={{ duration: 0.35 }}
          className={cx(
            'flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-4',
            'rounded-sm border-4 font-display font-bold transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink focus-visible:ring-offset-2',
            canBuzz
              ? 'border-mark bg-mark text-white shadow-lift active:translate-y-1'
              : alreadyBuzzed
                ? 'border-verify bg-verify-soft text-verify'
                : 'border-paper-edge bg-paper-deep text-ink-faint',
          )}
        >
          <span className="text-[44px] leading-none sm:text-[56px]">
            {alreadyBuzzed ? 'BASILDI' : 'HATA VAR'}
          </span>
          <span className="font-sans text-sm font-normal opacity-80">
            {canBuzz
              ? 'Hatayı duyduğun an bas'
              : alreadyBuzzed
                ? 'Bu bölüm için işaretin alındı'
                : session.phase === 'lobby'
                  ? 'Ders başlamak üzere'
                  : 'Bölüm kapandı, bekle'}
          </span>
        </motion.button>
      </div>

      {/* Durum */}
      <p
        className={cx(
          'rounded-sm border-l-4 px-4 py-2.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.16em]',
          session.phase === 'speaking' && 'border-l-mark bg-mark-soft text-mark',
          session.phase === 'grace' && 'border-l-flag bg-flag-soft text-flag',
          session.phase === 'reveal' && 'border-l-ink bg-paper-deep text-ink',
          session.phase === 'lobby' && 'border-l-paper-edge bg-paper-deep text-ink-muted',
        )}
      >
        {session.phase === 'lobby' && 'KATILIM ALINDI · BEKLE'}
        {session.phase === 'speaking' && '● DİNLE'}
        {session.phase === 'grace' && '● SON SANİYELER'}
        {session.phase === 'reveal' && '■ BÖLÜM KAPANDI'}
      </p>
    </div>
  )
}
