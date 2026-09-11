/**
 * Amfi — HOCA HAZIRLIK EKRANI
 * Yol: /hoca/amfi-setup/:lessonId
 *
 * Metin PARÇALARA BÖLÜNMEZ. Hoca notu yapıştırır, yanlış yerleri fareyle
 * seçer; ders sırasında metnin tamamı tek seferde okunur. Öğrenci hangi
 * hataya bastığı, okuma sırasında tutulan karakter/zaman çizelgesinden
 * hesaplanır (bkz. AmfiHostV2).
 *
 * Her hataya, yakalayan öğrenciye sorulacak bir çoktan seçmeli soru
 * eklenebilir. Sorular BURADA hazırlanır — ders sırasında yapay zekâya
 * gidilmez.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import AudioUploader from '@/components/AudioUploader'
import QuizUploader from '@/components/QuizUploader'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import * as ses from '@/lib/session'
import { generateFollowUp, isGeminiConfigured, type Zorluk } from '@/lib/gemini'
import { ara, cumleAraligi, reanchorWrongs, trimRange, type Eslesme } from '@/lib/marking'
import { kunye, sureMetni, videoKunye, type DersSesi, type DersVideosu } from '@/lib/audioStore'
import { EASE } from '@/lib/motion'
import type { FollowUpQuestion, Lesson, QuizQuestion, WrongBlock } from '@/lib/types'
import { cx } from '@/lib/utils'

/** Yeni bir hata işaretlenirken formun başlangıç hâli (5 şıklı) */
const BOS_SORU: FollowUpQuestion = {
  question: '',
  options: ['', '', '', '', ''],
  correctIndex: 0,
  bonus: 50,
  difficulty: 'orta',
}

