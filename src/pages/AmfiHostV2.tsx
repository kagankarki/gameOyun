/**
 * Amfi 2.0 — Hoca / projeksiyon ekranı
 * Yol: /hoca/amfi-host-v2/:lessonId?sessionId=...
 *
 * Akış (Amfi 1.0 ile aynı otomatiklik):
 *   lobi → TTS parçayı okur (`speaking`) → okuma biter, yazma toleransı
 *   (`grace`) → bölüm KENDİLİĞİNDEN kapanır (`reveal`) → sonraki parça.
 *
 * Gelen notlar beklemeye alınmaz: her not düştüğü anda Gemini'ye gider,
 * puan aynı saniyede öğrencinin telefonuna yansır. Doğrulamayı yalnızca
 * bu cihaz yapar — 150 telefon kendi puanını yazsa hem tutarsız olurdu
 * hem de Firestore kuralları buna izin vermiyor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { RatingSummary } from '@/components/Rating'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/context/AuthContext'
import * as ses from '@/lib/session'
import { cancelSpeech, getTurkishVoice, isSpeechSupported, speak } from '@/lib/speech'
import type { LiveSession, Participant, SessionRating, StudentNote } from '@/lib/types'
import { cx, initials } from '@/lib/utils'
import { EASE } from '@/lib/motion'

export default function AmfiHostV2() {
  const { lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [session, setSession] = useState<LiveSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notes, setNotes] = useState<StudentNote[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [qr, setQr] = useState('')
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const [graceLeft, setGraceLeft] = useState(0)
  const [loading, setLoading] = useState(true)

  /* Kapanışlarda bayatlamasın diye canlı referanslar */
  const sessionRef = useRef<LiveSession | null>(null)
  const partsRef = useRef<Participant[]>([])
  const notesRef = useRef<StudentNote[]>([])
  const speakRef = useRef<{ cancel: () => void } | null>(null)
  const startedAtRef = useRef(0)
  const durationRef = useRef(0)
  const graceTimer = useRef<number | undefined>(undefined)

  /** Bir kez işlenen not tekrar Gemini'ye gitmesin */
  const seenNotes = useRef(new Set<string>())
  /** Notlar SIRAYLA işlenir — paralel gitse aynı öğrencinin puanı ezilirdi */
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => void (sessionRef.current = session), [session])
  useEffect(() => void (partsRef.current = participants), [participants])
  useEffect(() => void (notesRef.current = notes), [notes])

  /* ── Oturumu bul ──
     URL'de sessionId var (AmfiSetup öyle yönlendiriyor). Hoca adres
     çubuğunu kaybederse bu ders için açık bir 2.0 oturumu arayıp
     kaldığı yerden devam ederiz — 150 öğrenciyi yeniden bağlatmamak için. */
  const sessionIdParam = searchParams.get('sessionId')
  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam)

  useEffect(() => {
    if (sessionIdParam) {
      setSessionId(sessionIdParam)
      return
    }
    if (!lessonId || !user?.uid) return
    let alive = true
    ses.findActiveSession(lessonId, user.uid, 2).then((s) => {
      if (!alive) return
      setSessionId(s?.id ?? null)
      if (!s) setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [sessionIdParam, lessonId, user?.uid])

  /* ── Canlı dinleyiciler ── */
  useEffect(() => {
    if (!sessionId) return
    const unsub = ses.watchSession(sessionId, (s) => {
      setSession(s)
      sessionRef.current = s
      setLoading(false)
    })
    return unsub
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const a = ses.watchParticipants(sessionId, setParticipants)
    const b = ses.watchStudentNotes(sessionId, setNotes)
    const c = ses.watchRatings(sessionId, setRatings)
    return () => {
      a()
      b()
      c()
    }
  }, [sessionId])

  /* ── Türkçe ses ── */
  useEffect(() => {
    if (!isSpeechSupported()) {
      setVoiceError('Bu tarayıcı sesli okumayı desteklemiyor. Chrome veya Edge kullan.')
      return
    }
    getTurkishVoice().then((v) => {
      if (v) setVoice(v)
    })
  }, [])

  /* ── Sayfadan ayrılırken sesi kes ── */
  useEffect(
    () => () => {
      speakRef.current?.cancel()
      cancelSpeech()
      if (graceTimer.current) clearTimeout(graceTimer.current)
    },
    [],
  )

  /* ── Bölümü kapat ve puanla ──
     Bekleyen Gemini doğrulamaları bitmeden kapatmıyoruz; aksi hâlde
     "kaçırdı" damgası daha not işlenmeden basılırdı. */
  const closeBlock = useCallback(async () => {
    const s = sessionRef.current
    if (!s || s.phase === 'reveal' || s.phase === 'ended') return

    await queue.current
    await ses.markMisses(s, partsRef.current, notesRef.current)
    await ses.saveSession({
      ...sessionRef.current!,
      phase: 'reveal',
      blockDurationMs: durationRef.current || s.blockDurationMs,
      graceEndsAt: 0,
    })
  }, [])

  /* ── Bir parçayı sahneye al ── */
  const runSegment = useCallback(
    (index: number) => {
      const s = sessionRef.current
      if (!s) return
      const text = s.segments[index]
      if (!text) return

      if (graceTimer.current) clearTimeout(graceTimer.current)
      speakRef.current?.cancel()
      setHighlight(-1)
      durationRef.current = 0

      const open = (startedAt: number) =>
        ses.saveSession({
          ...sessionRef.current!,
          phase: 'speaking',
          currentBlockIndex: index,
          blockStartedAt: startedAt,
          blockDurationMs: 0,
          blockEstimateMs: ses.estimateReadMs(text),
          graceEndsAt: 0,
        })

      /* Sessiz mod: ses yok, pencereyi hoca kapatır */
      if (s.mode === 'quiz') {
        startedAtRef.current = Date.now()
        void open(startedAtRef.current)
        return
      }

      speakRef.current = speak(text, voice, {
        onStart: () => {
          // Pencere TAM BURADA açılır — speak() çağrısıyla ses arasında
          // ~1 sn gecikme var, hız bonusu oradan bozulurdu.
          startedAtRef.current = Date.now()
          void open(startedAtRef.current)
        },
        onBoundary: setHighlight,
        onEnd: async () => {
          const dur = Date.now() - startedAtRef.current
          durationRef.current = dur
          const endsAt = Date.now() + ses.NOTE_GRACE_MS
          await ses.saveSession({
            ...sessionRef.current!,
            phase: 'grace',
            blockDurationMs: dur,
            graceEndsAt: endsAt,
          })
          // Cümlenin sonundaki hatayı duyup NOT YAZMAK zaman alır —
          // 1.0'daki 1,5 sn'lik zil toleransı burada yetmiyor.
          graceTimer.current = window.setTimeout(closeBlock, ses.NOTE_GRACE_MS)
        },
        onError: (m) => toast(m, 'error'),
      })
    },
    [voice, closeBlock, toast],
  )

  /* ── Gelen notları anında doğrula + puanla ── */
  useEffect(() => {
    const s = sessionRef.current
    if (!s || s.phase === 'lobby') return

    const pending = notes.filter((n) => n.status === 'pending' && !seenNotes.current.has(n.id))
    if (!pending.length) return

    for (const note of pending) {
      seenNotes.current.add(note.id)
      queue.current = queue.current.then(async () => {
        const cur = sessionRef.current
        if (!cur) return
        try {
          await ses.resolveNote(cur, note, partsRef.current)
        } catch (err) {
          console.error('[amfi] not işlenemedi:', err)
          seenNotes.current.delete(note.id) // sonraki turda tekrar denensin
        }
      })
    }
  }, [notes])

  /* ── Tolerans geri sayımı ── */
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

  /* ── Kontroller ── */
  const startLesson = () => {
    if (!participants.length) {
      toast('Henüz kimse katılmadı.', 'error')
      return
    }
    // İlk speak() kullanıcı tıklamasının içinde olmalı — tarayıcı ses izni
    runSegment(0)
  }

  const nextSegment = () => {
    const s = sessionRef.current
    if (!s) return
    const next = s.currentBlockIndex + 1
    if (next >= s.segments.length) {
      void ses.saveSession({ ...s, phase: 'ended', graceEndsAt: 0 })
      return
    }
    runSegment(next)
  }

  const endNow = async () => {
    if (!window.confirm('Dersi bitirmek istediğine emin misin?')) return
    speakRef.current?.cancel()
    if (graceTimer.current) clearTimeout(graceTimer.current)
    const s = sessionRef.current
    if (s) await ses.saveSession({ ...s, phase: 'ended', graceEndsAt: 0 })
  }

  /* ── QR ── */
  useEffect(() => {
    if (!session?.code) return
    const url = `${window.location.origin}/amfi/${session.code}`
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#16130F', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [session?.code])

  /* ── Türetilenler ── */
  const currentText = session?.segments[session.currentBlockIndex] ?? ''
  const currentWrong = useMemo(
    () => session?.wrongBlocks.find((w) => w.blockIndex === session.currentBlockIndex) ?? null,
    [session?.wrongBlocks, session?.currentBlockIndex],
  )
  const notesThisBlock = useMemo(
    () => notes.filter((n) => n.blockIndex === session?.currentBlockIndex),
    [notes, session?.currentBlockIndex],
  )
  const validCount = notesThisBlock.filter((n) => n.status === 'valid').length

  if (loading) return <Loader label="Oturum yükleniyor…" />

  if (!session)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">OTURUM BULUNAMADI</p>
          <p className="mt-3 text-sm text-ink-muted">
            Bu ders için açık bir Amfi 2.0 oturumu yok. Yeniden hazırlaman gerekiyor.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button3D onClick={() => nav(`/hoca/amfi-setup/${lessonId}`)}>Oyunu Hazırla</Button3D>
            <Button3D tone="ghost" onClick={() => nav('/hoca')}>
              Panele Dön
            </Button3D>
          </div>
        </div>
      </div>
    )

  const joinUrl = `${window.location.origin}/amfi/${session.code}`

  /* ══════════════ LOBİ ══════════════ */
  if (session.phase === 'lobby') {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <p className="label">AMFİ 2.0 OTURUMU · NOT YAZMA</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {session.lessonTitle}
        </h1>
        <div className="rule mt-7" />

        {session.mode === 'capture' && voiceError && (
          <div className="mt-6 rounded-sm border-l-2 border-mark bg-mark-soft p-4 text-sm leading-relaxed text-ink">
            <strong className="font-semibold">Ses sorunu:</strong> {voiceError} Sessiz modda
            oynatmak istersen oyunu yeniden hazırlayıp “Sessiz Mod”u seç.
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="file-card p-7 text-center">
            <p className="label">KATILIM KODU</p>
            <p className="mt-3 font-mono text-5xl font-bold tracking-[0.18em] text-ink">
              {session.code}
            </p>
            {qr && (
              <img
                src={qr}
                alt={`Katılım QR kodu: ${joinUrl}`}
                className="mx-auto mt-6 w-56 rounded-sm border border-paper-edge"
              />
            )}
            <p className="mt-5 break-all font-mono text-[11px] text-ink-muted">{joinUrl}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              Öğrenciler QR'ı okutur ya da bu kodu girer. Hesap açmaları gerekmez.
            </p>
          </div>

          <div className="file-card flex flex-col p-7">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-ink">Katılanlar</h2>
              <span className="font-display text-3xl font-bold text-ink">
                {participants.length}
              </span>
            </div>
            <div className="rule my-5" />

            {participants.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">Katılım bekleniyor…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <AnimatePresence initial={false}>
                  {participants.map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="label-chip border-paper-edge bg-paper-deep"
                    >
                      {p.name}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge">
              <div className="bg-paper-card p-3 text-center">
                <p className="font-display text-xl font-bold text-ink">{session.segments.length}</p>
                <p className="label mt-0.5">PARÇA</p>
              </div>
              <div className="bg-paper-card p-3 text-center">
                <p className="font-display text-xl font-bold text-mark">
                  {session.wrongBlocks.length}
                </p>
                <p className="label mt-0.5">GİZLİ HATA</p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <Button3D
                size="lg"
                onClick={startLesson}
                disabled={session.mode === 'capture' && !!voiceError}
              >
                Dersi Başlat
              </Button3D>
              <Button3D size="lg" tone="ghost" onClick={() => nav('/hoca')}>
                Vazgeç
              </Button3D>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════ BİTİŞ ══════════════ */
  if (session.phase === 'ended') {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-5 py-12 sm:px-6">
        <div className="file-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">OTURUM RAPORU</span>
            <span className="label ml-auto">{session.code}</span>
          </div>

          <div className="p-8 text-center">
            <span className="stamp-verify animate-stamp">DERS BİTTİ</span>
            <h1 className="mt-6 font-display text-3xl font-bold text-ink">
              {session.lessonTitle}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">{participants.length} katılımcı</p>
          </div>

          <div className="border-t border-paper-edge">
            {participants.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-4 border-b border-paper-edge px-6 py-4 last:border-0"
              >
                <span className={cx('w-8 font-mono font-bold', i < 3 ? 'text-ink' : 'text-ink-faint')}>
                  {i + 1}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-[11px] font-bold text-ink">
                  {initials(p.name)}
                </div>
                <p className="flex-1 truncate font-semibold text-ink">{p.name}</p>
                <span className="font-mono text-sm text-verify">{p.hits} doğru</span>
                <span className="font-mono text-sm text-mark">{p.falseAlarms} yanlış</span>
                <span className="w-16 text-right font-display text-lg font-bold text-ink">
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        <RatingSummary ratings={ratings} />

        <div className="flex justify-center">
          <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
        </div>
      </div>
    )
  }

  /* ══════════════ ANLATIM ══════════════ */
  const revealing = session.phase === 'reveal'
  const windowOpen = session.phase === 'speaking' || session.phase === 'grace'
  const isLast = session.currentBlockIndex + 1 >= session.segments.length

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      {/* Künye */}
      <div className="file-card mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <div>
          <p className="truncate text-sm font-semibold text-ink">{session.lessonTitle}</p>
          <p className="label mt-0.5">KOD {session.code}</p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="font-mono text-sm font-medium text-ink">
              {String(session.currentBlockIndex + 1).padStart(2, '0')}
              <span className="text-ink-faint">
                /{String(session.segments.length).padStart(2, '0')}
              </span>
            </p>
            <p className="label mt-0.5">PARÇA</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-ink">
              {participants.length}
            </p>
            <p className="label mt-1">KATILIMCI</p>
          </div>
          <div className="text-right">
            <p
              className={cx(
                'font-display text-xl font-bold leading-none',
                windowOpen ? 'text-mark' : 'text-ink-faint',
              )}
            >
              {notesThisBlock.length}
            </p>
            <p className="label mt-1">NOT</p>
          </div>
        </div>
      </div>

      {/* Durum şeridi */}
      <div
        className={cx(
          'mb-5 flex items-center gap-3 rounded-sm border-l-4 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em]',
          session.phase === 'speaking' && 'border-l-mark bg-mark-soft text-mark',
          session.phase === 'grace' && 'border-l-flag bg-flag-soft text-flag',
          revealing && 'border-l-ink bg-paper-deep text-ink',
        )}
      >
        <span>
          {session.phase === 'speaking' &&
            (session.mode === 'quiz' ? '● PENCERE AÇIK — NOT ALINIYOR' : '● OKUNUYOR — NOT ALINIYOR')}
          {session.phase === 'grace' && '● SON SANİYELER'}
          {revealing && '■ BÖLÜM KAPANDI'}
        </span>
        {session.phase === 'grace' && graceLeft > 0 && (
          <span className="ml-auto text-base">{graceLeft} sn</span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Metin — amfi arkasından okunacak kadar büyük */}
          <div
            className={cx(
              'file-card-tabbed p-8 sm:p-10',
              revealing && currentWrong && 'border-l-mark',
              revealing && !currentWrong && 'border-l-verify',
              !revealing && 'border-l-ink',
            )}
          >
            <p className="label mb-5">
              PARÇA {String(session.currentBlockIndex + 1).padStart(2, '0')}
            </p>

            <p
              className={cx(
                'font-display text-[26px] leading-[1.45] text-ink sm:text-[34px]',
                revealing && currentWrong && 'mark-underline',
              )}
            >
              {highlight >= 0 && !revealing ? (
                <>
                  <span>{currentText.slice(0, highlight)}</span>
                  <span className="bg-flag-soft">
                    {currentText.slice(highlight).split(' ')[0]}
                  </span>
                  <span className="text-ink-faint">
                    {currentText.slice(highlight).split(' ').slice(1).join(' ')
                      ? ' ' + currentText.slice(highlight).split(' ').slice(1).join(' ')
                      : ''}
                  </span>
                </>
              ) : (
                currentText
              )}
            </p>

            {revealing && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ease: EASE }}
                className="mt-8"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span className={cx('animate-stamp', currentWrong ? 'stamp-mark' : 'stamp-verify')}>
                    {currentWrong ? 'TUZAKTI' : 'DOĞRU BİLGİYDİ'}
                  </span>
                  <span className="font-mono text-sm text-ink-muted">
                    {currentWrong
                      ? `${validCount} / ${participants.length} kişi doğru yazdı`
                      : `${notesThisBlock.length} kişi boşa yazdı`}
                  </span>
                </div>

                {currentWrong && (
                  <p className="marginalia mt-5 text-base">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                      DOĞRUSU
                    </span>
                    <br />
                    {currentWrong.correction || currentWrong.explanation}
                  </p>
                )}
              </motion.div>
            )}
          </div>

          {/* Hocaya özel: bu parçada yakalanacak yanlış */}
          {currentWrong && !revealing && (
            <div className="file-card border-l-4 border-l-flag p-5">
              <p className="label font-bold text-flag">YALNIZCA SEN GÖRÜYORSUN</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{currentWrong.explanation}</p>
            </div>
          )}

          {/* Gelen notlar */}
          <div className="file-card p-6">
            <div className="flex items-center justify-between">
              <p className="label font-bold">{notesThisBlock.length} NOT GELDİ</p>
              <span className="label-chip border-verify-edge bg-verify-soft text-verify">
                {validCount} DOĞRU
              </span>
            </div>

            {notesThisBlock.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">Henüz not yazılmadı</p>
            ) : (
              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {[...notesThisBlock]
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map((note) => {
                      const writer = participants.find((p) => p.id === note.participantId)
                      return (
                        <motion.div
                          key={note.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cx(
                            'rounded-sm border-l-4 px-3 py-2.5',
                            note.status === 'valid'
                              ? 'border-l-verify bg-verify-soft'
                              : note.status === 'invalid'
                                ? 'border-l-mark bg-mark-soft'
                                : 'border-l-paper-edge bg-paper-deep',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-ink-muted">
                                {writer?.name ?? '—'}
                              </p>
                              <p className="mt-1 text-sm text-ink">{note.text}</p>
                              {note.geminiFeedback && (
                                <p className="mt-1 text-xs italic text-ink-faint">
                                  {note.geminiFeedback}
                                </p>
                              )}
                            </div>
                            <span
                              className={cx(
                                'shrink-0 font-mono text-sm font-bold',
                                note.status === 'valid'
                                  ? 'text-verify'
                                  : note.status === 'invalid'
                                    ? 'text-mark'
                                    : 'text-ink-muted',
                              )}
                            >
                              {note.status === 'valid'
                                ? '✓'
                                : note.status === 'invalid'
                                  ? '✗'
                                  : '⏳'}
                            </span>
                          </div>
                        </motion.div>
                      )
                    })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Canlı sıralama */}
        <div className="file-card h-fit p-6">
          <p className="label font-bold">CANLI SIRALAMA</p>
          <div className="mt-4 space-y-1.5">
            {participants.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-muted">Katılımcı yok</p>
            )}
            {participants.slice(0, 12).map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-sm bg-paper-deep px-3 py-2"
              >
                <span className="w-5 font-mono text-sm font-bold text-ink-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {p.name}
                </span>
                <span className="font-display text-lg font-bold text-ink">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kontroller */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {revealing ? (
          <Button3D size="xl" onClick={nextSegment}>
            {isLast ? 'Dersi Bitir' : 'Sonraki Parça'}
          </Button3D>
        ) : session.mode === 'quiz' ? (
          <Button3D size="xl" tone="danger" onClick={closeBlock}>
            Bölümü Kapat
          </Button3D>
        ) : (
          <p className="text-sm text-ink-muted">
            Okuma bitince bölüm {Math.round(ses.NOTE_GRACE_MS / 1000)} sn tolerans sonrası
            kendiliğinden kapanır…
          </p>
        )}
        <Button3D tone="ghost" onClick={endNow}>
          Dersi Sonlandır
        </Button3D>
      </div>
    </div>
  )
}
