import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { RatingSummary } from '@/components/Rating'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import {
  cancelSpeech,
  getTurkishVoice,
  isElevenLabsConfigured,
  isSpeechSupported,
  speak,
} from '@/lib/speech'
import type { Buzz, Lesson, LiveSession, Participant, SessionRating } from '@/lib/types'
import { cx, initials } from '@/lib/utils'
import { EASE } from '@/lib/motion'

export default function AmfiHost() {
  const { lessonId } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [buzzes, setBuzzes] = useState<Buzz[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [qr, setQr] = useState<string>('')
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const [outcomes, setOutcomes] = useState<ses.BlockOutcome[]>([])
  const [loading, setLoading] = useState(true)

  // Kapanışlarda bayatlamasın diye canlı referanslar
  const sessionRef = useRef<LiveSession | null>(null)
  const partsRef = useRef<Participant[]>([])
  const buzzesRef = useRef<Buzz[]>([])
  const speakRef = useRef<{ cancel: () => void } | null>(null)
  const startedAtRef = useRef(0)
  /** Bölümün okunma süresi — hız bonusu buna göre. Oturumun ağdan geri
   *  dönmesini beklemeyelim diye ayrıca burada tutuluyor. */
  const durationRef = useRef(0)
  const graceTimer = useRef<number | undefined>(undefined)

  useEffect(() => void (sessionRef.current = session), [session])
  useEffect(() => void (partsRef.current = participants), [participants])
  useEffect(() => void (buzzesRef.current = buzzes), [buzzes])

  /* ── Ders + oturum kurulumu ──
     Oturum SADECE BİR KEZ açılır. Demo modda watchAuth her depo yazımında
     yeni bir `user` nesnesi ürettiği için, bağımlılığa `user` koymak
     sonsuz döngü yaratıyordu: yeni oturum → yazma → bildirim → yeni user
     → yeni oturum. Bu yüzden hem uid'ye bağlanıyoruz hem de ref ile
     tek sefere kilitliyoruz. */
  const creatingRef = useRef<string | null>(null)
  const uidValue = user?.uid
  const userName = user?.name

  useEffect(() => {
    if (!lessonId || !uidValue) return
    const key = `${lessonId}|${uidValue}`
    if (creatingRef.current === key) return
    creatingRef.current = key

    let alive = true
    ;(async () => {
      try {
        const l = await api.getLesson(lessonId)
        if (!alive) return
        setLesson(l)
        if (!l) {
          setLoading(false)
          return
        }
        // Yenilemede yeni kod üretme — açık oturum varsa onu sürdür
        const s = await ses.resumeOrCreateSession(l, uidValue, userName ?? 'Öğretim Üyesi')
        if (!alive) return
        setSession(s)
        setLoading(false)
      } catch (err) {
        console.error(err)
        toast('Oturum başlatılırken hata oluştu: ' + (err as Error).message, 'error')
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      // StrictMode ilk turu iptal eder; kilidi bırak ki ikinci tur
      // oturumu gerçekten açabilsin. Bırakmazsak sayfa "hazırlanıyor"da kilitlenir.
      if (creatingRef.current === key) creatingRef.current = null
    }
  }, [lessonId, uidValue, userName])

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

  /* ── Canlı dinleyiciler ── */
  useEffect(() => {
    if (!session) return
    const a = ses.watchParticipants(session.id, setParticipants)
    const b = ses.watchBuzzes(session.id, setBuzzes)
    const c = ses.watchRatings(session.id, setRatings)
    return () => {
      a()
      b()
      c()
    }
  }, [session?.id])

  /* ── Oturumu dinle (kendi yazdığımız güncellemeler de buradan döner) ── */
  useEffect(() => {
    if (!session?.id) return
    return ses.watchSession(session.id, (s) => s && setSession(s))
  }, [session?.id])

  /* ── QR ── */
  useEffect(() => {
    if (!session) return
    const url = `${window.location.origin}/amfi/${session.code}`
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      color: { dark: '#16130F', light: '#FFFFFF' },
    })
      .then(setQr)
      .catch(() => setQr(''))
  }, [session?.code])

  /* ── Sayfadan ayrılırken sesi kes ── */
  useEffect(
    () => () => {
      speakRef.current?.cancel()
      cancelSpeech()
      if (graceTimer.current) clearTimeout(graceTimer.current)
    },
    [],
  )

  const blocks = lesson?.blocks ?? []
  const current = session ? blocks[session.currentBlockIndex] : undefined

  /** Bu bölümde şu ana kadar kaç kişi bastı */
  const buzzCount = useMemo(() => {
    if (!session) return 0
    const ids = new Set(
      buzzes.filter((b) => b.blockIndex === session.currentBlockIndex).map((b) => b.participantId),
    )
    return ids.size
  }, [buzzes, session?.currentBlockIndex])

  /* ── Bölümü kapat ve puanla ── */
  const closeBlock = useCallback(async () => {
    const s = sessionRef.current
    if (!s || !lesson) return
    const block = lesson.blocks[s.currentBlockIndex]
    if (!block) return

    // Süreyi ref'ten alıyoruz: oturumun ağdan geri dönmesini beklemek
    // Firebase'de hız bonusunu 0'a düşürebilirdi.
    const scored = { ...s, blockDurationMs: durationRef.current || s.blockDurationMs }
    const res = await ses.scoreBlock(scored, block, partsRef.current, buzzesRef.current)
    setOutcomes(res)
    await ses.saveSession({ ...scored, phase: 'reveal' })
  }, [lesson])

  /* ── Bölümü seslendir ── */
  const runBlock = useCallback(
    (index: number) => {
      const s = sessionRef.current
      if (!s || !lesson) return
      const block = lesson.blocks[index]
      if (!block) return

      setHighlight(-1)
      setOutcomes([])

      speakRef.current = speak(block.text, voice, {
        onStart: async () => {
          startedAtRef.current = Date.now()
          // Zil penceresi TAM BURADA açılır — speak() çağrısında değil,
          // arada ~1 sn başlama gecikmesi olduğu için.
          await ses.saveSession({
            ...sessionRef.current!,
            phase: 'speaking',
            currentBlockIndex: index,
            blockStartedAt: startedAtRef.current,
            blockDurationMs: 0,
          })
        },
        onBoundary: setHighlight,
        onEnd: async () => {
          const dur = Date.now() - startedAtRef.current
          durationRef.current = dur
          await ses.saveSession({
            ...sessionRef.current!,
            phase: 'grace',
            blockDurationMs: dur,
          })
          // Cümle sonundaki hatayı duyup basana kadar cümle biter — tolerans şart
          graceTimer.current = window.setTimeout(closeBlock, ses.GRACE_MS)
        },
        onError: (m) => toast(m, 'error'),
      })
    },
    [lesson, voice, closeBlock, toast],
  )

  const start = () => {
    if (!participants.length) {
      toast('Henüz kimse katılmadı.', 'error')
      return
    }
    runBlock(0) // ilk speak kullanıcı tıklamasının içinde — tarayıcı ses izni için şart
  }

  const nextBlock = () => {
    const s = sessionRef.current
    if (!s || !lesson) return
    const next = s.currentBlockIndex + 1
    if (next >= lesson.blocks.length) {
      ses.saveSession({ ...s, phase: 'ended' })
      return
    }
    runBlock(next)
  }

  const endNow = async () => {
    speakRef.current?.cancel()
    if (graceTimer.current) clearTimeout(graceTimer.current)
    const s = sessionRef.current
    if (s) await ses.saveSession({ ...s, phase: 'ended' })
  }

  if (loading) return <Loader label="Oturum hazırlanıyor…" />
  if (!lesson || !session)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">OTURUM AÇILAMADI</p>
          <p className="mt-3 text-sm text-ink-muted">Ders bulunamadı.</p>
          <div className="mt-6">
            <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )

  const joinUrl = `${window.location.origin}/amfi/${session.code}`

  /* ══════════════ LOBİ ══════════════ */
  if (session.phase === 'lobby') {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">AMFİ OTURUMU</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {lesson.title}
            </h1>
          </div>
          {isElevenLabsConfigured() && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ElevenLabs Doğal AI Seslendirme Aktif
            </div>
          )}
        </div>
        <div className="rule mt-7" />

        {voiceError && (
          <div className="mt-6 rounded-sm border-l-2 border-mark bg-mark-soft p-4 text-sm leading-relaxed text-ink">
            <strong className="font-semibold">Ses sorunu:</strong> {voiceError}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Katılım */}
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

          {/* Katılanlar */}
          <div className="file-card flex flex-col p-7">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-ink">Katılanlar</h2>
              <span className="font-display text-3xl font-bold text-ink">
                {participants.length}
              </span>
            </div>
            <div className="rule my-5" />

            {participants.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                Katılım bekleniyor…
              </p>
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

            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <Button3D size="lg" onClick={start} disabled={!!voiceError}>
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
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6">
        <div className="file-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">OTURUM RAPORU</span>
            <span className="label ml-auto">{session.code}</span>
          </div>

          <div className="p-8 text-center">
            <span className="stamp-verify animate-stamp">DERS BİTTİ</span>
            <h1 className="mt-6 font-display text-3xl font-bold text-ink">{lesson.title}</h1>
            <p className="mt-2 text-sm text-ink-muted">{participants.length} katılımcı</p>
          </div>

          <div className="border-t border-paper-edge">
            {participants.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-4 border-b border-paper-edge px-6 py-4 last:border-0"
              >
                <span
                  className={cx(
                    'w-8 font-mono font-bold',
                    i < 3 ? 'text-ink' : 'text-ink-faint',
                  )}
                >
                  {i + 1}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-[11px] font-bold text-ink">
                  {initials(p.name)}
                </div>
                <p className="flex-1 truncate font-semibold text-ink">{p.name}</p>
                <span className="font-mono text-sm text-verify">{p.hits} yakaladı</span>
                <span className="font-mono text-sm text-mark">{p.falseAlarms} boş</span>
                <span className="w-16 text-right font-display text-lg font-bold text-ink">
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <RatingSummary ratings={ratings} />
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
        </div>
      </div>
    )
  }

  /* ══════════════ ANLATIM / SONUÇ ══════════════ */
  const isTrap = current?.isWrong
  const revealing = session.phase === 'reveal'
  const windowOpen = session.phase === 'speaking' || session.phase === 'grace'

  const caught = outcomes.filter((o) => o.kind === 'hit').length
  const fastest = [...outcomes]
    .filter((o) => o.kind === 'hit' && o.reactionMs !== undefined)
    .sort((a, b) => (a.reactionMs ?? 0) - (b.reactionMs ?? 0))
    .slice(0, 3)

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
      {/* Künye */}
      <div className="file-card mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <div>
          <p className="truncate text-sm font-semibold text-ink">{lesson.title}</p>
          <p className="label mt-0.5">KOD {session.code}</p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="font-mono text-sm font-medium text-ink">
              {String(session.currentBlockIndex + 1).padStart(2, '0')}
              <span className="text-ink-faint">/{String(blocks.length).padStart(2, '0')}</span>
            </p>
            <p className="label mt-0.5">BÖLÜM</p>
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
              {buzzCount}
            </p>
            <p className="label mt-1">BASAN</p>
          </div>
        </div>
      </div>

      {/* Durum şeridi */}
      <div
        className={cx(
          'mb-6 rounded-sm border-l-4 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em]',
          session.phase === 'speaking' && 'border-l-mark bg-mark-soft text-mark',
          session.phase === 'grace' && 'border-l-flag bg-flag-soft text-flag',
          revealing && 'border-l-ink bg-paper-deep text-ink',
        )}
      >
        {session.phase === 'speaking' && '● OKUNUYOR — ZİL AÇIK'}
        {session.phase === 'grace' && '● TOLERANS SÜRESİ — ZİL HÂLÂ AÇIK'}
        {revealing && '■ BÖLÜM KAPANDI'}
      </div>

      {/* Metin — amfi arkasından okunacak kadar büyük */}
      <div
        className={cx(
          'file-card-tabbed p-8 sm:p-12',
          revealing && isTrap && 'border-l-mark',
          revealing && !isTrap && 'border-l-verify',
          !revealing && 'border-l-ink',
        )}
      >
        <p className="label mb-6">BÖLÜM {String(session.currentBlockIndex + 1).padStart(2, '0')}</p>

        <p
          className={cx(
            'font-display text-[30px] leading-[1.45] text-ink sm:text-[40px]',
            revealing && isTrap && 'mark-underline',
          )}
        >
          {/* Okunan kelimeye kadar olan kısım koyu, kalanı soluk */}
          {highlight >= 0 && !revealing ? (
            <>
              <span>{current?.text.slice(0, highlight)}</span>
              <span className="bg-flag-soft">{current?.text.slice(highlight).split(' ')[0]}</span>
              <span className="text-ink-faint">
                {current?.text.slice(highlight).split(' ').slice(1).join(' ')
                  ? ' ' + current.text.slice(highlight).split(' ').slice(1).join(' ')
                  : ''}
              </span>
            </>
          ) : (
            current?.text
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
              <span className={cx('animate-stamp', isTrap ? 'stamp-mark' : 'stamp-verify')}>
                {isTrap ? 'TUZAKTI' : 'DOĞRU BİLGİYDİ'}
              </span>
              <span className="font-mono text-sm text-ink-muted">
                {isTrap
                  ? `${caught} / ${participants.length} kişi yakaladı`
                  : `${buzzCount} kişi boşa bastı`}
              </span>
            </div>

            {isTrap && current?.correction && (
              <p className="marginalia mt-5 text-base">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                  DOĞRUSU
                </span>
                <br />
                {current.correction}
              </p>
            )}

            {fastest.length > 0 && (
              <div className="mt-6">
                <p className="label mb-2">EN HIZLI</p>
                <div className="flex flex-wrap gap-2">
                  {fastest.map((o, i) => {
                    const p = participants.find((x) => x.id === o.participantId)
                    return (
                      <span key={o.participantId} className="label-chip border-verify-edge bg-verify-soft text-verify">
                        {i + 1}. {p?.name ?? '—'} · {((o.reactionMs ?? 0) / 1000).toFixed(1)} sn
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Kontroller */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {revealing ? (
          <Button3D size="xl" onClick={nextBlock}>
            {session.currentBlockIndex + 1 >= blocks.length ? 'Dersi Bitir' : 'Sonraki Bölüm'}
          </Button3D>
        ) : (
          <p className="text-sm text-ink-muted">Okuma bitince bölüm kendiliğinden kapanır…</p>
        )}
        <Button3D tone="ghost" onClick={endNow}>
          Oturumu Sonlandır
        </Button3D>
      </div>

      {/* Canlı sıralama */}
      <div className="mt-10">
        <p className="label mb-3">CANLI SIRALAMA</p>
        <div className="file-card divide-y divide-paper-edge overflow-hidden">
          {participants.slice(0, 8).map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3">
              <span className="w-6 font-mono text-sm font-bold text-ink-faint">{i + 1}</span>
              <p className="flex-1 truncate text-sm font-medium text-ink">{p.name}</p>
              <span className="font-display font-bold text-ink">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
