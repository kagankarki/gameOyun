/**
 * HOCA — OTURUM RAPORU VE EXCEL İNDİRME EKRANI
 * Yol: /hoca/sonuclar/:id  (:id = ders id'si)
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import QuizComparison from '@/components/QuizComparison'
import { RatingSummary } from '@/components/Rating'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import type {
  Catch,
  Lesson,
  LiveSession,
  Participant,
  QuizAnswer,
  SessionRating,
  SessionSecret,
  SurveyResponse,
} from '@/lib/types'
import { useToast } from '@/components/Toast'
import { altBoyutOrtalamalari, CALISMA_BASLIGI } from '@/lib/survey'
import { exportSessionToExcel } from '@/lib/exportExcel'
import { cx, fmtDate, initials } from '@/lib/utils'

export default function LiveResults() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const sessionParam = searchParams.get('sessionId')
  const nav = useNavigate()
  const toast = useToast()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [catches, setCatches] = useState<Catch[]>([])
  const [secret, setSecret] = useState<SessionSecret | null>(null)
  const [surveys, setSurveys] = useState<SurveyResponse[]>([])
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([])
  const [ratings, setRatings] = useState<SessionRating[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    api.getLesson(id).then(async (l) => {
      if (!alive) return
      if (l) {
        setLesson(l)
        setLoading(false)
      } else {
        // Parametre olarak sessionId gönderilmiş olabilir
        const s = await ses.getSession(id).catch(() => null)
        if (s?.lessonId) {
          const l2 = await api.getLesson(s.lessonId).catch(() => null)
          if (alive && l2) setLesson(l2)
        }
        if (alive) setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    return ses.watchAllSessions((all) => {
      setSessions(
        all.filter(
          (s) => s.lessonId === id || s.id === id || (lesson?.id && s.lessonId === lesson.id),
        ),
      )
    })
  }, [id, lesson?.id])

  /** Oturum: URL'den gelen veya en son oluşturulan oturum */
  const picked: LiveSession | null = useMemo(() => {
    if (sessionParam) {
      const found = sessions.find((s) => s.id === sessionParam)
      if (found) return found
    }
    return sessions[0] ?? null
  }, [sessions, sessionParam])

  useEffect(() => {
    if (!picked) return
    const a = ses.watchParticipants(picked.id, setParticipants)
    const b = ses.watchCatches(picked.id, setCatches)
    const c = ses.watchRatings(picked.id, setRatings)
    const d = ses.watchSessionSecret(picked.id, setSecret)
    const e = ses.watchSurveys(picked.id, setSurveys)
    const f = ses.watchQuizAnswers(picked.id, setQuizAnswers)
    return () => {
      a()
      b()
      c()
      d()
      e()
      f()
    }
  }, [picked?.id])

  /** Hata bazlı: kaçı yakaladı, ek soruyu kaçı bildi? */
  const perWrong = useMemo(() => {
    let wrongs = secret?.wrongBlocks ?? lesson?.wrongBlocks ?? []
    if (wrongs.length === 0 && lesson?.blocks?.length) {
      wrongs = lesson.blocks
        .filter((b) => b.isWrong)
        .map((b, idx) => ({
          blockIndex: idx,
          text: b.text,
          explanation: '',
          correction: b.correction || '',
          points: 100,
          start: 0,
          end: b.text.length,
          difficulty: 'orta',
        }))
    }
    return wrongs.map((w, i) => {
      const hits = catches.filter(
        (c) => c.status === 'hit' && (c.wrongIndex === i || c.wrongIndex === w.blockIndex),
      )
      const cevaplanan = hits.filter((c) => c.answerCorrect !== undefined)
      const dogru = cevaplanan.filter((c) => c.answerCorrect).length
      const pct = participants.length ? Math.round((hits.length / participants.length) * 100) : 0
      return { wrong: w, valid: hits.length, pct, cevaplanan: cevaplanan.length, dogru }
    })
  }, [secret, lesson, catches, participants])

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
    const totalPossible = participants.length * (picked?.wrongCount || lesson?.wrongBlocks?.length || 1)
    const rate = chances
      ? Math.round((hits / chances) * 100)
      : totalPossible
        ? Math.round((hits / totalPossible) * 100)
        : 0
    return {
      students: participants.length,
      avg,
      rate,
    }
  }, [participants, picked, lesson])

  const ranked = useMemo(
    () => [...participants].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt),
    [participants],
  )

  const handleExport = () => {
    if (!lesson) return
    const activeSession: LiveSession = picked || {
      id: 'session_export',
      code: 'GENEL',
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      teacherId: lesson.teacherId,
      teacherName: lesson.teacherName,
      phase: 'ended',
      mode: 'capture',
      version: 2,
      readingMode: 'continuous',
      segments: [],
      wrongCount: lesson.wrongBlocks?.length || 0,
      pretestCount: lesson.pretest?.length || 0,
      posttestCount: lesson.posttest?.length || 0,
      activeQuiz: null,
      audio: null,
      scriptLength: lesson.script?.length || 0,
      currentBlockIndex: 0,
      blockStartedAt: 0,
      blockDurationMs: 0,
      blockEstimateMs: 0,
      graceEndsAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    exportSessionToExcel({
      lesson,
      session: activeSession,
      participants,
      catches,
      secret: secret || {
        sessionId: activeSession.id,
        teacherId: lesson.teacherId,
        script: lesson.script || '',
        wrongBlocks: lesson.wrongBlocks || [],
      },
      surveys,
      ratings,
      quizAnswers,
    })
    toast('Excel raporu başarıyla indirildi.', 'success')
  }

  if (loading) return <Loader label="Rapor getiriliyor…" />

  if (!lesson) {
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
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-6xl px-5 py-12 sm:px-6"
    >
      {/* Üst Navigasyon */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => nav('/hoca')}
          className="rounded-sm text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          ← Panele dön
        </button>
      </div>

      {/* Başlık Alanı & Excel İndirme Butonu */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 rounded-sm border border-paper-edge bg-paper-card p-6 shadow-sm">
        <div>
          <span className="label-chip border-paper-edge bg-paper-deep text-ink">
            {lesson.subject?.toUpperCase() || 'DERS'} · OTURUM RAPORU
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {lesson.title}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Öğretim Üyesi: {lesson.teacherName}
            {picked?.code && ` · Oturum PIN: ${picked.code}`}
          </p>
        </div>

        <Button3D tone="success" size="md" onClick={handleExport} className="shrink-0 shadow-md">
          📥 Excel Raporu İndir (.xlsx)
        </Button3D>
      </div>

      {/* Özet Künyesi */}
      <div className="mb-12 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge lg:grid-cols-4">
        {(
          [
            ['KATILAN ÖĞRENCİ', summary.students],
            ['GİZLİ HATA', picked?.wrongCount ?? (lesson.wrongBlocks?.length || 0)],
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

      {/* Hata Analizi */}
      <section className="mb-14">
        <div className="mb-5 flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Hata Analizi
          </h2>
          <span className="text-sm text-ink-muted">— Hangi hatayı kaç öğrenci yakaladı</span>
        </div>

        {perWrong.length === 0 ? (
          <div className="file-card p-8 text-center text-sm text-ink-muted">
            Bu derste işaretlenmiş hata bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {perWrong.map(({ wrong, valid, pct, cevaplanan, dogru }, i) => (
              <div key={i} className="file-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-mark-soft font-mono text-xs font-bold text-mark">
                      #{i + 1}
                    </span>
                    <div>
                      <p className="font-medium text-ink">"{wrong.text}"</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Doğrusu: <span className="text-verify">{wrong.correction || 'Belirtilmemiş'}</span> · Zorluk: {wrong.difficulty?.toUpperCase() || 'ORTA'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-display text-xl font-bold text-ink">
                      {valid}
                      <span className="text-xs font-normal text-ink-muted">
                        /{participants.length}
                      </span>
                    </span>
                    <p className="font-mono text-xs text-ink-muted">%{pct}</p>
                  </div>
                </div>

                {wrong.followUp && (
                  <div className="mt-3 border-t border-paper-edge pt-3 text-xs text-ink-muted">
                    <span className="font-semibold text-ink">5 Şıklı Ek Soru:</span> "{wrong.followUp.question}" —{' '}
                    <span className="text-verify font-medium">{dogru}/{cevaplanan} kişi bildi</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Katılımcı Sıralaması */}
      <section className="mb-14">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Öğrenci Sıralaması
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Puan = Hata yakalama tabanı (100) + Hız bonusu (0–50) + Ek soru (50) - Yanlış basış (-50)
            </p>
          </div>
          <span className="label">{participants.length} ÖĞRENCİ</span>
        </div>

        {participants.length === 0 ? (
          <div className="file-card p-8 text-center text-sm text-ink-muted">
            Bu oturuma henüz katılan öğrenci bulunmuyor.
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

      {/* Ön test → son test: dersin ölçülebilir çıktısı */}
      {quizAnswers.length > 0 && (
        <section className="mt-8">
          <QuizComparison participants={participants} quizAnswers={quizAnswers} />
        </section>
      )}

      {/* Yıldız Değerlendirmeleri */}
      <RatingSummary ratings={ratings} />

      {/* Araştırma Anketi */}
      <section className="mt-8">
        <div className="file-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="label font-bold">ARAŞTIRMA ANKETİ</p>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
                {CALISMA_BASLIGI}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Alt boyut ortalamaları (1–5) · Ters maddeler çevrilmiş
              </p>
            </div>
            <span className="label">{surveys.length} YANIT</span>
          </div>

          {surveys.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Henüz anket yanıtı bulunmuyor.
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              {boyutlar.map((b) => (
                <div key={b.kod} className="flex items-center gap-3 rounded-sm bg-paper-deep/60 px-3 py-2">
                  <span className="w-5 shrink-0 font-mono text-xs font-bold text-ink-muted">
                    {b.kod}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{b.baslik}</p>
                    <p className="font-mono text-[10px] text-ink-faint">Madde {b.maddeAraligi}</p>
                  </div>
                  <div className="hidden h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-paper-deep sm:block">
                    <div
                      className="h-full bg-verify rounded-full transition-all"
                      style={{ width: `${(b.ortalama / 5) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-display text-sm font-bold text-ink">
                    {b.ortalama.toFixed(2)}
                    <span className="text-[10px] font-normal text-ink-muted">/5</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </motion.div>
  )
}
