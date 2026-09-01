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
import QuizComparison from '@/components/QuizComparison'
import { RatingSummary } from '@/components/Rating'
import { useToast } from '@/components/Toast'
import VoiceSelector from '@/components/VoiceSelector'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import {
  cancelSpeech,
  getTurkishVoice,
  isElevenLabsConfigured,
  isSpeechSupported,
  playAudioFile,
  speak,
} from '@/lib/speech'
import { sesGetir, sesKaydet, sureMetni, type DersSesi } from '@/lib/audioStore'
import type {
  Catch,
  Lesson,
  LiveSession,
  Participant,
  QuizAnswer,
  QuizKind,
  SessionRating,
  SessionSecret,
} from '@/lib/types'
import { cx, initials } from '@/lib/utils'
import { EASE } from '@/lib/motion'

/** Perdede metnin okunan kısmından ne kadarını gösterelim */
const GORUNEN_ONCE = 260
const GORUNEN_SONRA = 420

function PhaseStepper({
  currentPhase,
  hasPretest,
  hasPosttest,
}: {
  currentPhase: string
  hasPretest: boolean
  hasPosttest: boolean
}) {
  const steps = [
    { key: 'lobby', title: '1. Lobi', desc: 'Katılım & QR' },
    ...(hasPretest ? [{ key: 'pretest', title: '2. Ön Test', desc: 'Pre-Test' }] : []),
    {
      key: 'live',
      title: hasPretest ? '3. Hatayı Yakala' : '2. Hatayı Yakala',
      desc: 'Canlı Sesli Ders',
    },
    ...(hasPosttest
      ? [
          {
            key: 'posttest',
            title: hasPretest ? '4. Son Test' : '3. Son Test',
            desc: 'Post-Test',
          },
        ]
      : []),
    {
      key: 'ended',
      title:
        (hasPretest && hasPosttest ? '5. ' : hasPretest || hasPosttest ? '4. ' : '3. ') + 'Sonuçlar',
      desc: 'Gelişim Analizi',
    },
  ]

  const isLivePhase = ['speaking', 'grace', 'reveal'].includes(currentPhase)
  const activeKey = isLivePhase ? 'live' : currentPhase

  return (
    <div className="mb-8 flex items-center justify-between gap-2 overflow-x-auto rounded-sm border border-paper-edge bg-paper-deep p-2">
      {steps.map((st, i) => {
        const isActive = activeKey === st.key
        const isPassed =
          (st.key === 'lobby' && activeKey !== 'lobby') ||
          (st.key === 'pretest' && activeKey !== 'lobby' && activeKey !== 'pretest') ||
          (st.key === 'live' && (activeKey === 'posttest' || activeKey === 'ended')) ||
          (st.key === 'posttest' && activeKey === 'ended')

        return (
          <div
            key={st.key}
            className={cx(
              'flex flex-1 min-w-[130px] items-center gap-2 rounded-sm px-3 py-2 text-xs transition-all',
              isActive
                ? 'bg-paper-card text-ink shadow-paper border border-paper-edge font-bold'
                : isPassed
                  ? 'text-verify bg-verify-soft/40 font-semibold'
                  : 'text-ink-muted',
            )}
          >
            <span
              className={cx(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold font-mono',
                isActive
                  ? 'bg-ink text-paper'
                  : isPassed
                    ? 'bg-verify text-white'
                    : 'bg-paper-edge text-ink-muted',
              )}
            >
              {isPassed ? '✓' : i + 1}
            </span>
            <div className="truncate">
              <p className="truncate font-semibold">{st.title}</p>
              <p className="text-[10px] text-ink-faint truncate">{st.desc}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AmfiHostV2() {
  const { lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [secret, setSecret] = useState<SessionSecret | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [catches, setCatches] = useState<Catch[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([])
  const [qr, setQr] = useState('')
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [charIndex, setCharIndex] = useState(0)
  /** Hocanın yüklediği ders kaydı — bu cihazda duruyor */
  const [sesKaydi, setSesKaydi] = useState<DersSesi | null>(null)
  const sesInputRef = useRef<HTMLInputElement>(null)
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
  /** Ön/son test kâğıdı bir kez notlansın */
  const quizGraded = useRef(new Set<string>())
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
      if (lessonId) {
        api.getLesson(lessonId).then((l) => l && setLesson(l)).catch(() => {})
      }
      return
    }

    if (!lessonId || !user?.uid) {
      setLoading(false)
      return
    }

    let alive = true
    const uidValue = user.uid

    ;(async () => {
      try {
        const l = await api.getLesson(lessonId)
        if (!alive) return
        setLesson(l)
        if (!l) {
          setLoading(false)
          return
        }

        // V2 açık oturumu varsa onu bul
        const active = await ses.findActiveSession(lessonId, uidValue, 2)
        if (!alive) return
        if (active) {
          setSession(active)
          setSessionId(active.id)
        }
        setLoading(false)
      } catch (err) {
        console.error(err)
        toast('Oturum yüklenirken hata oluştu: ' + (err as Error).message, 'error')
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [sessionIdParam, lessonId, user?.uid, toast])

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
    const e = ses.watchQuizAnswers(sessionId, setQuizAnswers)
    return () => {
      a()
      b()
      c()
      d()
      e()
    }
  }, [sessionId])

  /* ── Bu ders için yüklenmiş kayıt bu cihazda var mı? ── */
  useEffect(() => {
    const dersId = lessonId || session?.lessonId
    if (!dersId) return
    let alive = true
    void sesGetir(dersId).then((k) => alive && setSesKaydi(k))
    return () => {
      alive = false
    }
  }, [lessonId, session?.lessonId])

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

    /**
     * Ortak geri çağrılar: dersi TTS mi okuyor yoksa hocanın kaydı mı
     * çalıyor, aşağısı için fark etmiyor — ikisi de (an, karakter)
     * çizelgesini aynı şekilde besliyor.
     */
    const kancalar = {
      onStart: () => {
        // Pencere TAM BURADA açılır — speak() ile ses arasında ~1 sn var
        const t = Date.now()
        marksRef.current = [{ t, i: 0 }]
        const cur = sessionRef.current
        if (cur) {
          void ses.saveSession({
            ...cur,
            phase: 'speaking' as const,
            blockStartedAt: t,
            blockDurationMs: 0,
          })
        }
      },
      onBoundary: (i: number) => {
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
          phase: 'grace' as const,
          blockDurationMs: Date.now() - s2.blockStartedAt,
        })
      },
      onError: (m: string) => toast(m, 'error'),
    }

    /* Oturum bir ses kaydıyla açıldıysa dersi o kayıt anlatır. */
    if (s.audio) {
      if (!sesKaydi) {
        toast(
          `Bu oturum “${s.audio.name}” kaydıyla açılmış ama dosya bu cihazda yok. ` +
            'Aşağıdan dosyayı yeniden seç.',
          'error',
        )
        return
      }
      speakRef.current = playAudioFile(sesKaydi.blob, sec.script.length, kancalar)
      return
    }

    speakRef.current = speak(sec.script, voice, kancalar)
  }, [participants.length, voice, toast, sesKaydi])

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
  }, [catches, secret, session?.phase])

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
  }, [catches, secret])

  /* ══════════════ ÖN TEST / SON TEST ══════════════ */

  /** Gelen test kâğıtlarını notla — doğru şıklar yalnızca bu cihazda. */
  useEffect(() => {
    const sec = secretRef.current
    if (!sec) return

    const bekleyen = quizAnswers.filter(
      (a) => a.gradedAt === undefined && !quizGraded.current.has(a.id),
    )
    for (const a of bekleyen) {
      quizGraded.current.add(a.id)
      queue.current = queue.current.then(async () => {
        const gizli = secretRef.current
        if (!gizli) return
        const sorular = (a.kind === 'pre' ? gizli.pretest : gizli.posttest) ?? []
        if (!sorular.length) return
        try {
          await ses.gradeQuizAnswer(a, sorular)
        } catch (err) {
          console.error('[amfi] test notlanamadı:', err)
          quizGraded.current.delete(a.id)
        }
      })
    }
  }, [quizAnswers, secret])

  /** Oturum bir kayıtla açıldı ama dosya bu cihazda yoksa yeniden seçtir. */
  const sesiYenidenSec = async (file: File | undefined) => {
    const dersId = lessonId || sessionRef.current?.lessonId
    if (!file || !dersId) return
    try {
      const kayit = await sesKaydet(dersId, file)
      setSesKaydi(kayit)
      toast('Ses kaydı bu cihaza alındı. Artık dersi başlatabilirsin.', 'success')
    } catch (err) {
      toast('Ses kaydedilemedi: ' + (err as Error).message, 'error')
    } finally {
      if (sesInputRef.current) sesInputRef.current.value = ''
    }
  }

  const testiBaslat = async (kind: QuizKind) => {
    const s = sessionRef.current
    const sec = secretRef.current
    if (!s || !sec) return
    const sorular = (kind === 'pre' ? sec.pretest : sec.posttest) ?? []
    if (!sorular.length) {
      toast('Bu test için yüklenmiş soru yok.', 'error')
      return
    }
    try {
      await ses.startQuiz(s, kind, sorular)
    } catch (err) {
      toast((err as Error).message || 'Test açılamadı.', 'error')
    }
  }

  /**
   * Ön test biterse lobiye döneriz (hoca dersi başlatır),
   * son test biterse ders kapanır.
   */
  const testiBitir = async () => {
    const s = sessionRef.current
    if (!s?.activeQuiz) return
    const kind = s.activeQuiz.kind
    const bekleyen = partsRef.current.length - quizAnswers.filter((a) => a.kind === kind).length
    if (
      bekleyen > 0 &&
      !window.confirm(`${bekleyen} kişi henüz göndermedi. Testi yine de kapatayım mı?`)
    )
      return
    await queue.current
    await ses.endQuiz(s, kind === 'pre' ? 'lobby' : 'ended')
  }

  /**
   * Ön testi bitirip doğrudan kesintisiz canlı sesli derse geçer.
   */
  const onTestiBitirVeDerseGec = async () => {
    const s = sessionRef.current
    if (!s?.activeQuiz) return
    const bekleyen = partsRef.current.length - quizAnswers.filter((a) => a.kind === 'pre').length
    if (
      bekleyen > 0 &&
      !window.confirm(
        `${bekleyen} öğrenci henüz cevaplamadı. Ön testi bitirip Canlı Derse (Hatayı Yakala) geçilsin mi?`,
      )
    )
      return
    await queue.current
    await ses.endQuiz(s, 'lobby')
    toast('Ön test tamamlandı. Canlı ders başlatılıyor…', 'success')
    setTimeout(() => {
      basla()
    }, 600)
  }

  const bitir = async () => {
    const s = sessionRef.current
    if (!s) return
    const sonTestVar = (secretRef.current?.posttest?.length ?? 0) > 0

    if (
      !window.confirm(
        sonTestVar
          ? 'Okuma bitsin ve SON TEST açılsın mı?'
          : 'Dersi bitirmek istediğine emin misin?',
      )
    )
      return

    speakRef.current?.cancel()
    cancelSpeech()
    await queue.current
    await ses.markMissedWrongs(s.wrongCount, partsRef.current, catchesRef.current)

    if (sonTestVar) {
      await testiBaslat('post')
      return
    }
    await ses.saveSession({ ...s, phase: 'ended' })
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

  /* ── Ön/son test durumu ── */
  const onTestSorulari = secret?.pretest ?? []
  const sonTestSorulari = secret?.posttest ?? []
  const onTestKagitlari = quizAnswers.filter((a) => a.kind === 'pre')
  const sonTestKagitlari = quizAnswers.filter((a) => a.kind === 'post')
  const onTestBitti = onTestKagitlari.length > 0 && session?.phase !== 'pretest'

  if (loading) return <Loader label="Oturum yükleniyor…" />

  if (!session) {
    const targetLessonId = lessonId || lesson?.id
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">OTURUM BULUNAMADI</p>
          <p className="mt-3 text-sm text-ink-muted">
            Bu ders için açık bir amfi oturumu yok.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {targetLessonId ? (
              <Button3D onClick={() => nav(`/hoca/amfi-setup/${targetLessonId}`)}>
                Oyunu Hazırla
              </Button3D>
            ) : null}
            <Button3D tone="ghost" onClick={() => nav('/hoca')}>
              Panele Dön
            </Button3D>
          </div>
        </div>
      </div>
    )
  }

  const joinUrl = `${window.location.origin}/amfi/${session.code}`

  /* ══════════════ LOBİ ══════════════ */
  if (session.phase === 'lobby') {
    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <PhaseStepper
          currentPhase="lobby"
          hasPretest={onTestSorulari.length > 0}
          hasPosttest={sonTestSorulari.length > 0}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">AMFİ OTURUMU · 1. AŞAMA (LOBİ)</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {session.lessonTitle}
            </h1>
          </div>
          {isElevenLabsConfigured() && !session.audio && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ElevenLabs Doğal AI Seslendirme Aktif
            </div>
          )}
        </div>
        <div className="rule mt-7" />

        {voiceError && !session.audio && (
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

            {/* Ölçme testleri — akış: ön test → ders → son test */}
            {(onTestSorulari.length > 0 || sonTestSorulari.length > 0) && (
              <div className="mt-5 rounded-sm border border-paper-edge bg-paper-deep p-4">
                <p className="label font-bold">ÖLÇME TESTLERİ DURUMU</p>
                <div className="mt-3 space-y-2 text-sm text-ink">
                  <div className="flex items-center justify-between gap-3">
                    <span>1. Ön test · {onTestSorulari.length} soru</span>
                    <span
                      className={cx(
                        'font-mono text-[11px] font-bold uppercase tracking-[0.14em]',
                        onTestBitti ? 'text-verify' : 'text-flag',
                      )}
                    >
                      {onTestSorulari.length === 0
                        ? 'YOK'
                        : onTestBitti
                          ? `✓ ${onTestKagitlari.length} ÖĞRENCİ TAMAMLADI`
                          : 'BEKLİYOR'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>2. Son test · {sonTestSorulari.length} soru</span>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                      {sonTestSorulari.length === 0 ? 'YOK' : 'CANLI DERS BİTİMİNDE'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Ders neyle anlatılacak? */}
            {session.audio && (
              <div
                className={cx(
                  'mt-5 rounded-sm border-l-4 p-4',
                  sesKaydi ? 'border-l-verify bg-verify-soft' : 'border-l-mark bg-mark-soft',
                )}
              >
                <p className="label font-bold">DERS SES KAYDIYLA ANLATILACAK</p>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {session.audio.name} · {sureMetni(session.audio.durationMs)}
                </p>
                {!sesKaydi && (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-ink">
                      Dosya <strong className="font-semibold">bu cihazda bulunamadı</strong> —
                      kayıt hocanın kendi bilgisayarında saklanıyor. Aynı dosyayı seçersen ders
                      başlayabilir.
                    </p>
                    <div className="mt-3">
                      <Button3D size="sm" onClick={() => sesInputRef.current?.click()}>
                        Ses Dosyasını Seç
                      </Button3D>
                    </div>
                  </>
                )}
              </div>
            )}

            <input
              ref={sesInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
              className="hidden"
              onChange={(e) => void sesiYenidenSec(e.target.files?.[0])}
            />

            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              {onTestSorulari.length > 0 && !onTestBitti ? (
                <>
                  <Button3D
                    size="lg"
                    tone="gold"
                    onClick={() => testiBaslat('pre')}
                    disabled={!participants.length}
                  >
                    📝 1. Aşama: Ön Testi Başlat
                  </Button3D>
                  <Button3D
                    size="lg"
                    tone="ghost"
                    onClick={basla}
                    disabled={session.audio ? !sesKaydi || !script : !!voiceError || !script}
                  >
                    🎙️ Ön Testi Atla · Dersi Başlat
                  </Button3D>
                </>
              ) : (
                <Button3D
                  size="lg"
                  tone="success"
                  onClick={basla}
                  disabled={session.audio ? !sesKaydi || !script : !!voiceError || !script}
                >
                  {onTestBitti
                    ? '🎙️ 2. Aşama: Canlı Dersi Başlat (Hatayı Yakala)'
                    : '🎙️ Canlı Dersi Başlat'}
                </Button3D>
              )}
              <Button3D size="lg" tone="ghost" onClick={() => nav('/hoca')}>
                Vazgeç
              </Button3D>
            </div>
          </div>
        </div>

        {/* Seslendirme & Ton Seçici — ders kayıtla anlatılacaksa gereksiz */}
        {!session.audio && (
          <div className="mt-6">
            <VoiceSelector onSelect={() => getTurkishVoice().then((v) => v && setVoice(v))} />
          </div>
        )}
      </div>
    )
  }

  /* ══════════════ ÖN TEST / SON TEST ══════════════ */
  if (session.phase === 'pretest' || session.phase === 'posttest') {
    const kind: QuizKind = session.phase === 'pretest' ? 'pre' : 'post'
    const kagitlar = kind === 'pre' ? onTestKagitlari : sonTestKagitlari
    const soruSayisi = session.activeQuiz?.questions.length ?? 0
    const gonderenler = new Set(kagitlar.map((a) => a.participantId))
    const bekleyenler = participants.filter((p) => !gonderenler.has(p.id))
    const notlanan = kagitlar.filter((a) => a.percent !== undefined)
    const ortalama = notlanan.length
      ? Math.round(notlanan.reduce((t, a) => t + (a.percent ?? 0), 0) / notlanan.length)
      : null

    return (
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <PhaseStepper
          currentPhase={session.phase}
          hasPretest={onTestSorulari.length > 0}
          hasPosttest={sonTestSorulari.length > 0}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">
              {kind === 'pre' ? '2. AŞAMA: ÖN TEST (DERSTEN ÖNCE)' : '4. AŞAMA: SON TEST (DERSTEN SONRA)'}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {session.lessonTitle}
            </h1>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold text-ink">
              {kagitlar.length}
              <span className="text-ink-faint">/{participants.length}</span>
            </p>
            <p className="label mt-1">GÖNDEREN</p>
          </div>
        </div>
        <div className="rule mt-7" />

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <div className="file-card p-7 text-center">
              <p className="label">KATILIM KODU</p>
              <p className="mt-3 font-mono text-5xl font-bold tracking-[0.18em] text-ink">
                {session.code}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                Geç kalanlar katılıp testi çözebilir.
              </p>
            </div>

            <div className="file-card grid grid-cols-3 gap-px overflow-hidden bg-paper-edge">
              <div className="bg-paper-card p-4 text-center">
                <p className="font-display text-2xl font-bold text-ink">{soruSayisi}</p>
                <p className="label mt-0.5">SORU</p>
              </div>
              <div className="bg-paper-card p-4 text-center">
                <p className="font-display text-2xl font-bold text-flag">{bekleyenler.length}</p>
                <p className="label mt-0.5">BEKLENEN</p>
              </div>
              <div className="bg-paper-card p-4 text-center">
                <p className="font-display text-2xl font-bold text-verify">
                  {ortalama === null ? '—' : `%${ortalama}`}
                </p>
                <p className="label mt-0.5">ORTALAMA</p>
              </div>
            </div>

            <div className="file-card p-6">
              <p className="text-sm leading-relaxed text-ink-muted">
                {kind === 'pre'
                  ? 'Öğrenciler ön testi bitirdiğinde doğrudan Canlı Derse (Hatayı Yakala) geçebilirsiniz.'
                  : 'Son test tamamlandığında oturum kapanır ve gelişim karşılaştırma raporu açılır.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {kind === 'pre' ? (
                  <>
                    <Button3D size="lg" tone="gold" onClick={onTestiBitirVeDerseGec}>
                      🎙️ Ön Testi Bitir & Canlı Derse Geç
                    </Button3D>
                    <Button3D size="lg" tone="ghost" onClick={testiBitir}>
                      Lobiye Dön
                    </Button3D>
                  </>
                ) : (
                  <Button3D size="lg" tone="success" onClick={testiBitir}>
                    🏆 Son Testi Bitir & Sonuçları Aç
                  </Button3D>
                )}
              </div>
            </div>
          </div>

          {/* Kim gönderdi, kim bekliyor */}
          <div className="file-card p-6">
            <p className="label font-bold">TEST KAĞITLARI</p>
            <div className="rule my-4" />
            {kagitlar.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                Henüz kimse göndermedi — öğrenciler çözüyor.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {[...kagitlar]
                    .sort((a, b) => b.submittedAt - a.submittedAt)
                    .map((a) => (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 rounded-sm bg-paper-deep px-3 py-2"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-paper-edge bg-paper-card font-mono text-[10px] font-bold text-ink">
                          {initials(a.participantName)}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {a.participantName}
                        </span>
                        <span className="font-mono text-[11px] text-ink-muted">
                          {a.correctCount ?? '—'}/{a.total ?? soruSayisi}
                        </span>
                        <span className="w-14 text-right font-display font-bold text-ink">
                          {a.percent === undefined ? '…' : `%${a.percent}`}
                        </span>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            )}

            {bekleyenler.length > 0 && (
              <>
                <div className="rule my-4" />
                <p className="label font-bold text-flag">BEKLENENLER ({bekleyenler.length})</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bekleyenler.map((p) => (
                    <span key={p.id} className="label-chip border-paper-edge bg-paper-deep">
                      {p.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════ BİTİŞ ══════════════ */
  if (session.phase === 'ended') {
    const reportLessonId = lessonId || session.lessonId || lesson?.id
    return (
      <div className="mx-auto max-w-4xl space-y-8 px-5 py-12 sm:px-6">
        <PhaseStepper
          currentPhase="ended"
          hasPretest={onTestSorulari.length > 0}
          hasPosttest={sonTestSorulari.length > 0}
        />

        <div className="file-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">OTURUM RAPORU</span>
            <span className="label ml-auto">{session.code}</span>
          </div>
          <div className="p-8 text-center">
            <span className="stamp-verify animate-stamp">DERS TAMAMLANDI</span>
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
                  {p.score} puan
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ön Test vs Son Test Karşılaştırmalı Gelişim Tablosu */}
        <QuizComparison participants={participants} quizAnswers={quizAnswers} />

        <RatingSummary ratings={ratings} />

        <div className="flex flex-wrap justify-center gap-3">
          {reportLessonId ? (
            <Button3D onClick={() => nav(`/hoca/sonuclar/${reportLessonId}`)}>
              📊 Ayrıntılı Sonuçlar & Excel İndir
            </Button3D>
          ) : null}
          <Button3D tone="ghost" onClick={() => nav('/hoca')}>
            Panele Dön
          </Button3D>
        </div>
      </div>
    )
  }

  /* ══════════════ OKUMA ══════════════ */
  const okunan = script.slice(Math.max(0, charIndex - GORUNEN_ONCE), charIndex)
  const match = script.slice(charIndex).match(/^\S+/)
  const suAn = match ? match[0] : (script.slice(charIndex).split(' ')[0] ?? '')
  const gelecek = script.slice(charIndex + suAn.length, charIndex + GORUNEN_SONRA)
  const ilerleme = session.scriptLength
    ? Math.min(100, Math.round((charIndex / session.scriptLength) * 100))
    : 0
  const bitiyor = session.phase === 'grace'

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <PhaseStepper
        currentPhase={session.phase}
        hasPretest={onTestSorulari.length > 0}
        hasPosttest={sonTestSorulari.length > 0}
      />

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
              {suAn && <span className="bg-flag-soft font-semibold text-ink px-1 rounded-xs">{suAn}</span>}
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
