/**
 * DERS SONU DEĞERLENDİRMESİ — 5 yıldız
 *
 * Öğrenci ekranı (RatingForm) dersi puanlar, hoca ekranı (RatingSummary)
 * ortalamayı ve yorumları gösterir. İkisi de aynı yıldız çizimini kullanır.
 */
import { useId, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import * as ses from '@/lib/session'
import type { Participant, SessionRating } from '@/lib/types'
import { cx } from '@/lib/utils'

const LABELS = ['', 'Hiç olmadı', 'İdare eder', 'Fena değil', 'İyiydi', 'Harikaydı'] as const

/* ══════════════ Yıldız ══════════════ */

/**
 * Yarım yıldız bir gradient ile çiziliyor. Sayfada birden çok yıldız
 * dizisi olabildiği için gradient kimliği örneğe özel olmalı — sabit id
 * kullanılsa tarayıcı hepsinde belgedeki İLK gradienti kullanırdı.
 */
function Star({ filled, half }: { filled: boolean; half?: boolean }) {
  const gid = `${useId()}-half`
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      {half && (
        <defs>
          <linearGradient id={gid}>
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z"
        fill={half ? `url(#${gid})` : filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface StarsProps {
  value: number
  /** Verilirse yıldızlar tıklanabilir olur */
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' }

export function StarRating({ value, onChange, size = 'md' }: StarsProps) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  if (!onChange) {
    return (
      <div className="inline-flex gap-1 text-flag" aria-label={`5 üzerinden ${value.toFixed(1)}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={SIZES[size]}>
            <Star filled={value >= n} half={value > n - 1 && value < n} />
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="inline-flex gap-2" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} yıldız`}
          aria-pressed={value === n}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onClick={() => onChange(n)}
          className={cx(
            'rounded-sm transition-transform duration-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2',
            shown >= n ? 'text-flag' : 'text-ink-faint',
            hover === n && 'scale-110',
          )}
        >
          <span className={cx('block', SIZES[size])}>
            <Star filled={shown >= n} />
          </span>
        </button>
      ))}
    </div>
  )
}

/* ══════════════ Öğrenci: oy ver ══════════════ */

interface FormProps {
  sessionId: string
  participant: Participant | null
  /** Bu oturumun tüm oyları — bu öğrenci daha önce oy verdiyse form kilitlenir */
  ratings: SessionRating[]
}

export function RatingForm({ sessionId, participant, ratings }: FormProps) {
  const mine = useMemo(
    () => ratings.find((r) => r.participantId === participant?.id) ?? null,
    [ratings, participant?.id],
  )

  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!participant || stars < 1 || busy) return
    setBusy(true)
    setError(null)
    try {
      await ses.submitRating(sessionId, participant, stars, comment)
    } catch (err) {
      setError((err as Error).message || 'Değerlendirme gönderilemedi.')
    } finally {
      setBusy(false)
    }
  }

  if (mine) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="file-card p-6 text-center"
      >
        <p className="label">DEĞERLENDİRMEN ALINDI</p>
        <div className="mt-4 flex justify-center">
          <StarRating value={mine.stars} size="md" />
        </div>
        <p className="mt-3 text-sm text-ink-muted">{LABELS[mine.stars]}</p>
        {mine.comment && <p className="marginalia mt-4 text-left">{mine.comment}</p>}
      </motion.div>
    )
  }

  return (
    <div className="file-card p-6 text-center">
      <p className="label">DERSİ DEĞERLENDİR</p>
      <p className="mt-2 text-sm text-ink-muted">Bu ders sence nasıldı?</p>

      <div className="mt-5 flex justify-center">
        <StarRating value={stars} onChange={setStars} size="lg" />
      </div>

      <p className="mt-3 h-5 font-display text-base font-semibold text-ink">
        {stars > 0 ? LABELS[stars] : ''}
      </p>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={280}
        className="field mt-4 min-h-[80px] resize-none text-left"
        placeholder="Eklemek istediğin bir şey var mı? (isteğe bağlı)"
      />

      {error && (
        <p className="mt-3 rounded-sm border-l-2 border-mark bg-mark-soft px-3 py-2 text-left text-sm text-ink">
          {error}
        </p>
      )}

      <div className="mt-4">
        <Button3D onClick={send} disabled={stars < 1 || busy || !participant} size="lg" full>
          {busy ? 'Gönderiliyor…' : 'Değerlendirmeyi Gönder'}
        </Button3D>
      </div>
    </div>
  )
}

/* ══════════════ Hoca: özet ══════════════ */

export function RatingSummary({ ratings }: { ratings: SessionRating[] }) {
  const { count, average, counts } = useMemo(() => ses.ratingSummary(ratings), [ratings])
  const comments = useMemo(() => ratings.filter((r) => r.comment.trim()), [ratings])

  if (!count) {
    return (
      <div className="file-card p-6 text-center">
        <p className="label">DERS DEĞERLENDİRMESİ</p>
        <p className="mt-3 text-sm text-ink-muted">Öğrencilerin oyları bekleniyor…</p>
      </div>
    )
  }

  return (
    <div className="file-card p-6">
      <p className="label">DERS DEĞERLENDİRMESİ</p>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <p className="font-display text-5xl font-bold leading-none text-ink">
          {average.toFixed(1)}
        </p>
        <div>
          <StarRating value={average} size="sm" />
          <p className="label mt-1.5">{count} ÖĞRENCİ OY VERDİ</p>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        {[5, 4, 3, 2, 1].map((n) => {
          const c = counts[n - 1]
          const pct = count ? Math.round((c / count) * 100) : 0
          return (
            <div key={n} className="flex items-center gap-3">
              <span className="w-4 font-mono text-xs font-bold text-ink-muted">{n}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-paper-deep">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-flag"
                />
              </div>
              <span className="w-8 text-right font-mono text-xs text-ink-muted">{c}</span>
            </div>
          )
        })}
      </div>

      {comments.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="label">YORUMLAR</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {comments.map((r) => (
              <div key={r.id} className="rounded-sm border border-paper-edge bg-paper-deep p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-bold text-ink-muted">{r.participantName}</p>
                  <span className="shrink-0 text-flag">
                    <StarRating value={r.stars} size="sm" />
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink">{r.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
