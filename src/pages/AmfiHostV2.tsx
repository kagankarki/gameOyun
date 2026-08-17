/**
 * Amfi — HOCA / PROJEKSİYON EKRANI
 * Yol: /hoca/amfi-host-v2/:lessonId?sessionId=...
 *
 * Metin PARÇALARA BÖLÜNMEZ: tek seferde, kesintisiz okunur. Öğrenci
 * istediği an "HATA VAR"a basar ve yalnızca bir zaman damgası gönderir.
 *
 * "Hangi hataya bastı?" sorusunu bu ekran cevaplar: TTS okurken her
 * kelimede `onboundary` tetikleniyor ve metindeki karakter konumunu
 * veriyor. Bu (an, konum) çiftlerini burada biriktirip, basış anını
 * geriye dönük metindeki yere çeviriyoruz. Çizelge Firestore'a yazılmaz —
 * saniyede birkaç kelime × 150 öğrenci gereksiz yazma olurdu ve zaten
 * puanlamayı da bu cihaz yapıyor.
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
import type {
  Catch,
  LiveSession,
  Participant,
  SessionRating,
  SessionSecret,
} from '@/lib/types'
import { cx, initials } from '@/lib/utils'
import { EASE } from '@/lib/motion'

/** Perdede metnin okunan kısmından ne kadarını gösterelim */
const GORUNEN_ONCE = 260
const GORUNEN_SONRA = 420

