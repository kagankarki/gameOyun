/**
 * ÖĞRENCİ — ÖN TEST / SON TEST EKRANI
 *
 * Oturum `pretest` ya da `posttest` fazındayken öğrencinin telefonunda
 * oyun yerine bu ekran çıkar. Sorular oturum dokümanından okunur ve
 * DOĞRU ŞIKLARI YOKTUR — puanlamayı hoca cihazı yapar.
 *
 * Aynı test iki kez gönderilemesin diye kayıt kimliği
 * `<oturum>_<pre|post>_<katılımcı>`; sayfa yenilenirse mevcut kayıt
 * okunup "gönderildi" ekranı gösterilir.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

import Button3D from './Button3D'
import { useToast } from './Toast'
import * as ses from '@/lib/session'
import type { LiveSession, Participant, QuizAnswer, QuizKind } from '@/lib/types'
import { cx } from '@/lib/utils'

const HARF = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const BASLIK: Record<QuizKind, { etiket: string; baslik: string; aciklama: string }> = {
  pre: {
    etiket: 'ÖN TEST',
    baslik: 'Dersten önce',
    aciklama:
      'Bu testi ders başlamadan çözüyorsun. Bilmediğin olması normal — amaç dersin sana ne kattığını ölçmek.',
  },
  post: {
    etiket: 'SON TEST',
    baslik: 'Dersten sonra',
    aciklama: 'Aynı konunun son testi. Dersten sonra nerede olduğunu bu gösterecek.',
  },
}

interface Props {
  session: LiveSession
  participant: Participant | undefined
}

export default function QuizRunner({ session, participant }: Props) {
  const toast = useToast()
  const quiz = session.activeQuiz

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [gonderildi, setGonderildi] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Mevcut kayıt aranırken formu göstermiyoruz — yanıp sönmesin */
  const [kontrol, setKontrol] = useState(true)

  const kind = quiz?.kind ?? 'pre'
  const kayitId = participant ? ses.quizAnswerId(session.id, kind, participant.id) : null

  /* Daha önce gönderdi mi? (sayfa yenileme / tekrar bağlanma) */
  useEffect(() => {
    if (!kayitId) return
    let alive = true
    setKontrol(true)
    setGonderildi(false)
    setAnswers({})
    ses
      .getQuizAnswer(kayitId)
      .then((a) => {
        if (!alive) return
        if (a) {
          setGonderildi(true)
          setAnswers(a.answers ?? {})
        }
      })
      .catch(() => {})
      .finally(() => alive && setKontrol(false))
    return () => {
      alive = false
    }
  }, [kayitId])

  const sorular = useMemo(() => quiz?.questions ?? [], [quiz])
  const cevaplanan = sorular.filter((q) => answers[q.id] !== undefined).length
  const tamam = cevaplanan === sorular.length && sorular.length > 0

  const gonder = async () => {
    if (!participant || busy) return
    if (!tamam) {
      const eksik = sorular.length - cevaplanan
      if (!window.confirm(`${eksik} soru boş kalacak. Yine de göndereyim mi?`)) return
    }
    setBusy(true)
    try {
      await ses.submitQuizAnswer(session, participant, kind, answers)
      setGonderildi(true)
      toast('Cevapların alındı.', 'success')
    } catch (err) {
      toast((err as Error).message || 'Cevaplar gönderilemedi.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const metin = BASLIK[kind]

  if (!quiz || !sorular.length)
    return (
      <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
        <p className="text-sm text-ink-muted">Test hazırlanıyor…</p>
      </div>
    )

  if (kontrol)
    return (
      <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
        <p className="text-sm text-ink-muted">Test yükleniyor…</p>
      </div>
    )

  /* ── Gönderildi ── */
  if (gonderildi)
    return (
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="file-card p-8 text-center">
          <span className="stamp-verify animate-stamp">GÖNDERİLDİ</span>
          <h2 className="mt-8 font-display text-2xl font-bold text-ink">
            {metin.etiket} tamamlandı
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {cevaplanan}/{sorular.length} soruyu cevapladın. Sonucu hoca açıklayacak —
            {kind === 'pre' ? ' şimdi dersi dinle.' : ' ders burada bitiyor.'}
          </p>
        </div>
      </div>
    )

  /* ── Test ── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-md px-5 py-6"
    >
      {/* Künye + ilerleme — ekranın tepesinde sabit */}
      <div className="sticky top-[68px] z-10 -mx-5 mb-5 border-b border-paper-edge bg-paper-card/95 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label font-bold">{metin.etiket}</span>
          <span className="font-mono text-xs font-bold text-ink">
            {cevaplanan}/{sorular.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full bg-ink transition-all duration-300"
            style={{ width: `${(cevaplanan / sorular.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="file-card p-6">
        <h1 className="font-display text-xl font-bold text-ink">{metin.baslik}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{metin.aciklama}</p>
      </div>

      <div className="mt-5 space-y-4">
        {sorular.map((q, qi) => (
          <div key={q.id} className="file-card p-5">
            <p className="text-[15px] font-semibold leading-relaxed text-ink">
              <span className="mr-2 font-mono text-ink-faint">{qi + 1}.</span>
              {q.question}
            </p>
            <div className="mt-4 space-y-2">
              {q.options.map((opt, oi) => {
                const secili = answers[q.id] === oi
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-sm border-2 px-3.5 py-3 text-left text-sm transition-all',
                      secili
                        ? 'border-ink bg-ink text-paper'
                        : 'border-paper-edge bg-paper-card text-ink hover:border-ink',
                    )}
                  >
                    <span
                      className={cx(
                        'mt-px font-mono text-xs font-bold',
                        secili ? 'text-paper' : 'text-ink-faint',
                      )}
                    >
                      {HARF[oi]}
                    </span>
                    <span className="flex-1 leading-snug">{opt}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-paper-edge bg-paper-card/95 px-5 py-4 backdrop-blur-sm">
        <Button3D size="lg" full onClick={gonder} disabled={busy || !participant}>
          {busy ? 'Gönderiliyor…' : tamam ? 'Testi Gönder' : `Gönder (${cevaplanan}/${sorular.length})`}
        </Button3D>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Gönderdikten sonra cevaplarını değiştiremezsin.
        </p>
      </div>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════
   ÖĞRENCİNİN KENDİ ÖN/SON TEST SONUCU
   Ders bitiş ekranında görünür. Puanlama hoca cihazında yapıldığı
   için kâğıt henüz notlanmamış olabilir — o durumda "hesaplanıyor".
   ══════════════════════════════════════════════════════════ */

export function QuizSelfSummary({
  sessionId,
  participantId,
}: {
  sessionId: string
  participantId: string | undefined
}) {
  const [pre, setPre] = useState<QuizAnswer | null>(null)
  const [post, setPost] = useState<QuizAnswer | null>(null)

  useEffect(() => {
    if (!participantId) return
    let alive = true
    const al = (kind: QuizKind, set: (a: QuizAnswer | null) => void) =>
      ses
        .getQuizAnswer(ses.quizAnswerId(sessionId, kind, participantId))
        .then((a) => alive && set(a))
        .catch(() => {})
    void al('pre', setPre)
    void al('post', setPost)
    return () => {
      alive = false
    }
  }, [sessionId, participantId])

  if (!pre && !post) return null

  const fark =
    pre?.percent !== undefined && post?.percent !== undefined ? post.percent - pre.percent : null

  const kutu = (etiket: string, a: QuizAnswer | null) => (
    <div className="bg-paper-card p-4 text-center">
      <p className="font-display text-2xl font-bold text-ink">
        {a?.percent === undefined ? '—' : `%${a.percent}`}
      </p>
      <p className="label mt-0.5">{etiket}</p>
      {a && a.correctCount !== undefined && (
        <p className="mt-1 font-mono text-[11px] text-ink-muted">
          {a.correctCount}/{a.total}
        </p>
      )}
    </div>
  )

  return (
    <div className="file-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-5 py-2.5">
        <span className="label">TESTLERİN</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-paper-edge">
        {kutu('ÖN TEST', pre)}
        {kutu('SON TEST', post)}
        <div className="bg-paper-card p-4 text-center">
          <p
            className={cx(
              'font-display text-2xl font-bold',
              fark === null ? 'text-ink' : fark > 0 ? 'text-verify' : 'text-mark',
            )}
          >
            {fark === null ? '—' : fark > 0 ? `+${fark}` : fark}
          </p>
          <p className="label mt-0.5">DEĞİŞİM</p>
        </div>
      </div>
      {(pre?.percent === undefined || post?.percent === undefined) && (
        <p className="border-t border-paper-edge px-5 py-3 text-center text-[11px] text-ink-muted">
          Sonuçlar hoca cihazında hesaplanıyor — birazdan görünür.
        </p>
      )}
    </div>
  )
}