const formatSec = (s: number) => {
  const sn = Math.max(0, Math.floor(s || 0))
  const m = Math.floor(sn / 60)
  const rem = sn % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

const parseMmSs = (str: string): number => {
  if (!str) return 0
  if (str.includes(':')) {
    const parts = str.split(':').map((x) => Number(x) || 0)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
  }
  return Number(str) || 0
}

export default function AmfiSetup() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const areaRef = useRef<HTMLTextAreaElement>(null)
  const videoPlayerRef = useRef<HTMLVideoElement>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [script, setScript] = useState('')
  const [wrongs, setWrongs] = useState<WrongBlock[]>([])
  /* Ön test / son test — ders akışının iki ucundaki ölçümler */
  const [pretest, setPretest] = useState<QuizQuestion[]>([])
  const [posttest, setPosttest] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  /* Seçim + form */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [correction, setCorrection] = useState('')
  const [soru, setSoru] = useState<FollowUpQuestion>(BOS_SORU)
  const [soruAcik, setSoruAcik] = useState(false)
  const [zorluk, setZorluk] = useState<Zorluk>('orta')
  const [uretiliyor, setUretiliyor] = useState(false)

  /* Metinde arama — uzun notta hatayı gözle aramak yerine */
  const [arama, setArama] = useState('')
  /* Hocanın kendi ses kaydı — dosya bu cihazda saklanır (AudioUploader) */
  const [sesKaydi, setSesKaydi] = useState<DersSesi | null>(null)
  /* Hocanın yüklediği video kaydı — dosya bu cihazda saklanır */
  const [videoKaydi, setVideoKaydi] = useState<DersVideosu | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0)
  const [videoTimeInput, setVideoTimeInput] = useState<string>('00:00')
  const [videoText, setVideoText] = useState<string>('')

  /** Metin düzenlenirken yeri bulunamayıp düşen işaretler */
  const [dusenler, setDusenler] = useState<string[]>([])

  /* Video URL yönetimi */
  useEffect(() => {
    if (!videoKaydi) {
      setVideoUrl(null)
      return
    }
    const u = URL.createObjectURL(videoKaydi.blob)
    setVideoUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [videoKaydi])

  /* ── Dersi getir, notu ön-doldur ── */
  useEffect(() => {
    if (!lessonId) return
    let alive = true
    api.getLesson(lessonId).then((l) => {
      if (!alive) return
      setLesson(l)
      if (l?.script) {
        setScript(l.script)
      } else if (l?.blocks?.length) {
        setScript(l.blocks.map((b) => b.text).join('\n\n'))
      }
      if (l?.wrongBlocks?.length) {
        setWrongs(l.wrongBlocks)
      }
      // Testler derse kayıtlı — bir sonraki oturumda yeniden yüklemek gerekmesin
      if (l?.pretest?.length) setPretest(l.pretest)
      if (l?.posttest?.length) setPosttest(l.posttest)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [lessonId])

  const selectedText = selection ? script.slice(selection.start, selection.end).trim() : ''

  /** Arama sonuçları — işaretli olanlar ayrıca gösteriliyor */
  const eslesmeler = useMemo<Eslesme[]>(() => ara(script, arama, wrongs), [script, arama, wrongs])

  /**
   * Arama sonucuna tıklayınca o aralığı seç: textarea'da gerçekten
   * seçili hâle getiriyoruz ki hoca nereye baktığını görsün.
   */
  /**
   * Arama sonucundan doğrudan tuzağa: eşleşmenin geçtiği CÜMLEYİ seçer.
   * Tuzak tek bir kelime değil, öğrencinin duyup yakalayacağı bir ifadedir;
   * hocayı metinde fareyle cümle avlamaya zorlamıyoruz.
   */
  const eslesmeyiIsaretle = (m: Eslesme) => {
    const c = cumleAraligi(script, m.start, m.end)
    setSelection(c)
    const el = areaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(c.start, c.end)
    }
    // Form listenin altında açılıyor — hoca aramayı bırakıp oraya baksın
    setTimeout(
      () => document.getElementById('isaretleme-formu')?.scrollIntoView({ block: 'center' }),
      80,
    )
  }

  const eslesmeyeGit = (m: Eslesme) => {
    setSelection({ start: m.start, end: m.end })
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(m.start, m.end)
    // Seçili yeri görünür alana getir: kaba ama textarea'da tek yol
    const oran = script.length ? m.start / script.length : 0
    el.scrollTop = Math.max(0, oran * el.scrollHeight - el.clientHeight / 2)
  }

  /** Seçim mevcut bir işaretle çakışıyor mu? */
  const cakisan = useMemo(() => {
    if (!selection) return null
    return wrongs.find((w) => selection.start < w.end && selection.end > w.start) ?? null
  }, [selection, wrongs])

  /**
   * Seçimi textarea'nın kendi imleç konumundan okuyoruz — window.getSelection()
   * bir textarea'nın İÇİNDEKİ metni görmez. React'in onSelect'i pencere odakta
   * değilken tetiklenmediği için fare/klavye olaylarına da bağlıyoruz.
   */
  const readSelection = () => {
    const el = areaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    if (start === null || end === null || start === end) return
    // Fare seçimi neredeyse her zaman baştan/sondan boşluk kapıyor.
    // Aralığı kırpmazsak kaydedilen (kırpılmış) metinle örtüşmüyor ve
    // işaret ilk metin düzenlemesinde kayboluyordu.
    const kirpik = trimRange(script, start, end)
    if (kirpik.start === kirpik.end) return
    setSelection(kirpik)
  }

  const formuTemizle = () => {
    setSelection(null)
    setExplanation('')
    setCorrection('')
    setSoru(BOS_SORU)
    setSoruAcik(false)
    setZorluk('orta')
    setVideoText('')
  }

  const saniyeyiAl = () => {
    if (!videoPlayerRef.current) return
    const cur = Math.floor(videoPlayerRef.current.currentTime)
    setVideoTimeInput(formatSec(cur))
    toast(`Videonun ${formatSec(cur)} saniyesi seçildi.`, 'info')
  }

  const uret = async (isForVideo?: boolean) => {
    const targetText = isForVideo ? (videoText.trim() || explanation.trim()) : selectedText
    if (!targetText || !explanation.trim()) {
      toast('Önce hatanın ne olduğunu yaz — soruyu ona göre üretiyor.', 'error')
      return
    }
    setUretiliyor(true)
    try {
      const r = await generateFollowUp({
        wrongText: targetText,
        explanation: explanation.trim(),
        correction: correction.trim(),
        zorluk,
        lessonTitle: lesson?.title,
      })
      if (r.error || !r.question) {
        toast(r.error ?? 'Soru üretilemedi.', 'error')
        return
      }
      const opts = [...r.question.options]
      while (opts.length < 5) opts.push('')

      setSoru({
        ...r.question,
        options: opts.slice(0, 5),
        difficulty: zorluk,
      })
      setSoruAcik(true)
      const modelName = r.modelUsed ? ` (${r.modelUsed})` : ''
      toast(`5 şıklı soru üretildi${modelName} — kontrol edip düzeltebilirsin.`, 'success')
    } finally {
      setUretiliyor(false)
    }
  }

  const videoHataEkle = () => {
    if (!explanation.trim()) {
      toast('Lütfen bu saniyedeki bilginin neden yanlış olduğunu belirt.', 'error')
      return
    }

    const secStart = parseMmSs(videoTimeInput)

    const sikDolu = soru.options.filter((o) => o.trim()).length
    const followUp =
      soruAcik && soru.question.trim() && sikDolu >= 2
        ? {
            question: soru.question.trim(),
            options: soru.options.map((o) => o.trim()).filter(Boolean),
            correctIndex: Math.min(soru.correctIndex, sikDolu - 1),
            bonus: soru.bonus,
            difficulty: zorluk,
          }
        : undefined

    const label = videoText.trim() || `⏱️ ${formatSec(secStart)} Tuzak`

    const w: WrongBlock = {
      blockIndex: wrongs.length,
      text: label,
      explanation: explanation.trim(),
      correction: correction.trim(),
      points: 100,
      start: 0,
      end: 0,
      videoTimestamp: secStart,
      difficulty: zorluk,
      ...(followUp ? { followUp } : {}),
    }

    setWrongs((list) =>
      [...list, w]
        .sort((a, b) => (a.videoTimestamp ?? a.start) - (b.videoTimestamp ?? b.start))
        .map((x, i) => ({ ...x, blockIndex: i })),
    )

    toast(
      `⏱️ ${formatSec(secStart)} saniyesine ${wrongs.length + 1}. tuzak eklendi${followUp ? ' (soruyla)' : ''}.`,
      'success',
    )
    formuTemizle()
  }

  const ekle = () => {
    if (!selection || !explanation.trim()) return
    if (cakisan) {
      toast('Bu yer zaten işaretli. Önce onu sil.', 'error')
      return
    }

    // Soru yalnızca metni ve en az iki dolu şıkkı varsa kaydedilir
    const sikDolu = soru.options.filter((o) => o.trim()).length
    const followUp =
      soruAcik && soru.question.trim() && sikDolu >= 2
        ? {
            question: soru.question.trim(),
            options: soru.options.map((o) => o.trim()).filter(Boolean),
            correctIndex: Math.min(soru.correctIndex, sikDolu - 1),
            bonus: soru.bonus,
            difficulty: zorluk,
          }
        : undefined

    const w: WrongBlock = {
      blockIndex: wrongs.length,
      text: selectedText,
      explanation: explanation.trim(),
      correction: correction.trim(),
      points: 100,
      start: selection.start,
      end: selection.end,
      difficulty: zorluk,
      ...(followUp ? { followUp } : {}),
    }

    setWrongs((list) =>
      [...list, w].sort((a, b) => a.start - b.start).map((x, i) => ({ ...x, blockIndex: i })),
    )
    toast(
      `${wrongs.length + 1}. hata işaretlendi. İstediğin kadar ekleyebilirsin.`,
      'success',
    )
    formuTemizle()
  }

  const silIndex = (indexToRemove: number) => {
    setWrongs((list) =>
      list.filter((_, i) => i !== indexToRemove).map((x, i) => ({ ...x, blockIndex: i })),
    )
    toast('Tuzak silindi.', 'info')
  }

  const sil = (startPos: number) => {
    setWrongs((list) =>
      list.filter((w) => w.start !== startPos).map((x, i) => ({ ...x, blockIndex: i })),
    )
    toast('Çakışan tuzak silindi.', 'info')
  }

  /**
   * Metin değişince karakter aralıkları kayar.
   */
  useEffect(() => {
    setWrongs((list) => {
      if (!list.length) return list
      const hasTextWrongs = list.some((w) => w.videoTimestamp === undefined)
      if (!hasTextWrongs) return list
      const { wrongs: yeni, tasinan, dusen } = reanchorWrongs(script, list)
      if (dusen.length) {
        setDusenler(dusen)
      } else if (tasinan.length) {
        setDusenler([])
      }
      const degisti =
        yeni.length !== list.length ||
        yeni.some((w, i) => w.start !== list[i]?.start || w.end !== list[i]?.end)
      return degisti ? yeni : list
    })
  }, [script])

  const baslat = async () => {
    if (!lesson || !user) return
    if (!videoKaydi && !script.trim()) {
      toast('Önce ders notunu gir.', 'error')
      return
    }
    if (!wrongs.length) {
      toast('En az bir tuzak eklemelisin.', 'error')
      return
    }

    // Yarım kalmış sorular (metni ya da şıkları eksik) teste girmesin
    const temizle = (list: QuizQuestion[]) =>
      list
        .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
        .filter((q) => q.question.trim() && q.options.length >= 2)
        .map((q) => ({ ...q, correctIndex: Math.min(q.correctIndex, q.options.length - 1) }))

    const on = temizle(pretest)
    const son = temizle(posttest)

    if (pretest.length !== on.length || posttest.length !== son.length) {
      const atilan = pretest.length - on.length + (posttest.length - son.length)
      if (
        !window.confirm(
          `${atilan} soru eksik (soru metni ya da en az 2 şık gerekiyor) ve teste alınmayacak. Devam edeyim mi?`,
        )
      )
        return
    }

    setBusy(true)
    try {
      // Testler derse de yazılıyor: bir sonraki oturumda hazır gelsinler
      await api.saveLesson({ ...lesson, script, wrongBlocks: wrongs, pretest: on, posttest: son })

      const session = await ses.createSession(lesson, user.uid, user.name, {
        version: 2,
        readingMode: 'continuous',
        script: script || (videoKaydi ? 'Ders Videosu' : ''),
        wrongBlocks: wrongs,
        pretest: on,
        posttest: son,
        audio: sesKaydi ? kunye(sesKaydi) : null,
        video: videoKaydi ? videoKunye(videoKaydi) : null,
      })
      navigate(`/hoca/amfi-host-v2/${lesson.id}?sessionId=${session.id}`)
    } catch (err) {
      toast((err as Error).message || 'Oturum açılamadı.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader label="Ders yükleniyor…" />

  if (!lesson)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="file-card p-10 text-center">
          <p className="label">DERS BULUNAMADI</p>
          <div className="mt-6">
            <Button3D onClick={() => navigate('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )

  const soruluSayi = wrongs.filter((w) => w.followUp).length
  const okumaDk = Math.max(1, Math.round(ses.estimateReadMs(script) / 60000))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto min-h-[calc(100dvh-68px)] max-w-4xl space-y-6 px-5 py-10 sm:px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <p className="label">AMFİ HAZIRLIK</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          {lesson.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Ders notunu yapıştır, yanlış yerleri fareyle seçip işaretle. Ders sırasında metin
          <strong className="text-ink"> tek seferde, kesintisiz </strong>
          okunur; öğrenci hatayı duyduğu an butona basar.
        </p>
      </motion.div>

      <AudioUploader
        lessonId={lesson.id}
        onChange={setSesKaydi}
        onVideoChange={setVideoKaydi}
      />

      {/* ══════════════════════════════════════════════════════════
          VİDEO AKTİF İSE: VİDEO SANİYESİ İLE HATA BELİRLEME MERKEZİ
         ══════════════════════════════════════════════════════════ */}
      {videoKaydi && (
        <div className="file-card space-y-5 border-l-4 border-l-verify p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="label font-bold text-verify">🎬 VİDEO TUZAK & SANİYE BELİRLEME</span>
                <span className="label-chip border-verify-edge bg-verify-soft text-verify font-bold">
                  VİDEO AKTİF
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Videoyu oynatıp durdurun ve <strong>"📍 Oynatılan Saniyeyi Al"</strong> butonuna basın ya da doğrudan saniye girin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="label-chip border-paper-edge bg-paper-deep font-mono">
                ⏱️ {formatSec(videoCurrentTime)} / {sureMetni(videoKaydi.durationMs)}
              </span>
              <span
                className={cx(
                  'label-chip',
                  wrongs.length > 0
                    ? 'border-mark bg-mark-soft text-mark font-bold'
                    : 'border-paper-edge bg-paper-deep text-ink-muted',
                )}
              >
                {wrongs.length} TUZAK
              </span>
            </div>
          </div>

          {/* Video Oynatıcı Önizleme */}
          {videoUrl && (
            <div className="overflow-hidden rounded-sm border-2 border-paper-edge bg-black">
              <video
                ref={videoPlayerRef}
                src={videoUrl}
                controls
                playsInline
                onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                className="max-h-[380px] w-full object-contain mx-auto"
                muted={!videoKaydi.hasAudio}
              />
            </div>
          )}

          {/* Saniye Seçme ve Hata Tanımlama Formu */}
          <div className="rounded-sm border-2 border-paper-edge bg-paper-deep p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-edge pb-3">
              <span className="label font-bold text-ink">YENİ VİDEO TUZAĞI EKLE</span>
              <Button3D
                type="button"
                size="sm"
                tone="gold"
                onClick={saniyeyiAl}
                title="Videonun şu an durduğu saniyeyi al"
              >
                📍 Oynatılan Saniyeyi Al ({formatSec(videoCurrentTime)})
              </Button3D>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="setup-v-time">
                  HATA SANİYESİ (DK:SN VEYA SN) <span className="text-mark">*</span>
                </label>
                <input
                  id="setup-v-time"
                  value={videoTimeInput}
                  onChange={(e) => setVideoTimeInput(e.target.value)}
                  className="field font-mono font-bold text-sm"
                  placeholder="Örn: 01:25 veya 85"
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Seçili: <strong className="text-ink font-mono">{formatSec(parseMmSs(videoTimeInput))}</strong> ({parseMmSs(videoTimeInput)} sn) · yakalama süresi otomatik <strong className="text-ink">10 sn</strong>
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="setup-v-text">
                  HATA / YANLIŞ İFADE BAŞLIĞI
                </label>
                <input
                  id="setup-v-text"
                  value={videoText}
                  onChange={(e) => setVideoText(e.target.value)}
                  className="field text-sm"
                  placeholder="Örn: Mezensefalon arka beyindedir dendi"
                />
              </div>
            </div>

            {/* Hatanın Açıklaması ve Doğrusu */}
            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              <div>
                <label className="field-label" htmlFor="setup-v-why">
                  BU SANİYEDEKİ BİLGİ NEDEN YANLIŞ? <span className="text-mark">*</span>
                </label>
                <textarea
                  id="setup-v-why"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="field min-h-[75px] resize-none text-sm leading-relaxed"
                  placeholder="Örn: Mezensefalon arka beyinde değil, orta beyinde yer alır."
                />
              </div>

              <div>
                <label className="field-label" htmlFor="setup-v-fix">
                  DOĞRUSU NEDİR? (ÖĞRENCİYE GÖSTERİLİR)
                </label>
                <textarea
                  id="setup-v-fix"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  className="field min-h-[75px] resize-none text-sm leading-relaxed"
                  placeholder="Örn: Doğrusu: Mezensefalon beyin sapının orta kısmıdır."
                />
              </div>
            </div>

            {/* ── 5 Şıklı Ek Soru Bölümü ── */}
            <div className="rounded-sm border border-paper-edge bg-paper-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label font-bold text-ink">
                    5 ŞIKLI EK SORU <span className="text-ink-muted">· İSTEĞE BAĞLI</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    10 saniyede tuzağı yakalayan öğrencinin telefonunda açılır (+{soru.bonus} ek puan).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button3D
                    type="button"
                    size="sm"
                    tone="ghost"
                    onClick={() => setSoruAcik((v) => !v)}
                  >
                    {soruAcik ? 'Soruyu Atla' : 'Soru Ekle'}
                  </Button3D>
                  <div className="flex items-center gap-1 rounded-sm border border-paper-edge bg-paper-deep p-1">
                    <span className="px-1.5 font-mono text-[10px] font-bold text-ink-muted">
                      ZORLUK:
                    </span>
                    {(['kolay', 'orta', 'zor'] as const).map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZorluk(z)}
                        className={cx(
                          'rounded-xs px-2 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors',
                          zorluk === z
                            ? 'bg-ink text-paper'
                            : 'text-ink-muted hover:bg-paper-card hover:text-ink',
                        )}
                      >
                        {z}
                      </button>
                    ))}
                  </div>

                  <Button3D
                    type="button"
                    size="sm"
                    tone="gold"
                    onClick={() => uret(true)}
                    disabled={uretiliyor || !isGeminiConfigured}
                  >
                    {uretiliyor ? 'Üretiliyor…' : '✨ 5 Şıklı Soru Üret'}
                  </Button3D>
                </div>
              </div>

              {soruAcik && (
                <div className="mt-3 space-y-3 pt-2 border-t border-paper-edge">
                  <div>
                    <label className="field-label" htmlFor="setup-v-q">
                      SORU METNİ
                    </label>
                    <textarea
                      id="setup-v-q"
                      value={soru.question}
                      onChange={(e) => setSoru({ ...soru, question: e.target.value })}
                      className="field min-h-[55px] resize-none text-sm"
                      placeholder="Örn: Videodaki açıklamaya göre mezensefalonun doğru konumu neresidir?"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="field-label mb-1">
                      5 SEÇENEK (A, B, C, D, E) — <span className="text-verify">Doğru şıkkın harfine tıkla</span>
                    </p>
                    {['A', 'B', 'C', 'D', 'E'].map((letter, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSoru({ ...soru, correctIndex: i })}
                          className={cx(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                            soru.correctIndex === i
                              ? 'border-verify bg-verify text-white shadow-md ring-2 ring-verify/30'
                              : 'border-paper-edge bg-paper-deep text-ink-muted hover:border-ink',
                          )}
                          title={`${letter} şıkkını doğru cevap yap`}
                        >
                          {letter}
                        </button>
                        <input
                          value={soru.options[i] ?? ''}
                          onChange={(e) => {
                            const next = [...soru.options]
                            while (next.length < 5) next.push('')
                            next[i] = e.target.value
                            setSoru({ ...soru, options: next })
                          }}
                          className={cx(
                            'field py-1 text-sm transition-colors',
                            soru.correctIndex === i && 'border-verify bg-verify-soft/25 font-medium text-ink ring-1 ring-verify',
                          )}
                          placeholder={`${letter} şıkkı`}
                        />
                        {soru.correctIndex === i && (
                          <span className="shrink-0 font-mono text-[10px] font-bold text-verify animate-pulse">
                            ✓ DOĞRU
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button3D
                type="button"
                onClick={videoHataEkle}
                size="md"
                tone="danger"
                disabled={!explanation.trim()}
              >
                {soru.question.trim() ? '🎬 Videoya Tuzağı Ekle (soruyla)' : '🎬 Videoya Tuzağı Ekle'}
              </Button3D>
              <Button3D type="button" onClick={formuTemizle} size="md" tone="ghost">
                Formu Temizle
              </Button3D>
            </div>
          </div>
        </div>
      )}

      {/* Ders notu (Video yokken ana alan; video varken isteğe bağlı) */}
      {(!videoKaydi || script.trim().length > 0) && (
        <div className="file-card space-y-3 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <label className="label font-bold" htmlFor="script">
              {videoKaydi ? 'DERS METNİ (İSTEĞE BAĞLI ALTYAZI / NOT)' : 'DERS NOTU'}
            </label>
            <span className="label">
              {script.length} KARAKTER ·{' '}
              {videoKaydi
                ? `VİDEO ${sureMetni(videoKaydi.durationMs)}`
                : sesKaydi
                  ? `KAYIT ${sureMetni(sesKaydi.durationMs)}`
                  : `~${okumaDk} DK OKUMA`}
            </span>
          </div>
          <textarea
            id="script"
            ref={areaRef}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onSelect={readSelection}
            onMouseUp={readSelection}
            onTouchEnd={readSelection}
            onKeyUp={readSelection}
            className="field min-h-[200px] resize-y font-serif leading-relaxed"
            placeholder={videoKaydi ? 'İsteğe bağlı ders notu veya döküm…' : 'Ders metnini buraya yapıştır…'}
          />
          {!videoKaydi && (
            <p className="text-xs text-ink-muted">
              Yanlış olan yeri fareyle seç — aşağıda işaretleme formu açılır.
              İstediğin kadar yer işaretleyebilirsin.
            </p>
          )}

          {/* ── Metinde ara ── */}
          {!videoKaydi && (
            <div className="rounded-sm border border-paper-edge bg-paper-deep p-4">
              <label className="field-label" htmlFor="ara">
                METİNDE ARA
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="ara"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  className="field flex-1 min-w-[220px] text-sm"
                  placeholder="Örn. humerus, radius, 12 çift…"
                  autoComplete="off"
                />
                {arama.trim().length >= 2 && (
                  <span className="label whitespace-nowrap">
                    {eslesmeler.length} EŞLEŞME
                  </span>
                )}
                {arama && (
                  <button
                    type="button"
                    onClick={() => setArama('')}
                    className="text-xs font-semibold text-ink-muted underline underline-offset-2 hover:text-ink"
                  >
                    Temizle
                  </button>
                )}
              </div>

              {arama.trim().length >= 2 && (
                <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                  {eslesmeler.length === 0 ? (
                    <p className="py-4 text-center text-sm text-ink-muted">
                      Bu metinde geçmiyor.
                    </p>
                  ) : (
                    eslesmeler.map((m) => (
                      <div
                        key={m.start}
                        className={cx(
                          'flex items-start gap-3 rounded-sm border-l-4 bg-paper-card px-3 py-2',
                          m.isaretli ? 'border-l-mark' : 'border-l-paper-edge',
                        )}
                      >
                        <span className="mt-1 font-mono text-[10px] font-bold text-ink-faint">
                          {m.start}
                        </span>
                        <button
                          type="button"
                          onClick={() => eslesmeyeGit(m)}
                          className="min-w-0 flex-1 text-left font-serif text-sm leading-snug text-ink hover:underline"
                          title="Bu yeri metinde seç"
                        >
                          {m.onizleme.slice(0, m.vurguStart)}
                          <mark className="bg-flag-soft font-semibold text-ink">
                            {m.onizleme.slice(m.vurguStart, m.vurguEnd)}
                          </mark>
                          {m.onizleme.slice(m.vurguEnd)}
                        </button>
                        {m.isaretli ? (
                          <span className="label-chip mt-0.5 shrink-0 border-mark bg-mark-soft text-mark">
                            İŞARETLİ
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => eslesmeyiIsaretle(m)}
                            className="mt-0.5 shrink-0 rounded-sm border border-mark px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-mark transition-colors hover:bg-mark hover:text-paper"
                          >
                            TUZAK YAP
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {dusenler.length > 0 && (
            <div className="rounded-sm border-l-2 border-flag bg-flag-soft p-4 text-[12px] leading-relaxed text-ink">
              <div className="flex items-start justify-between gap-3">
                <p>
                  <strong className="font-semibold">
                    {dusenler.length} işaret düştü:
                  </strong>{' '}
                  metni değiştirdiğin için şu yerler artık bulunamıyor —{' '}
                  {dusenler.map((d) => `“${d}”`).join(', ')}. Yeni hâllerini tekrar
                  işaretlemen gerekiyor.
                </p>
                <button
                  type="button"
                  onClick={() => setDusenler([])}
                  className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:text-ink"
                >
                  KAPAT
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* İşaretleme formu (Video Yokken) */}
      <AnimatePresence>
        {!videoKaydi && selection && selectedText && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            id="isaretleme-formu"
            className="file-card space-y-5 border-l-4 border-l-mark p-6"
          >
            <div>
              <p className="label font-bold">SEÇİLEN</p>
              <p className="mt-1.5 font-serif text-base text-mark">“{selectedText}”</p>
            </div>

            {cakisan && (
              <p className="rounded-sm border-l-2 border-flag bg-flag-soft px-4 py-3 text-sm text-ink">
                Bu yer zaten işaretli (“{cakisan.text}”). Önce mevcut işareti sil.
              </p>
            )}

            <div>
              <label className="field-label" htmlFor="why">
                NEDEN YANLIŞ?
              </label>
              <textarea
                id="why"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="field min-h-[80px] resize-none"
                placeholder="Örn: Omuz kuşağını clavicula ve scapula oluşturur; sternum gövde iskeletine aittir."
              />
            </div>

            <div>
              <label className="field-label" htmlFor="fix">
                DOĞRUSU (isteğe bağlı)
              </label>
              <textarea
                id="fix"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                className="field min-h-[60px] resize-none"
                placeholder="Yakalayan öğrenciye gösterilecek doğru bilgi"
              />
            </div>

            {/* ── Ek soru ── */}
            <div className="rounded-sm border border-paper-edge bg-paper-deep p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label font-bold">YAKALAYANA SORULACAK SORU</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    İsteğe bağlı. Doğru bilirse +{soru.bonus} puan, bilemezse ceza yok.
                  </p>
                </div>
                {!soruAcik && (
                  <Button3D type="button" size="sm" tone="ghost" onClick={() => setSoruAcik(true)}>
                    Soru Ekle
                  </Button3D>
                )}
              </div>

              {soruAcik && (
                <div className="mt-4 space-y-4">
                  {/* AI yardımcısı */}
                  <div className="flex flex-wrap items-center gap-3 rounded-sm bg-paper-card p-3">
                    <span className="label">ZORLUK</span>
                    <div className="flex gap-1.5">
                      {(['kolay', 'orta', 'zor'] as const).map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZorluk(z)}
                          className={cx(
                            'rounded-sm border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
                            zorluk === z
                              ? 'border-ink bg-ink text-paper'
                              : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                          )}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                    <Button3D
                      type="button"
                      size="sm"
                      onClick={() => uret(false)}
                      disabled={uretiliyor || !isGeminiConfigured}
                      className="ml-auto"
                    >
                      {uretiliyor ? 'Üretiliyor…' : 'Yapay Zekâ ile Üret'}
                    </Button3D>
                  </div>
                  {!isGeminiConfigured && (
                    <p className="text-xs text-ink-muted">
                      Gemini anahtarı tanımlı değil — soruyu elle yazabilirsin.
                    </p>
                  )}

                  <div>
                    <label className="field-label" htmlFor="q">
                      SORU
                    </label>
                    <textarea
                      id="q"
                      value={soru.question}
                      onChange={(e) => setSoru({ ...soru, question: e.target.value })}
                      className="field min-h-[60px] resize-none"
                      placeholder="Örn: Omuz kuşağını oluşturan diğer kemik hangisidir?"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="field-label mb-0">ŞIKLAR — doğru olanı işaretle</p>
                    {soru.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={`${i + 1}. şık doğru`}
                          onClick={() => setSoru({ ...soru, correctIndex: i })}
                          className={cx(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                            soru.correctIndex === i
                              ? 'border-verify bg-verify text-white shadow-md ring-2 ring-verify/30'
                              : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </button>
                        <input
                          value={o}
                          onChange={(e) => {
                            const next = [...soru.options]
                            next[i] = e.target.value
                            setSoru({ ...soru, options: next })
                          }}
                          className={cx(
                            'field',
                            soru.correctIndex === i && 'border-verify bg-verify-soft/25 font-medium text-ink ring-1 ring-verify',
                          )}
                          placeholder={`${i + 1}. şık`}
                        />
                        {soru.correctIndex === i && (
                          <span className="shrink-0 font-mono text-[11px] font-bold text-verify animate-pulse">
                            ✓ DOĞRU ŞIK
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSoru(BOS_SORU)
                      setSoruAcik(false)
                    }}
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:text-mark"
                  >
                    Soruyu kaldır
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Button3D
                  type="button"
                  onClick={ekle}
                  size="md"
                  tone="danger"
                  disabled={!explanation.trim() || !!cakisan}
                >
                  {soru.question.trim() ? 'Yanlış Olarak İşaretle (soruyla)' : 'Yanlış Olarak İşaretle'}
                </Button3D>
                <Button3D type="button" onClick={formuTemizle} size="md" tone="ghost">
                  Vazgeç
                </Button3D>
                {cakisan && (
                  <Button3D type="button" size="md" tone="ghost" onClick={() => sil(cakisan.start)}>
                    Çakışan Tuzağı Sil
                  </Button3D>
                )}
              </div>

              {(!explanation.trim() || cakisan) && (
                <p className="text-xs leading-relaxed text-mark">
                  {cakisan
                    ? 'Seçtiğin yer mevcut bir işaretle çakışıyor. Çakışmayan bir aralık seç ya da eski işareti sil.'
                    : 'Hatanın neden yanlış olduğunu yazınca işaretlenebilir. Ek soru zorunlu değil.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* İşaretlenenler */}
      {wrongs.length > 0 && (
        <div className="file-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="label font-bold">{wrongs.length} TUZAK İŞARETLENDİ</p>
            <span className="label">{soruluSayi} TANESİNDE SORU VAR</span>
          </div>
          <div className="mt-4 space-y-2">
            {wrongs.map((w, i) => (
              <div key={i} className="rounded-sm border-l-4 border-l-mark bg-mark-soft px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] font-bold text-ink-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {w.videoTimestamp !== undefined && (
                        <button
                          type="button"
                          onClick={() => {
                            if (videoPlayerRef.current) {
                              videoPlayerRef.current.currentTime = w.videoTimestamp!
                              videoPlayerRef.current.play().catch(() => {})
                            }
                          }}
                          className="rounded-xs border border-verify bg-verify-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-verify hover:bg-verify hover:text-white transition-colors"
                          title="Videoda bu saniyeye git"
                        >
                          ⏱️ {formatSec(w.videoTimestamp)} (+10 sn) ▶
                        </button>
                      )}
                      <p className="font-serif text-sm font-semibold text-mark">“{w.text}”</p>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{w.explanation}</p>
                    {w.correction && (
                      <p className="mt-0.5 text-xs text-verify">
                        <strong>Doğrusu:</strong> {w.correction}
                      </p>
                    )}
                    {w.followUp && (
                      <p className="mt-1.5 font-mono text-[11px] text-verify">
                        ✓ SORU: {w.followUp.question.slice(0, 60)}
                        {w.followUp.question.length > 60 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => silIndex(i)}
                    className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mark hover:underline"
                  >
                    SİL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ÖN TEST / SON TEST ──
          Ders akışı: ön test → dersi dinle → son test. İki testin farkı
          dersin öğrenciye ne kattığını gösteriyor, araştırmanın verisi bu. */}
      <div className="file-card p-6">
        <p className="label font-bold">ÖLÇME TESTLERİ</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Öğrenciler önce <strong className="text-ink">ön testi</strong> çözer, sonra dersi
          dinler, en sonunda <strong className="text-ink">son testi</strong> çözer. İki testi de
          boş bırakabilirsin — o zaman doğrudan derse geçilir.
        </p>
      </div>

      <QuizUploader
        baslik="ÖN TEST (Ders Öncesi Seviye Tespiti)"
        aciklama="Öğrenci dersi dinlemeden önce bu testi çözer. Word (.docx) veya metin yükleyebilir, AI ile üretebilirsiniz."
        tone="pre"
        questions={pretest}
        onChange={setPretest}
        lessonTitle={lesson.title}
      />

      <QuizUploader
        baslik="SON TEST (Ders Sonrası Kazanım Ölçümü)"
        aciklama="Ders anlatımı ve tuzak yakalama bittiğinde öğrenciler bunu çözer. Ön testle farkı öğrenme gelişimini gösterir."
        tone="post"
        questions={posttest}
        onChange={setPosttest}
        lessonTitle={lesson.title}
      />

      {/* Başlat */}
      <div className="flex flex-wrap gap-3">
        <Button3D
          onClick={baslat}
          size="lg"
          tone="success"
          disabled={busy || !wrongs.length || (!videoKaydi && !script.trim())}
        >
          {busy ? 'Hazırlanıyor…' : 'Oturumu Aç'}
        </Button3D>
        <Button3D onClick={() => navigate('/hoca')} size="lg" tone="ghost" disabled={busy}>
          İptal
        </Button3D>
      </div>
    </motion.div>
  )
}
