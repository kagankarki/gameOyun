/**
 * Amfi 2.0 — Öğrencinin telefonu (not yazma)
 *
 * Metin öğrenciye GÖSTERİLMEZ: hocayı/sesi dinler, hatayı duyduğunda
 * ne olduğunu kısaca yazar. Doğrulamayı ve puanlamayı hoca cihazı yapar
 * (bkz. AmfiHostV2) — burada yalnızca notu gönderip sonucu bekliyoruz.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import { RatingForm } from '@/components/Rating'
import * as ses from '@/lib/session'
import type { LiveSession, Participant, SessionRating, StudentNote } from '@/lib/types'
import { cx } from '@/lib/utils'

interface Props {
  sessionId: string
  participantId: string
}

export default function AmfiPlayV2({ sessionId, participantId }: Props) {
  const [session, setSession] = useState<LiveSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notes, setNotes] = useState<StudentNote[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])

  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delta, setDelta] = useState<number | null>(null)
  const [graceLeft, setGraceLeft] = useState(0)
  /**
   * "HATA VAR"a bastığı an. Hız bonusu buradan hesaplanıyor — yazmayı
   * bitirmesini beklersek hatayı ilk fark eden yavaş yazar diye kaybeder.
   */
  const [flaggedAt, setFlaggedAt] = useState<number | null>(null)

  const prevScore = useRef<number | null>(null)

  useEffect(() => ses.watchSession(sessionId, setSession), [sessionId])
  useEffect(() => ses.watchParticipants(sessionId, setParticipants), [sessionId])
  useEffect(() => ses.watchStudentNotes(sessionId, setNotes), [sessionId])
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
      prevScore.current = me.score
      const t = setTimeout(() => setDelta(null), 2400)
      return () => clearTimeout(t)
    }
    prevScore.current = me.score
  }, [me?.score])

  /* Tolerans geri sayımı — yazmayı bitirmesi için kaç saniyesi kaldı */
  useEffect(() => {
    if (session?.phase !== 'grace' || !session.graceEndsAt) {
      setGraceLeft(0)
      return
    }
    const tick = () =>
      setGraceLeft(Math.max(0, Math.ceil((session.graceEndsAt - Date.now()) / 1000)))
    tick()
    const t = window.setInterval(tick, 250)
    return () => clearInterval(t)
  }, [session?.phase, session?.graceEndsAt])

  const windowOpen = session?.phase === 'speaking' || session?.phase === 'grace'
  const myNote = useMemo(
    () =>
      notes.find(
        (n) => n.participantId === participantId && n.blockIndex === session?.currentBlockIndex,
      ) ?? null,
    [notes, participantId, session?.currentBlockIndex],
  )
  const canSubmit = Boolean(windowOpen && !myNote && noteText.trim().length > 0 && !busy)

  /* Yeni parça açılınca her şeyi sıfırla */
  useEffect(() => {
    setNoteText('')
    setError(null)
    setFlaggedAt(null)
  }, [session?.currentBlockIndex])

  /** Hatayı duydu — süre burada durur, yazmaya sonra devam eder */
  const flag = () => {
    if (!windowOpen || myNote || flaggedAt !== null) return
    setFlaggedAt(Date.now())
    // Amfide kendi telefonunun sesi duyulmaz; dokunsal geri bildirim iyi olur
    navigator.vibrate?.(60)
  }

  /* Bilgisayardan katılan olursa boşluk tuşu da işaretlesin */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      // Kutu açıldıysa boşluk artık yazı yazmak için
      if (document.activeElement?.tagName === 'TEXTAREA') return
      e.preventDefault()
      flag()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [windowOpen, myNote, flaggedAt])

  const submit = async () => {
    if (!session || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await ses.submitStudentNote(session, participantId, noteText, flaggedAt ?? undefined)
      setNoteText('')
      navigator.vibrate?.(40)
    } catch (err) {
      setError((err as Error).message || 'Not gönderilemedi. Tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  if (!session)
    return (
      <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
        <p className="text-sm text-ink-muted">Oturuma bağlanılıyor…</p>
      </div>
    )

  /* ══════════════ DERS BİTTİ ══════════════ */
  if (session.phase === 'ended') {
    const mine = notes.filter((n) => n.participantId === participantId)
    const valid = mine.filter((n) => n.status === 'valid').length
    const invalid = mine.filter((n) => n.status === 'invalid').length

    return (
      <div className="mx-auto max-w-md space-y-5 px-5 py-10">
        <div className="file-card p-8 text-center">
          <span className="stamp-verify animate-stamp">DERS BİTTİ</span>
          <p className="mt-8 font-display text-6xl font-bold text-ink">{me?.score ?? 0}</p>
          <p className="label mt-2">TOPLAM PUAN</p>

          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge">
            {(
              [
                ['DOĞRU', valid, 'text-verify'],
                ['YANLIŞ', invalid, 'text-mark'],
                ['KAÇIRDIN', me?.misses ?? 0, 'text-flag'],
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
      </div>
    )
  }

  /* ══════════════ OYUN ══════════════ */
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-68px)] max-w-md flex-col px-5 py-5">
      {/* Üst künye */}
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

      {/* Not yazma alanı */}
      <div className="flex flex-1 flex-col gap-4 py-5">
        {/* 1. adım — dinliyor. Ekranda metin YOK, sadece zil.
            Hocayı dinleyip hatayı duyduğu an basar. */}
        {windowOpen && !myNote && flaggedAt === null && (
          <motion.button
            onClick={flag}
            whileTap={{ scale: 0.97 }}
            className={cx(
              'flex min-h-[320px] flex-1 flex-col items-center justify-center gap-4',
              'rounded-sm border-4 border-mark bg-mark font-display font-bold text-white',
              'shadow-lift transition-colors duration-200 active:translate-y-1',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink focus-visible:ring-offset-2',
            )}
          >
            <span className="text-[44px] leading-none sm:text-[56px]">HATA VAR</span>
            <span className="font-sans text-sm font-normal opacity-80">
              Hatayı duyduğun an bas, sonra yaz
            </span>
          </motion.button>
        )}

        {/* 2. adım — bastı, şimdi ne olduğunu yazıyor.
            Tepki süresi basışta kaydedildi; yazma hızı puanı etkilemez. */}
        {windowOpen && !myNote && flaggedAt !== null && (
          <>
            <div className="flex-1 rounded-sm border-2 border-mark bg-mark-soft p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="label text-mark">HATA NEYDİ?</p>
                <span className="label text-verify">✓ SÜREN KAYDEDİLDİ</span>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={280}
                autoFocus
                className="field min-h-[140px] resize-none"
                placeholder="Neyin yanlış olduğunu kısaca açıkla…"
              />
              <p className="mt-2 text-xs text-ink-muted">
                Acele etme, puanın yazma hızına göre değil. Boşa yazarsan{' '}
                {ses.FALSE_ALARM_PENALTY} puan ceza.
              </p>
            </div>

            {error && (
              <p className="rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm text-ink">
                {error}
              </p>
            )}

            <Button3D onClick={submit} disabled={!canSubmit} size="lg" full tone="danger">
              {busy ? 'Gönderiliyor…' : 'Gönder'}
            </Button3D>
          </>
        )}

        {myNote && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cx(
              'flex flex-1 flex-col justify-center rounded-sm border-2 p-5 text-center',
              myNote.status === 'valid'
                ? 'border-verify bg-verify-soft'
                : myNote.status === 'invalid'
                  ? 'border-mark bg-mark-soft'
                  : 'border-paper-edge bg-paper-deep',
            )}
          >
            <p
              className={cx(
                'font-display text-3xl font-bold',
                myNote.status === 'valid'
                  ? 'text-verify'
                  : myNote.status === 'invalid'
                    ? 'text-mark'
                    : 'text-ink-muted',
              )}
            >
              {myNote.status === 'valid'
                ? '✓ Doğru yakaladın'
                : myNote.status === 'invalid'
                  ? '✗ Olmadı'
                  : 'Kontrol ediliyor…'}
            </p>

            <p className="mt-4 rounded-sm bg-paper-card px-3 py-2 text-sm text-ink">
              “{myNote.text}”
            </p>

            {myNote.geminiFeedback && (
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                {myNote.geminiFeedback}
              </p>
            )}
          </motion.div>
        )}

        {!windowOpen && !myNote && (
          <div className="flex flex-1 items-center justify-center rounded-sm border-2 border-paper-edge bg-paper-deep px-6 text-center">
            <p className="text-sm leading-relaxed text-ink-muted">
              {session.phase === 'lobby' && 'Ders başlamak üzere. Hazır ol.'}
              {session.phase === 'reveal' &&
                // Bastı ama yetiştiremediyse sessizce kaybolmasın — ne olduğunu bilsin
                (flaggedAt !== null
                  ? 'Süre doldu, notun gönderilemedi. Sonraki parçada daha erken bas.'
                  : 'Bu bölüm kapandı. Sonraki parçayı bekle.')}
            </p>
          </div>
        )}
      </div>

      {/* Durum */}
      <p
        className={cx(
          'flex items-center justify-center gap-3 rounded-sm border-l-4 px-4 py-2.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.16em]',
          session.phase === 'speaking' && 'border-l-mark bg-mark-soft text-mark',
          session.phase === 'grace' && 'border-l-flag bg-flag-soft text-flag',
          session.phase === 'reveal' && 'border-l-ink bg-paper-deep text-ink',
          session.phase === 'lobby' && 'border-l-paper-edge bg-paper-deep text-ink-muted',
        )}
      >
        <span>
          {session.phase === 'lobby' && 'KATILIM ALINDI · BEKLE'}
          {session.phase === 'speaking' && '● DİNLE ve YAZ'}
          {session.phase === 'grace' && '● SON SANİYELER'}
          {session.phase === 'reveal' && '■ BÖLÜM KAPANDI'}
        </span>
        {session.phase === 'grace' && graceLeft > 0 && (
          <span className="text-sm">{graceLeft}</span>
        )}
      </p>
    </div>
  )
}
