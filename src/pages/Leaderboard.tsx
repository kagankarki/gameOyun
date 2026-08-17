import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import * as ses from '@/lib/session'
import type { Participant } from '@/lib/types'
import { cx, initials } from '@/lib/utils'
import { EASE } from '@/lib/motion'

export default function Leaderboard() {
  const { user } = useAuth()
  // Puanların tek kaynağı amfi oturumları — tek kişilik mod kaldırıldı
  const [participants, setParticipants] = useState<Participant[]>([])
  useEffect(() => ses.watchAllParticipants(setParticipants), [])

  const rows = useMemo(() => ses.buildLeaderboard(participants), [participants])
  const podium = rows.slice(0, 3)

  const order = [1, 0, 2] // görsel podyum sırası: 2. – 1. – 3.
  const heights = ['h-24', 'h-36', 'h-16']

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-4xl px-5 py-12 sm:px-6"
    >
      <div className="mb-10">
        <p className="label">SIRALAMA ÇİZELGESİ</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Hata Avcıları
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Tüm amfi derslerinden toplanan puanlara göre genel sıralama
        </p>
        <div className="rule mt-8" />
      </div>

      {rows.length === 0 ? (
        <div className="file-card grid place-items-center p-16 text-center">
          <p className="label">KAYIT YOK</p>
          <p className="mt-4 text-sm text-ink-muted">
            Henüz hiçbir amfi dersi oynanmadı. İlk sırayı sen kap.
          </p>
        </div>
      ) : (
        <>
          {/* Podyum */}
          <div className="mb-14 flex items-end justify-center gap-3 sm:gap-6">
            {order.map((slot, visualIdx) => {
              const r = podium[slot]
              if (!r) return <div key={visualIdx} className="w-24 sm:w-32" />
              const isMe = r.studentId === user?.uid
              const isFirst = slot === 0

              return (
                <motion.div
                  key={r.studentId}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: visualIdx * 0.1, duration: 0.5, ease: EASE }}
                  className="flex w-24 flex-col items-center sm:w-36"
                >
                  {isFirst ? (
                    <span className="stamp-mark mb-3 animate-stamp">1.</span>
                  ) : (
                    <span className="mb-3 font-display text-2xl font-bold text-ink-faint">
                      {slot + 1}.
                    </span>
                  )}

                  <div
                    className={cx(
                      'grid h-12 w-12 place-items-center rounded-sm border-2 font-mono text-sm font-bold sm:h-14 sm:w-14',
                      isFirst
                        ? 'border-ink bg-ink text-paper'
                        : 'border-paper-edge bg-paper-card text-ink',
                    )}
                  >
                    {initials(r.studentName)}
                  </div>

                  <p className="mt-2.5 line-clamp-1 text-center text-xs font-semibold text-ink">
                    {r.studentName}
                    {isMe && <span className="text-mark"> (sen)</span>}
                  </p>
                  <p className="font-display text-lg font-bold text-ink">{r.totalScore}</p>

                  <div
                    className={cx(
                      'mt-3 w-full rounded-t-sm border border-b-0 border-paper-edge',
                      isFirst ? 'bg-paper-deep' : 'bg-paper-card',
                      heights[visualIdx],
                    )}
                  />
                </motion.div>
              )
            })}
          </div>

          {/* Tam çizelge.
              Mobilde sabit sütunlu tablo işe yaramıyor: 375px'te ad sütunu
              0 piksele çöküyordu. Küçük ekranda ders/isabet sayıları adın
              altına ikinci satır olarak iniyor. */}
          <div className="file-card overflow-hidden">
            <div className="hidden grid-cols-[40px_1fr_64px_72px_80px] gap-2 border-b border-paper-edge bg-paper-deep px-5 py-3 sm:grid">
              <span className="label">#</span>
              <span className="label">ÖĞRENCİ</span>
              <span className="label text-right">DERS</span>
              <span className="label text-right">İSABET</span>
              <span className="label text-right">PUAN</span>
            </div>

            {rows.map((r, i) => {
              const isMe = r.studentId === user?.uid
              return (
                <motion.div
                  key={r.studentId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 12) * 0.025 }}
                  className={cx(
                    'grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-paper-edge px-4 py-3.5 text-sm last:border-0',
                    'sm:grid-cols-[40px_1fr_64px_72px_80px] sm:px-5',
                    isMe && 'bg-flag-soft',
                  )}
                >
                  <span
                    className={cx(
                      'font-mono font-bold',
                      i < 3 ? 'text-ink' : 'text-ink-faint',
                    )}
                  >
                    {i + 1}
                  </span>

                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-[11px] font-bold text-ink">
                      {initials(r.studentName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {r.studentName}
                        {isMe && (
                          <span className="ml-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mark">
                            SEN
                          </span>
                        )}
                      </p>
                      {/* Mobilde sütun yok — sayılar adın altına */}
                      <p className="mt-0.5 font-mono text-[11px] text-ink-muted sm:hidden">
                        {r.sessions} ders · %{r.accuracy} isabet
                      </p>
                    </div>
                  </div>

                  <span className="hidden text-right font-mono text-ink-muted sm:block">
                    {r.sessions}
                  </span>
                  <span className="hidden text-right font-mono text-verify sm:block">
                    %{r.accuracy}
                  </span>
                  <span className="text-right font-display font-bold text-ink">
                    {r.totalScore}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}
