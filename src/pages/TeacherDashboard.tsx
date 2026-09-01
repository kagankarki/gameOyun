import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import TiltCard from '@/components/TiltCard'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import type { Lesson, LiveSession, Participant } from '@/lib/types'
import { cx, fmtDate, uid } from '@/lib/utils'
import { EASE } from '@/lib/motion'

export default function TeacherDashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [lessons, setLessons] = useState<Lesson[]>([])
  // İstatistikler amfi oturumlarından geliyor — tek kişilik mod kaldırıldı
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => api.watchLessons(setLessons), [])
  useEffect(() => ses.watchAllSessions(setSessions), [])
  useEffect(() => ses.watchAllParticipants(setParticipants), [])

  const mine = useMemo(
    () => lessons.filter((l) => l.teacherId === user?.uid || l.teacherId === 'seed_teacher'),
    [lessons, user],
  )

  /** Ders id → o derste açılmış oturumlar */
  const sessionsByLesson = useMemo(() => {
    const map = new Map<string, LiveSession[]>()
    for (const s of sessions) {
      const list = map.get(s.lessonId) ?? []
      list.push(s)
      map.set(s.lessonId, list)
    }
    return map
  }, [sessions])

  const stats = useMemo(() => {
    const lessonIds = new Set(mine.map((l) => l.id))
    const mineSessions = sessions.filter((s) => lessonIds.has(s.lessonId))
    const sessionIds = new Set(mineSessions.map((s) => s.id))
    const mineParts = participants.filter((p) => sessionIds.has(p.sessionId))

    // Aynı öğrenci birden çok derse girmiş olabilir; hesabı olmayanı adıyla say
    const students = new Set(mineParts.map((p) => p.studentId ?? `ad:${p.name.trim()}`))
    const hit = mineParts.reduce((s, p) => s + p.hits, 0)
    const chances = mineParts.reduce((s, p) => s + p.hits + p.misses, 0)

    return {
      lessons: mine.length,
      live: mine.filter((l) => l.isLive).length,
      traps: mine.reduce((s, l) => s + l.blocks.filter((b) => b.isWrong).length, 0),
      students: students.size,
      plays: mineSessions.length,
      rate: chances ? Math.round((hit / chances) * 100) : 0,
    }
  }, [mine, sessions, participants])

  const createLesson = async () => {
    if (!user) return
    const lesson: Lesson = {
      id: uid('lesson'),
      title: 'Yeni Ders',
      subject: 'Anatomi',
      description: 'Ders açıklamasını buradan düzenle.',
      teacherId: user.uid,
      teacherName: user.name,
      blocks: [],
      isLive: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await api.saveLesson(lesson)
    nav(`/hoca/ders/${lesson.id}`)
  }

  const toggleLive = async (l: Lesson) => {
    if (!l.isLive && l.blocks.filter((b) => b.isWrong).length === 0) {
      toast('Yayına almadan önce en az bir hatalı blok işaretlemelisin.', 'error')
      return
    }
    await api.saveLesson({ ...l, isLive: !l.isLive })
    toast(l.isLive ? 'Ders yayından kaldırıldı.' : 'Ders yayında! Öğrenciler girebilir.', 'success')
  }

  const remove = async (l: Lesson) => {
    if (!confirm(`"${l.title}" dersi ve tüm sonuçları silinsin mi?`)) return
    await api.deleteLesson(l.id)
    toast('Ders silindi.', 'info')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-7xl px-5 py-12 sm:px-6"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="label">ÖĞRETİM ÜYESİ PANELİ</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Merhaba, {user?.name}
          </h1>
        </div>
        <Button3D size="lg" icon="+" onClick={createLesson}>
          Yeni Ders Oluştur
        </Button3D>
      </div>

      {/* Künye şeridi */}
      <div className="mb-12 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge lg:grid-cols-5">
        {[
          { l: 'TOPLAM DERS', v: stats.lessons },
          { l: 'YAYINDA', v: stats.live },
          { l: 'GİZLİ HATA (TUZAK)', v: stats.traps },
          { l: 'KATILAN ÖĞRENCİ', v: stats.students },
          { l: 'YAKALAMA BAŞARISI', v: `%${stats.rate}` },
        ].map((s, i) => (
          <motion.div
            key={s.l}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-paper-card p-5"
          >
            <p className="font-display text-3xl font-bold text-ink">{s.v}</p>
            <p className="label mt-1 text-[11px] font-semibold">{s.l}</p>
          </motion.div>
        ))}
      </div>

      {/* Ders listesi */}
      {mine.length === 0 ? (
        <div className="file-card grid place-items-center p-16 text-center">
          <p className="label">DERS BULUNAMADI</p>
          <h3 className="mt-4 font-display text-xl font-bold text-ink">Henüz kayıtlı dersiniz yok</h3>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Yeni bir ders oluşturun, ders metnini cümle cümle ekleyin ve öğrencilerin bulması gereken
            hatalı cümleleri (tuzakları) işaretleyin.
          </p>
          <div className="mt-7">
            <Button3D onClick={createLesson}>İlk Dersi Oluştur</Button3D>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {mine.map((l, i) => {
            const traps = l.wrongBlocks?.length ?? l.blocks?.filter((b) => b.isWrong).length ?? 0
            const plays = sessionsByLesson.get(l.id)?.length ?? 0

            return (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3), ease: EASE }}
              >
                <TiltCard className="h-full">
                  <div
                    className={cx(
                      'file-card-tabbed flex h-full flex-col p-6',
                      l.isLive ? 'border-l-verify' : 'border-l-paper-edge',
                    )}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="label-chip border-paper-edge bg-paper-deep">
                        {(l.subject || 'DERS').toLocaleUpperCase('tr-TR')}
                      </span>
                      <span
                        className={cx(
                          'label-chip',
                          l.isLive
                            ? 'border-verify-edge bg-verify-soft text-verify'
                            : 'border-paper-edge bg-paper-deep text-ink-muted',
                        )}
                      >
                        {l.isLive ? 'ÖĞRENCİLERE AÇIK (YAYINDA)' : 'TASLAK'}
                      </span>
                    </div>

                    <h3 className="font-display text-lg font-bold leading-snug text-ink">
                      {l.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                      {l.description}
                    </p>

                    {/* Sayaçlar / İstatistik Kutusu */}
                    <div className="my-5 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge text-center">
                      {[
                        { label: 'PARAGRAF', val: l.blocks.length, hint: 'Toplam metin parçası' },
                        { label: 'GİZLİ HATA', val: traps, hint: 'Öğrencinin bulacağı tuzaklar' },
                        { label: 'OYNANMA', val: plays, hint: 'Açılan toplam canlı oturum' },
                      ].map((item) => (
                        <div key={item.label} className="bg-paper-card p-3" title={item.hint}>
                          <p className="font-display text-lg font-bold text-ink">{item.val}</p>
                          <p className="label mt-0.5 text-[10px] tracking-wider">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    <p className="mb-4 font-mono text-[11px] text-ink-faint">
                      Son Güncelleme: {fmtDate(l.updatedAt)}
                    </p>

                    {/* Dersi Başlatma ve Yönetim Butonları */}
                    <div className="mt-auto flex flex-col gap-2.5">
                      {/* 1. Sıra: Oyunu Başlatma Butonları */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button3D
                          size="sm"
                          tone="gold"
                          onClick={() => nav(`/hoca/amfi-setup/${l.id}`)}
                          disabled={traps === 0}
                          title={
                            traps === 0
                              ? 'Önce derse en az bir hatalı cümle/tuzak eklemelisiniz.'
                              : 'Yapay zeka sesli anlatır, öğrenciler tuzakları telefonundan yakalar.'
                          }
                          className="w-full text-xs"
                        >
                          🎙️ Canlı Amfi Başlat
                        </Button3D>
                        <Button3D
                          size="sm"
                          tone="ghost"
                          onClick={() => nav(`/hoca/amfi/${l.id}`)}
                          disabled={traps === 0}
                          title={
                            traps === 0
                              ? 'Önce derse en az bir hatalı cümle/tuzak eklemelisiniz.'
                              : 'Öğretmen ekrandan adım adım ilerletir (Sessiz mod).'
                          }
                          className="w-full text-xs"
                        >
                          ▶ Klasik Oynat
                        </Button3D>
                      </div>

                      {/* 2. Sıra: Yönetim ve Sonuç Butonları */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-paper-edge/60">
                        <Button3D
                          size="sm"
                          tone="primary"
                          onClick={() => nav(`/hoca/ders/${l.id}`)}
                          title="Ders metnini ve tuzak soruları düzenle"
                        >
                          ✏️ Düzenle
                        </Button3D>
                        <Button3D
                          size="sm"
                          tone="ghost"
                          onClick={() => nav(`/hoca/sonuclar/${l.id}`)}
                          title="Öğrenci puanları, başarı analizi ve Excel çıktısı"
                        >
                          📊 Sonuçlar
                        </Button3D>
                        <Button3D
                          size="sm"
                          tone={l.isLive ? 'ghost' : 'success'}
                          onClick={() => toggleLive(l)}
                          title={
                            l.isLive
                              ? 'Dersi öğrencilerin ana sayfasından gizle'
                              : 'Dersi öğrencilerin katılımına aç'
                          }
                        >
                          {l.isLive ? 'Yayını Kapat' : 'Yayına Al'}
                        </Button3D>
                        <button
                          onClick={() => remove(l)}
                          title="Dersi tamamen sil"
                          className="ml-auto rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-mark-soft hover:text-mark"
                        >
                          🗑️ Sil
                        </button>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
