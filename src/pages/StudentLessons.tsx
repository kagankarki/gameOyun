/**
 * ÖĞRENCİ GİRİŞİ — "Derse Katıl"
 *
 * Burada BİLEREK ders listesi yok. Ders notunu önceden okuyabilen öğrenci
 * hataların nerede olduğunu da görürdü; oyunun tamamı buna dayanıyor.
 * Öğrenci metni yalnızca amfide, hocanın sesinden duyar.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import { useAuth } from '@/context/AuthContext'
import * as ses from '@/lib/session'
import type { LiveSession, Participant } from '@/lib/types'
import { cx, fmtDate } from '@/lib/utils'
import { EASE } from '@/lib/motion'

export default function StudentLessons() {
  const nav = useNavigate()
  const { user } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sessions, setSessions] = useState<LiveSession[]>([])

  useEffect(() => ses.watchAllParticipants(setParticipants), [])
  useEffect(() => ses.watchAllSessions(setSessions), [])

  /** Bu öğrencinin katıldığı dersler, yeniden eskiye */
  const history = useMemo(() => {
    if (!user) return []
    const byId = new Map(sessions.map((s) => [s.id, s]))

    return participants
      .filter((p) => p.studentId === user.uid)
      .map((p) => ({ p, session: byId.get(p.sessionId) }))
      .filter((row): row is { p: Participant; session: LiveSession } => Boolean(row.session))
      .sort((a, b) => b.p.joinedAt - a.p.joinedAt)
  }, [participants, sessions, user])

  const totalScore = history.reduce((sum, h) => sum + h.p.score, 0)

  /** Aynı oturumda kaçıncı olduğu */
  const rankIn = (sessionId: string, participantId: string) =>
    participants
      .filter((x) => x.sessionId === sessionId)
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
      .findIndex((x) => x.id === participantId) + 1

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const key = code.trim().toLocaleUpperCase('tr-TR')
    if (key.length < 4) {
      setError('Hocanın verdiği 6 haneli kodu gir.')
      return
    }
    nav(`/amfi/${key}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-3xl px-5 py-12 sm:px-6"
    >
      <div className="mb-8">
        <p className="label">ÖĞRENCİ GİRİŞİ</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Hazır mısın {user?.name?.split(' ')[0]}?
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Toplam puanın:{' '}
          <span className="font-display text-lg font-bold text-ink">{totalScore}</span> ·{' '}
          {history.length} derse katıldın
        </p>
      </div>

      <div className="rule mb-8" />

      {/* Katılım */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="file-card p-7 sm:p-9"
      >
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-ink">Derse Katıl</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Hoca derste kodu ve QR'ı perdeye yansıtacak. Kodu gir, telefonunu eline al
            ve dinlemeye başla.
          </p>
        </div>

        <form onSubmit={submit} className="mx-auto mt-7 max-w-sm space-y-5">
          <div>
            <label className="field-label" htmlFor="join-code">
              KATILIM KODU
            </label>
            <input
              id="join-code"
              className="field text-center font-mono text-3xl font-bold tracking-[0.28em]"
              value={code}
              onChange={(e) => {
                setError(null)
                setCode(e.target.value.toLocaleUpperCase('tr-TR'))
              }}
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>

          {error && (
            <p className="rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <Button3D type="submit" size="lg" full>
            Katıl
          </Button3D>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
          Derste ekranında metin görünmez — hatayı duyduğun an "HATA VAR"a basıp
          ne olduğunu yazarsın.
        </p>
      </motion.div>

      {/* Geçmiş */}
      {history.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-display text-2xl font-bold tracking-tight text-ink">
            Katıldığın dersler
          </h2>
          <div className="file-card divide-y divide-paper-edge overflow-hidden">
            {history.slice(0, 8).map(({ p, session }) => {
              const rank = rankIn(session.id, p.id)
              const chances = p.hits + p.misses
              const pct = chances ? Math.round((p.hits / chances) * 100) : 0

              return (
                <div key={p.id} className="px-5 py-4 sm:px-6">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {session.lessonTitle}
                      </p>
                      <p className="font-mono text-[11px] text-ink-faint">
                        {fmtDate(p.joinedAt)} · {session.teacherName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-bold leading-none text-ink">
                        {p.score}
                      </p>
                      <p
                        className={cx(
                          'mt-1 font-mono text-[11px]',
                          rank === 1 ? 'font-bold text-ink' : 'text-ink-muted',
                        )}
                      >
                        {rank}. sıra
                      </p>
                    </div>
                  </div>

                  {/* Dar ekranda tek satıra sığmıyordu — alt şeride alındı */}
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                    <span className="text-verify">{p.hits} yakaladı</span>
                    <span className="text-flag">{p.misses} kaçtı</span>
                    <span className="text-mark">{p.falseAlarms} boş</span>
                    <span className="text-ink-muted">%{pct} isabet</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </motion.div>
  )
}
