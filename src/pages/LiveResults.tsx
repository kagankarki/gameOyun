/**
 * HOCA — OTURUM RAPORU
 * Yol: /hoca/sonuclar/:id  (:id = ders id'si)
 *
 * Tek kişilik mod kaldırıldığı için rapor artık `attempts` üzerinden değil,
 * dersin AMFİ OTURUMLARI üzerinden çıkıyor. Birden çok oturum açıldıysa
 * (farklı şubeler, tekrar dersi) üstteki seçiciyle geçiş yapılır.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { RatingSummary } from '@/components/Rating'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import type {
  Catch,
  Lesson,
  LiveSession,
  Participant,
  SessionRating,
  SessionSecret,
  SurveyResponse,
} from '@/lib/types'
import { altBoyutOrtalamalari } from '@/lib/survey'
import { cx, fmtDate, initials, scoreTone } from '@/lib/utils'

export default function LiveResults() {
  const { id } = useParams()
  const nav = useNavigate()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [catches, setCatches] = useState<Catch[]>([])
  const [secret, setSecret] = useState<SessionSecret | null>(null)
  const [surveys, setSurveys] = useState<SurveyResponse[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getLesson(id).then((l) => {
      setLesson(l)
      setLoading(false)
    })
  }, [id])

  useEffect(
    () => ses.watchAllSessions((all) => setSessions(all.filter((s) => s.lessonId === id))),
    [id],
  )

  /** Seçim yoksa en yeni oturum */
  const picked = useMemo(
    () => sessions.find((s) => s.id === pickedId) ?? sessions[0] ?? null,
    [sessions, pickedId],
  )

  useEffect(() => {
    if (!picked) return
    const a = ses.watchParticipants(picked.id, setParticipants)
    const b = ses.watchCatches(picked.id, setCatches)
    const c = ses.watchRatings(picked.id, setRatings)
    const d = ses.watchSessionSecret(picked.id, setSecret)
    const e = ses.watchSurveys(picked.id, setSurveys)
    return () => {
      a()
      b()
      c()
      d()
      e()
    }
  }, [picked?.id])

  /** Hata bazlı: kaçı yakaladı, ek soruyu kaçı bildi? */
  const perWrong = useMemo(() => {
    const wrongs = secret?.wrongBlocks ?? []
    return wrongs.map((w, i) => {
      const hits = catches.filter((c) => c.status === 'hit' && c.wrongIndex === i)
      const cevaplanan = hits.filter((c) => c.answerCorrect !== undefined)
      const dogru = cevaplanan.filter((c) => c.answerCorrect).length
      const pct = participants.length ? Math.round((hits.length / participants.length) * 100) : 0
      return { wrong: w, valid: hits.length, pct, cevaplanan: cevaplanan.length, dogru }
    })
  }, [secret, catches, participants])

  /** Anket alt boyut ortalamaları — araştırmacı için */
  const boyutlar = useMemo(
    () => (surveys.length ? altBoyutOrtalamalari(surveys.map((s) => s.likert)) : []),
    [surveys],
  )

  const summary = useMemo(() => {
    const hits = participants.reduce((s, p) => s + p.hits, 0)
    const chances = participants.reduce((s, p) => s + p.hits + p.misses, 0)
    const avg = participants.length
      ? Math.round(participants.reduce((s, p) => s + p.score, 0) / participants.length)
      : 0
    return {
      students: participants.length,
      avg,
      rate: chances ? Math.round((hits / chances) * 100) : 0,
    }
  }, [participants])

  if (loading) return <Loader label="Rapor getiriliyor…" />

  if (!lesson)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">DOSYA BULUNAMADI</p>
          <div className="mt-6">
            <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )

  const ranked = [...participants].sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-6xl px-5 py-12 sm:px-6"
    >
      <button
        onClick={() => nav('/hoca')}
        className="mb-6 rounded-sm text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        ← Panele dön
      </button>

      <div className="mb-8">
        <p className="label">OTURUM RAPORU</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {lesson.title}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{lesson.teacherName}</p>
        <div className="rule mt-8" />
      </div>

      {!picked ? (
        <div className="file-card grid place-items-center p-16 text-center">
          <p className="label">OTURUM YOK</p>
          <h3 className="mt-4 font-display text-xl font-bold text-ink">
            Bu ders henüz amfide işlenmedi
          </h3>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Amfi oturumu açıp dersi işlediğinde sonuçlar buraya düşecek.
          </p>
          <div className="mt-7">
            <Button3D onClick={() => nav(`/hoca/amfi-setup/${lesson.id}`)}>
              Amfi Oturumu Aç
            </Button3D>
          </div>
        </div>
      ) : (
        <>
          {/* Oturum seçici — birden çok kez işlendiyse */}
          {sessions.length > 1 && (
            <div className="mb-8">
              <p className="label mb-2">OTURUM SEÇ</p>
              <div className="flex flex-wrap gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPickedId(s.id)}
                    className={cx(
                      'label-chip transition-colors',
                      s.id === picked.id
                        ? 'border-ink bg-ink text-paper'
                        : 'border-paper-edge bg-paper-deep hover:border-ink',
                    )}
                  >
                    {s.code} · {fmtDate(s.createdAt)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Özet künyesi */}
          <div className="mb-12 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge lg:grid-cols-4">
            {(
              [
                ['KATILAN ÖĞRENCİ', summary.students],
                ['GİZLİ HATA', picked.wrongCount],
                ['ORTALAMA PUAN', summary.avg],
                ['HATA YAKALAMA', `%${summary.rate}`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-paper-card p-5">
                <p className="font-display text-3xl font-bold text-ink">{v}</p>
                <p className="label mt-1">{k}</p>
              </div>
            ))}
          </div>

          {/* Hata analizi */}
          <section className="mb-14">
            <div className="mb-5 flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                Hata analizi
              </h2>
              <span className="text-sm text-ink-muted">— hangi hatayı kaç kişi yakaladı</span>
            </div>

            {perWrong.length === 0 ? (
              <div className="file-card p-8 text-center text-sm text-ink-muted">
                Bu oturumda işaretlenmiş hata yok.
              </div>
            ) : (
              <div className="space-y-3">
                {perWrong.map(({ wrong, valid, pct, cevaplanan, dogru }, i) => (
                  <div key={i} className="file-card-tabbed border-l-mark p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[11px] font-medium text-ink-faint">
                        HATA {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="label-chip border-mark-edge bg-mark-soft text-mark">
                        {wrong.points ?? 100} PUAN
                      </span>
                      {cevaplanan > 0 && (
                        <span className="label-chip border-verify-edge bg-verify-soft text-verify">
                          EK SORU: {dogru}/{cevaplanan} DOĞRU
                        </span>
                      )}
                      <span className="ml-auto font-mono text-sm">
                        <span className={cx('font-bold', scoreTone(pct))}>{valid}</span>
                        <span className="text-ink-muted">
                          {' '}
                          / {participants.length} kişi · %{pct}
                        </span>
                      </span>
                    </div>

                    <p className="mark-underline text-[15px] leading-relaxed text-ink">
                      {wrong.text}
                    </p>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full bg-verify transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p className="marginalia mt-4">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                        DOĞRUSU
                      </span>
                      <br />
                      {wrong.correction || wrong.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Öğrenci çizelgesi */}
          <section className="mb-14">
            <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-ink">
              Öğrenci sonuçları
            </h2>

            {ranked.length === 0 ? (
              <div className="file-card grid place-items-center p-14 text-center">
                <p className="label">KATILIM YOK</p>
                <p className="mt-4 max-w-md text-sm text-ink-muted">
                  Bu oturuma kimse katılmamış.
                </p>
              </div>
            ) : (
              <div className="file-card overflow-hidden">
                <div className="hidden grid-cols-[40px_1fr_repeat(4,88px)] gap-2 border-b border-paper-edge bg-paper-deep px-6 py-3 sm:grid">
                  <span className="label">#</span>
                  <span className="label">ÖĞRENCİ</span>
                  <span className="label text-right">DOĞRU</span>
                  <span className="label text-right">KAÇAN</span>
                  <span className="label text-right">BOŞ</span>
                  <span className="label text-right">PUAN</span>
                </div>

                {/* Mobilde sütun başlıkları görünmediği için sayılar
                    çıplak kalıyordu (3 · 0 · 0 · 220). Küçük ekranda her
                    sayı kendi etiketiyle birlikte gösteriliyor. */}
                {ranked.map((p, i) => (
                  <div
                    key={p.id}
                    className="border-b border-paper-edge px-5 py-4 text-sm last:border-0 sm:grid sm:grid-cols-[40px_1fr_repeat(4,88px)] sm:items-center sm:gap-2 sm:px-6"
                  >
                    <span
                      className={cx(
                        'hidden font-mono font-bold sm:block',
                        i < 3 ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {i + 1}
                    </span>

                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-[11px] font-bold text-ink">
                        {initials(p.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          <span className="font-mono text-ink-faint sm:hidden">{i + 1}. </span>
                          {p.name}
                        </p>
                        <p className="font-mono text-[11px] text-ink-faint">
                          {fmtDate(p.joinedAt)}
                        </p>
                      </div>
                      <span className="font-display text-lg font-bold text-ink sm:hidden">
                        {p.score}
                      </span>
                    </div>

                    {/* Mobil: etiketli sayı şeridi */}
                    <div className="mt-2.5 flex gap-4 pl-11 font-mono text-[11px] sm:hidden">
                      <span className="text-verify">{p.hits} doğru</span>
                      <span className="text-flag">{p.misses} kaçan</span>
                      <span className="text-mark">{p.falseAlarms} boş</span>
                    </div>

                    {/* Masaüstü: sütunlar */}
                    <span className="hidden text-right font-mono text-verify sm:block">
                      {p.hits}
                    </span>
                    <span className="hidden text-right font-mono text-flag sm:block">
                      {p.misses}
                    </span>
                    <span className="hidden text-right font-mono text-mark sm:block">
                      {p.falseAlarms}
                    </span>
                    <span className="hidden text-right font-display font-bold text-ink sm:block">
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <RatingSummary ratings={ratings} />

          {/* Araştırma anketi — alt boyut ortalamaları */}
          <section className="mt-8">
            <div className="file-card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="label font-bold">ARAŞTIRMA ANKETİ</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Alt boyut ortalamaları (1–5) · ters maddeler çevrilmiş
                  </p>
                </div>
                <span className="label">{surveys.length} YANIT</span>
              </div>

              {surveys.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Henüz anket yanıtı yok.
                </p>
              ) : (
                <>
                  <div className="mt-5 space-y-2">
                    {boyutlar.map((b) => (
                      <div key={b.kod} className="flex items-center gap-3">
                        <span className="w-5 shrink-0 font-mono text-xs font-bold text-ink-muted">
                          {b.kod}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {b.baslik}
                        </span>
                        <div className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-sm bg-paper-deep sm:block">
                          <div
                            className="h-full bg-verify"
                            style={{ width: `${(b.ortalama / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-display font-bold text-ink">
                          {b.ortalama.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-5 rounded-sm bg-paper-deep p-3 text-xs leading-relaxed text-ink-muted">
                    Alt boyutlar ayrı değerlendirilir; faktör yapısı doğrulanmadan tek bir
                    “anket puanı” üretilmesi önerilmez. Bu sayılar algısal ikincil sonuçtur —
                    hata tespit doğruluğu ve reaksiyon süresinin yerine geçmez.
                  </p>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </motion.div>
  )
}