export default function AmfiHostV2() {
  const { lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [session, setSession] = useState<LiveSession | null>(null)
  const [secret, setSecret] = useState<SessionSecret | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [catches, setCatches] = useState<Catch[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [qr, setQr] = useState('')
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [charIndex, setCharIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  /* Kapanışlarda bayatlamasın diye canlı referanslar */
  const sessionRef = useRef<LiveSession | null>(null)
  const secretRef = useRef<SessionSecret | null>(null)
  const partsRef = useRef<Participant[]>([])
  const catchesRef = useRef<Catch[]>([])
  const speakRef = useRef<{ cancel: () => void } | null>(null)

  /** (an, karakter) çizelgesi — basışları metne eşlemek için */
  const marksRef = useRef<ses.SpeechMark[]>([])
  /** Bir kez işlenen basış tekrar puanlanmasın */
  const seen = useRef(new Set<string>())
  /** Cevabı bir kez notlansın */
  const graded = useRef(new Set<string>())
  /** Sırayla işle — paralel giderse aynı öğrencinin puanı ezilir */
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => void (sessionRef.current = session), [session])
  useEffect(() => void (secretRef.current = secret), [secret])
  useEffect(() => void (partsRef.current = participants), [participants])
  useEffect(() => void (catchesRef.current = catches), [catches])

  /* ── Oturumu bul ── */
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
    return ses.watchSession(sessionId, (s) => {
      setSession(s)
      sessionRef.current = s
      setLoading(false)
    })
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const a = ses.watchParticipants(sessionId, setParticipants)
    const b = ses.watchCatches(sessionId, setCatches)
    const c = ses.watchRatings(sessionId, setRatings)
    const d = ses.watchSessionSecret(sessionId, setSecret)
    return () => {
      a()
      b()
      c()
      d()
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
      else
        setVoiceError(
          'Sistemde Türkçe ses paketi yok. Windows → Ayarlar → Zaman ve Dil → Konuşma ' +
            'bölümünden Türkçe sesi yükleyip tarayıcıyı yeniden başlat.',
        )
    })
  }, [])

  /* ── Sayfadan ayrılırken sesi kes ── */
  useEffect(
    () => () => {
      speakRef.current?.cancel()
      cancelSpeech()
    },
    [],
  )

  /* ── Okumayı başlat ── */
  const basla = useCallback(() => {
    const s = sessionRef.current
    const sec = secretRef.current
    if (!s || !sec?.script) return
    if (!participants.length) {
      toast('Henüz kimse katılmadı.', 'error')
      return
    }

    marksRef.current = []
    setCharIndex(0)

    speakRef.current = speak(sec.script, voice, {
      onStart: () => {
        // Pencere TAM BURADA açılır — speak() ile ses arasında ~1 sn var
        const t = Date.now()
        marksRef.current = [{ t, i: 0 }]
        void ses.saveSession({
          ...sessionRef.current!,
          phase: 'speaking',
          blockStartedAt: t,
          blockDurationMs: 0,
        })
      },
      onBoundary: (i) => {
        marksRef.current.push({ t: Date.now(), i })
        setCharIndex(i)
      },
      onEnd: async () => {
        const s2 = sessionRef.current
        if (!s2) return
        // Okuma bitti ama son hatanın penceresi hâlâ açık olabilir —
        // basışlar işlensin diye biraz bekleyip bitiriyoruz.
        await ses.saveSession({
          ...s2,
          phase: 'grace',
          blockDurationMs: Date.now() - s2.blockStartedAt,
        })
      },
      onError: (m) => toast(m, 'error'),
    })
  }, [participants.length, voice, toast])

  /* ── Gelen basışları çöz ── */
  useEffect(() => {
    const s = sessionRef.current
    if (!s || s.phase === 'lobby') return
    const sec = secretRef.current
    if (!sec) return

    const bekleyen = catches.filter((c) => c.status === 'pending' && !seen.current.has(c.id))
    for (const c of bekleyen) {
      seen.current.add(c.id)
      queue.current = queue.current.then(async () => {
        const gizli = secretRef.current
        if (!gizli) return
        try {
          // Aynı öğrenci aynı hataya iki kez puan almasın
          const oncekiler = new Set(
            catchesRef.current
              .filter(
                (x) =>
                  x.participantId === c.participantId &&
                  x.status === 'hit' &&
                  x.wrongIndex !== undefined,
              )
              .map((x) => x.wrongIndex as number),
          )
          await ses.resolveCatch(
            c,
            marksRef.current,
            gizli.wrongBlocks,
            partsRef.current,
            oncekiler,
          )
        } catch (err) {
          console.error('[amfi] basış çözülemedi:', err)
          seen.current.delete(c.id)
        }
      })
    }
  }, [catches])

  /* ── Gelen cevapları notla ── */
  useEffect(() => {
    const sec = secretRef.current
    if (!sec) return

    const cevaplilar = catches.filter(
      (c) =>
        c.status === 'hit' &&
        c.answerIndex !== undefined &&
        c.answerCorrect === undefined &&
        !graded.current.has(c.id),
    )
    for (const c of cevaplilar) {
      graded.current.add(c.id)
      queue.current = queue.current.then(async () => {
        const gizli = secretRef.current
        if (!gizli) return
        try {
          await ses.gradeAnswer(c, gizli.wrongBlocks, partsRef.current)
        } catch (err) {
          console.error('[amfi] cevap notlanamadı:', err)
          graded.current.delete(c.id)
        }
      })
    }
  }, [catches])

  const bitir = async () => {
    if (!window.confirm('Dersi bitirmek istediğine emin misin?')) return
    speakRef.current?.cancel()
    cancelSpeech()
    const s = sessionRef.current
    if (!s) return
    await queue.current
    await ses.markMissedWrongs(s.wrongCount, partsRef.current, catchesRef.current)
    await ses.saveSession({ ...sessionRef.current!, phase: 'ended' })
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
  const script = secret?.script ?? ''
  const wrongs = secret?.wrongBlocks ?? []

  /** Şu an okunan yerin yakınındaki hata (yalnızca hoca görür) */
  const yakinHata = useMemo(
    () => wrongs.find((w) => charIndex >= w.start - 40 && charIndex <= w.end + 120) ?? null,
    [wrongs, charIndex],
  )

  const hits = catches.filter((c) => c.status === 'hit')
  const yakalananHatalar = new Set(hits.map((c) => c.wrongIndex))

  if (loading) return <Loader label="Oturum yükleniyor…" />

  if (!session)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">OTURUM BULUNAMADI</p>
          <p className="mt-3 text-sm text-ink-muted">
            Bu ders için açık bir amfi oturumu yok.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
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
        <p className="label">AMFİ OTURUMU · KESİNTİSİZ OKUMA</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {session.lessonTitle}
        </h1>
        <div className="rule mt-7" />

        {voiceError && (
          <div className="mt-6 rounded-sm border-l-2 border-mark bg-mark-soft p-4 text-sm leading-relaxed text-ink">
            <strong className="font-semibold">Ses sorunu:</strong> {voiceError}
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

            <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge">
              <div className="bg-paper-card p-3 text-center">
                <p className="font-display text-xl font-bold text-mark">{session.wrongCount}</p>
                <p className="label mt-0.5">GİZLİ HATA</p>
              </div>
              <div className="bg-paper-card p-3 text-center">
                <p className="font-display text-xl font-bold text-verify">
                  {wrongs.filter((w) => w.followUp).length}
                </p>
                <p className="label mt-0.5">EK SORU</p>
              </div>
              <div className="bg-paper-card p-3 text-center">
                <p className="font-display text-xl font-bold text-ink">
                  ~{Math.max(1, Math.round(session.blockEstimateMs / 60000))}
                </p>
                <p className="label mt-0.5">DAKİKA</p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <Button3D size="lg" onClick={basla} disabled={!!voiceError || !script}>
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
                <span className="font-mono text-sm text-verify">{p.hits} yakaladı</span>
                <span className="font-mono text-sm text-mark">{p.falseAlarms} boş</span>
                <span className="w-16 text-right font-display text-lg font-bold text-ink">
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        <RatingSummary ratings={ratings} />

        <div className="flex flex-wrap justify-center gap-3">
          <Button3D onClick={() => nav(`/hoca/sonuclar/${lessonId}`)}>Ayrıntılı Rapor</Button3D>
          <Button3D tone="ghost" onClick={() => nav('/hoca')}>
            Panele Dön
          </Button3D>
        </div>
      </div>
    )
  }

  /* ══════════════ OKUMA ══════════════ */
  const okunan = script.slice(Math.max(0, charIndex - GORUNEN_ONCE), charIndex)
  const suAn = script.slice(charIndex).split(' ')[0] ?? ''
  const gelecek = script.slice(charIndex + suAn.length, charIndex + GORUNEN_SONRA)
  const ilerleme = session.scriptLength ? Math.round((charIndex / session.scriptLength) * 100) : 0
  const bitiyor = session.phase === 'grace'

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      {/* Künye */}
      <div className="file-card mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{session.lessonTitle}</p>
          <p className="label mt-0.5">KOD {session.code}</p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-ink">
              {participants.length}
            </p>
            <p className="label mt-1">KATILIMCI</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-verify">
              {yakalananHatalar.size}
              <span className="text-ink-faint">/{session.wrongCount}</span>
            </p>
            <p className="label mt-1">YAKALANAN</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold leading-none text-mark">{hits.length}</p>
            <p className="label mt-1">BASIŞ</p>
          </div>
        </div>
      </div>

      {/* İlerleme */}
      <div className="mb-5">
        <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
          <div
            className={cx('h-full transition-all duration-300', bitiyor ? 'bg-ink' : 'bg-mark')}
            style={{ width: `${ilerleme}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
          {bitiyor ? '■ OKUMA BİTTİ — SON BASIŞLAR BEKLENİYOR' : `● OKUNUYOR · %${ilerleme}`}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Metin — okunan kelime vurgulu */}
          <div className="file-card-tabbed border-l-ink p-8 sm:p-10">
            <p className="font-display text-[26px] leading-[1.5] sm:text-[32px]">
              <span className="text-ink-faint">{okunan}</span>
              <span className="bg-flag-soft font-semibold text-ink">{suAn}</span>
              <span className="text-ink">{gelecek}</span>
            </p>
          </div>

          {/* Yalnızca hocanın gördüğü uyarı */}
          <AnimatePresence>
            {yakinHata && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ ease: EASE }}
                className="file-card border-l-4 border-l-flag p-5"
              >
                <p className="label font-bold text-flag">ŞU AN OKUNAN HATA · YALNIZCA SEN GÖRÜYORSUN</p>
                <p className="mt-2 font-serif text-base text-mark">“{yakinHata.text}”</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{yakinHata.explanation}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Basış akışı */}
          <div className="file-card p-6">
            <p className="label font-bold">SON BASIŞLAR</p>
            {catches.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">Henüz kimse basmadı</p>
            ) : (
              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {[...catches]
                    .sort((a, b) => b.flaggedAt - a.flaggedAt)
                    .slice(0, 40)
                    .map((c) => {
                      const kim = participants.find((p) => p.id === c.participantId)
                      const w =
                        c.wrongIndex !== undefined ? wrongs[c.wrongIndex] : undefined
                      return (
                        <motion.div
                          key={c.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cx(
                            'flex items-center gap-3 rounded-sm border-l-4 px-3 py-2',
                            c.status === 'hit'
                              ? 'border-l-verify bg-verify-soft'
                              : c.status === 'miss'
                                ? 'border-l-mark bg-mark-soft'
                                : 'border-l-paper-edge bg-paper-deep',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                            {kim?.name ?? '—'}
                          </span>
                          <span className="truncate font-mono text-[11px] text-ink-muted">
                            {c.status === 'hit'
                              ? `“${w?.text ?? '?'}”`
                              : c.status === 'miss'
                                ? 'boşa bastı'
                                : 'işleniyor…'}
                          </span>
                          {c.answerCorrect !== undefined && (
                            <span
                              className={cx(
                                'font-mono text-[11px] font-bold',
                                c.answerCorrect ? 'text-verify' : 'text-ink-faint',
                              )}
                            >
                              {c.answerCorrect ? `+${c.bonus}` : 'soru ✗'}
                            </span>
                          )}
                          <span
                            className={cx(
                              'w-12 shrink-0 text-right font-display font-bold',
                              c.points > 0 ? 'text-verify' : 'text-mark',
                            )}
                          >
                            {c.points > 0 ? `+${c.points}` : c.points}
                          </span>
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
            {participants.slice(0, 12).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 rounded-sm bg-paper-deep px-3 py-2">
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

      <div className="mt-8 flex justify-center">
        <Button3D size="xl" tone="danger" onClick={bitir}>
          Dersi Bitir
        </Button3D>
      </div>
    </div>
  )
}
