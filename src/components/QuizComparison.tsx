/**
 * ÖN TEST → SON TEST KARŞILAŞTIRMASI
 *
 * Hoca raporunda ve oturum bitiş ekranında kullanılır. Asıl sorusu şu:
 * ders bu öğrenciye ne kattı? Ön testte %40, son testte %80 alan öğrenci
 * için "+40 puan" satırı, dersin ölçülebilir çıktısı.
 */
import type { Participant, QuizAnswer } from '@/lib/types'
import { cx } from '@/lib/utils'

interface Props {
  participants: Participant[]
  quizAnswers: QuizAnswer[]
  /** Başlığı gizlemek isteyen ekranlar için */
  baslik?: string
}

interface Satir {
  id: string
  ad: string
  pre: QuizAnswer | undefined
  post: QuizAnswer | undefined
  preP: number | null
  postP: number | null
  fark: number | null
}

const yuzde = (a: QuizAnswer | undefined) => (a?.percent === undefined ? null : a.percent)

export default function QuizComparison({ participants, quizAnswers, baslik }: Props) {
  if (!quizAnswers.length) return null

  const pre = new Map(quizAnswers.filter((a) => a.kind === 'pre').map((a) => [a.participantId, a]))
  const post = new Map(quizAnswers.filter((a) => a.kind === 'post').map((a) => [a.participantId, a]))

  /* Katılımcı listesi boşalmış olabilir (eski oturum) — kâğıtlardan tamamla */
  const kimlikler = new Map<string, string>()
  participants.forEach((p) => kimlikler.set(p.id, p.name))
  quizAnswers.forEach((a) => {
    if (!kimlikler.has(a.participantId)) kimlikler.set(a.participantId, a.participantName)
  })

  const satirlar: Satir[] = [...kimlikler.entries()]
    .map(([id, ad]) => {
      const p = pre.get(id)
      const s = post.get(id)
      const preP = yuzde(p)
      const postP = yuzde(s)
      return {
        id,
        ad,
        pre: p,
        post: s,
        preP,
        postP,
        fark: preP !== null && postP !== null ? postP - preP : null,
      }
    })
    .filter((r) => r.pre || r.post)
    .sort((a, b) => (b.fark ?? -999) - (a.fark ?? -999))

  const ort = (list: (number | null)[]) => {
    const v = list.filter((x): x is number => x !== null)
    return v.length ? Math.round(v.reduce((t, x) => t + x, 0) / v.length) : null
  }
  const preOrt = ort(satirlar.map((r) => r.preP))
  const postOrt = ort(satirlar.map((r) => r.postP))
  const kazanim = preOrt !== null && postOrt !== null ? postOrt - preOrt : null

  return (
    <div className="file-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
        <span className="label">{baslik ?? 'ÖN TEST → SON TEST'}</span>
        <span className="label ml-auto">{satirlar.length} ÖĞRENCİ</span>
      </div>

      {/* Sınıf özeti */}
      <div className="grid grid-cols-3 gap-px bg-paper-edge">
        <div className="bg-paper-card p-4 text-center">
          <p className="font-display text-2xl font-bold text-ink">
            {preOrt === null ? '—' : `%${preOrt}`}
          </p>
          <p className="label mt-0.5">ÖN TEST ORT.</p>
        </div>
        <div className="bg-paper-card p-4 text-center">
          <p className="font-display text-2xl font-bold text-ink">
            {postOrt === null ? '—' : `%${postOrt}`}
          </p>
          <p className="label mt-0.5">SON TEST ORT.</p>
        </div>
        <div className="bg-paper-card p-4 text-center">
          <p
            className={cx(
              'font-display text-2xl font-bold',
              kazanim === null ? 'text-ink' : kazanim > 0 ? 'text-verify' : 'text-mark',
            )}
          >
            {kazanim === null ? '—' : kazanim > 0 ? `+${kazanim}` : kazanim}
          </p>
          <p className="label mt-0.5">KAZANIM</p>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto border-t border-paper-edge">
        {satirlar.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-paper-edge px-5 py-3 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.ad}</span>
            <span className="w-16 text-right font-mono text-xs text-ink-muted">
              {r.preP === null ? '—' : `%${r.preP}`}
            </span>
            <span className="text-ink-faint">→</span>
            <span className="w-16 text-right font-mono text-xs text-ink">
              {r.postP === null ? '—' : `%${r.postP}`}
            </span>
            <span
              className={cx(
                'w-16 text-right font-display text-sm font-bold',
                r.fark === null ? 'text-ink-faint' : r.fark > 0 ? 'text-verify' : r.fark < 0 ? 'text-mark' : 'text-ink-muted',
              )}
            >
              {r.fark === null ? 'eksik' : r.fark > 0 ? `+${r.fark}` : r.fark}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
