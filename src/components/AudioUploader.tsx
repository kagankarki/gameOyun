/**
 * DERS SES VE VİDEO KAYDI YÜKLEME
 *
 * Hem ders düzenleyicide hem amfi hazırlık ekranında kullanılır:
 * Hoca ders için bir SES DOSYASI ya da VİDEO DOSYASI yükleyebilir.
 *
 * ÖZELLİKLER:
 * 1. Video yüklendiğinde "Videonun sesi var mı?" diye sorar:
 *    - Evet ise: ders sesi doğrudan videodan dinlenir.
 *    - Hayır ise: video sessiz oynatılır, hoca ekstra harici ses dosyası yükleyebilir
 *      veya yapay zeka sesini kullanabilir.
 * 2. Dosyalar hocanın cihazında IndexedDB'de ve yerel Blob belleğinde tutulur:
 *    Sunucuya veya Firestore'a gönderilmediği için GB'larca büyük videolar bile
 *    hiçbir boyut kısıtlaması olmadan yerel olarak akıcı açılır.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from './Button3D'
import { useToast } from './Toast'
import {
  boyutMetni,
  sesGetir,
  sesKaydet,
  sesSil,
  sureMetni,
  videoGetir,
  videoKaydet,
  videoSil,
  type DersSesi,
  type DersVideosu,
} from '@/lib/audioStore'
import { EASE } from '@/lib/motion'
import { cx } from '@/lib/utils'

interface Props {
  lessonId: string | undefined
  /** Ses kaydı değiştikçe üst ekrana bildirir */
  onChange?: (kayit: DersSesi | null) => void
  /** Video kaydı değiştikçe üst ekrana bildirir */
  onVideoChange?: (video: DersVideosu | null) => void
}

export default function AudioUploader({ lessonId, onChange, onVideoChange }: Props) {
  const toast = useToast()
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [sesKaydi, setSesKaydi] = useState<DersSesi | null>(null)
  const [videoKaydi, setVideoKaydi] = useState<DersVideosu | null>(null)

  const [sesUrl, setSesUrl] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const [yukleniyor, setYukleniyor] = useState(false)
  /** Seçilen video için ses sorgulama modalı */
  const [bekleyenVideo, setBekleyenVideo] = useState<File | null>(null)

  const bildirSes = (k: DersSesi | null) => {
    setSesKaydi(k)
    onChange?.(k)
  }

  const bildirVideo = (v: DersVideosu | null) => {
    setVideoKaydi(v)
    onVideoChange?.(v)
  }

  /* Bu derse ait kayıtlar bu cihazda var mı? */
  useEffect(() => {
    if (!lessonId) return
    let alive = true
    void Promise.all([sesGetir(lessonId), videoGetir(lessonId)]).then(([s, v]) => {
      if (!alive) return
      setSesKaydi(s)
      onChange?.(s)
      setVideoKaydi(v)
      onVideoChange?.(v)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  /* Ses blob URL */
  useEffect(() => {
    if (!sesKaydi) {
      setSesUrl(null)
      return
    }
    const u = URL.createObjectURL(sesKaydi.blob)
    setSesUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [sesKaydi])

  /* Video blob URL */
  useEffect(() => {
    if (!videoKaydi) {
      setVideoUrl(null)
      return
    }
    const u = URL.createObjectURL(videoKaydi.blob)
    setVideoUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [videoKaydi])

  /* ── Ses Dosyası Seçimi ── */
  const sesDosyasiSec = async (file: File | undefined) => {
    if (!file || !lessonId) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|aac|webm)$/i.test(file.name)) {
      toast('Bu bir ses dosyası değil. MP3, M4A, WAV veya OGG yükleyin.', 'error')
      return
    }
    setYukleniyor(true)
    try {
      const k = await sesKaydet(lessonId, file)
      bildirSes(k)
      toast(
        k.durationMs
          ? `Ses yüklendi — ${sureMetni(k.durationMs)}.`
          : 'Ses yüklendi.',
        'success',
      )
    } catch (err) {
      toast('Ses kaydedilemedi: ' + (err as Error).message, 'error')
    } finally {
      setYukleniyor(false)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  /* ── Video Dosyası Seçimi (Önce Soru Sorulur) ── */
  const videoDosyasiSec = (file: File | undefined) => {
    if (!file || !lessonId) return
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(file.name)) {
      toast('Bu bir video dosyası değil. MP4, WebM veya MOV yükleyin.', 'error')
      return
    }
    // Hocaya videonun sesi var mı diye soruyoruz
    setBekleyenVideo(file)
  }

  /* ── Video Ses Tercihi Onayı ── */
  const videoSesOnayla = async (hasAudio: boolean) => {
    const file = bekleyenVideo
    if (!file || !lessonId) {
      setBekleyenVideo(null)
      return
    }
    setYukleniyor(true)
    setBekleyenVideo(null)
    try {
      const v = await videoKaydet(lessonId, file, hasAudio)
      bildirVideo(v)
      toast(
        hasAudio
          ? `Video yüklendi (${sureMetni(v.durationMs)}). Ders sesi bu videodan dinlenecek.`
          : `Video yüklendi (${sureMetni(v.durationMs)}). Video sessiz oynatılacak, isterseniz ekstra ses ekleyebilirsiniz.`,
        'success',
      )
    } catch (err) {
      toast('Video kaydedilemedi: ' + (err as Error).message, 'error')
    } finally {
      setYukleniyor(false)
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  /* ── Ses Kanalı Durumunu Değiştir (Evet/Hayır Toggle) ── */
  const videoSesDurumuDegistir = async () => {
    if (!videoKaydi || !lessonId) return
    const yeniHasAudio = !videoKaydi.hasAudio
    const guncel: DersVideosu = { ...videoKaydi, hasAudio: yeniHasAudio }
    try {
      await videoKaydet(lessonId, videoKaydi.blob as File, yeniHasAudio)
      bildirVideo(guncel)
      toast(
        yeniHasAudio
          ? 'Video sesi açık olarak ayarlandı.'
          : 'Video sessiz olarak ayarlandı. Harici ses ekleyebilirsiniz.',
        'success',
      )
    } catch (err) {
      toast('Ayar güncellenemedi: ' + (err as Error).message, 'error')
    }
  }

  const sesiKaldir = async () => {
    if (!lessonId) return
    if (!window.confirm('Ses kaydı kaldırılsın mı?')) return
    await sesSil(lessonId)
    bildirSes(null)
    toast('Ses kaydı kaldırıldı.', 'success')
  }

  const videoyuKaldir = async () => {
    if (!lessonId) return
    if (!window.confirm('Video kaydı kaldırılsın mı?')) return
    await videoSil(lessonId)
    bildirVideo(null)
    toast('Video kaydı kaldırıldı.', 'success')
  }

  return (
    <div className="file-card space-y-5 border-l-4 border-l-ink p-6">
      {/* Üst Başlık ve Durum */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="label font-bold">DERS MEDYASI (SES VEYA VİDEO) · İSTEĞE BAĞLI</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Dersi bir <strong className="text-ink">video</strong> ile sunabilir veya kendi{' '}
            <strong className="text-ink">ses kaydınızla</strong> dinletebilirsiniz.
            Dosyalar <strong className="text-ink">doğrudan bu bilgisayardan</strong> yerel olarak
            açılacağı için boyut sınırı yoktur (GB'larca video dahi takılmadan anında oynatılır).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {videoKaydi && (
            <span className="label-chip border-verify-edge bg-verify-soft text-verify font-bold">
              VİDEO AKTİF
            </span>
          )}
          {sesKaydi && (
            <span className="label-chip border-paper-edge bg-paper-deep text-ink font-bold">
              SES AKTİF
            </span>
          )}
          {!videoKaydi && !sesKaydi && (
            <span className="label text-xs">YAPAY ZEKÂ SESİ</span>
          )}
        </div>
      </div>

      {/* Gizli File Input'lar */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
        className="hidden"
        onChange={(e) => void sesDosyasiSec(e.target.files?.[0])}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.m4v"
        className="hidden"
        onChange={(e) => void videoDosyasiSec(e.target.files?.[0])}
      />

      {/* ── 1. VİDEO ALANI ── */}
      {videoKaydi ? (
        <div className="rounded-sm border-2 border-paper-edge bg-paper-deep p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-edge pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎬</span>
              <p className="text-sm font-bold text-ink truncate max-w-md">{videoKaydi.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  'rounded-xs px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                  videoKaydi.hasAudio
                    ? 'bg-verify-soft text-verify border border-verify-edge'
                    : 'bg-flag-soft text-flag border border-flag-edge',
                )}
              >
                {videoKaydi.hasAudio ? '🔊 Videonun Kendi Sesi Var' : '🔇 Video Sessiz'}
              </span>
              <span className="label whitespace-nowrap">
                {sureMetni(videoKaydi.durationMs)} · {boyutMetni(videoKaydi.size)}
              </span>
            </div>
          </div>

          {videoUrl && (
            <div className="mt-3 overflow-hidden rounded-sm border border-paper-edge bg-black">
              <video
                src={videoUrl}
                controls
                className="max-h-[340px] w-full object-contain"
                muted={!videoKaydi.hasAudio}
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button3D
                size="sm"
                tone="ghost"
                type="button"
                onClick={videoSesDurumuDegistir}
                title="Videonun sesi var/yok ayarını değiştir"
              >
                {videoKaydi.hasAudio ? '🔇 Videoyu Sessiz Yap' : '🔊 Videonun Sesini Kullan'}
              </Button3D>
              <Button3D
                size="sm"
                tone="ghost"
                type="button"
                onClick={() => videoInputRef.current?.click()}
              >
                Başka Video Seç
              </Button3D>
            </div>
            <Button3D size="sm" tone="danger" type="button" onClick={videoyuKaldir}>
              Videoyu Kaldır
            </Button3D>
          </div>
        </div>
      ) : null}

      {/* ── 2. SES ALANI (Video yokken VEYA video sessizken görünür) ── */}
      {(!videoKaydi || !videoKaydi.hasAudio) && (
        <div
          className={cx(
            'rounded-sm p-4',
            videoKaydi && !videoKaydi.hasAudio
              ? 'border-2 border-dashed border-paper-edge bg-paper-card'
              : 'border border-paper-edge bg-paper-deep',
          )}
        >
          {videoKaydi && !videoKaydi.hasAudio && (
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-muted">
              <span>🎵</span>
              <span>
                Videonuz sessiz olduğu için ders anlatımı için <strong className="text-ink">harici ses dosyası</strong> yükleyebilir veya yapay zeka sesini kullanabilirsiniz.
              </span>
            </div>
          )}

          {sesKaydi ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎙️</span>
                  <p className="text-sm font-semibold text-ink truncate max-w-sm">{sesKaydi.name}</p>
                </div>
                <span className="label whitespace-nowrap">
                  {sureMetni(sesKaydi.durationMs)} · {boyutMetni(sesKaydi.size)}
                </span>
              </div>
              {sesUrl && <audio src={sesUrl} controls className="mt-3 w-full" />}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button3D
                  size="sm"
                  tone="ghost"
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                >
                  Başka Ses Seç
                </Button3D>
                <Button3D size="sm" tone="ghost" type="button" onClick={sesiKaldir}>
                  Ses Kaydını Kaldır
                </Button3D>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button3D
                size="md"
                tone="ghost"
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={yukleniyor || !lessonId}
              >
                {yukleniyor ? 'Yükleniyor…' : '🎵 Ses Dosyası Yükle (MP3 / WAV)'}
              </Button3D>
              <span className="text-xs text-ink-muted">
                {videoKaydi ? 'Ekstra Harici Ses' : 'İsteğe bağlı kendi ses kaydınız'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 3. HİÇBİR ŞEY YÜKLÜ DEĞİLSE VİDEO VE SES BUTONLARI ── */}
      {!videoKaydi && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button3D
            size="md"
            tone="gold"
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={yukleniyor || !lessonId}
          >
            🎬 Video Yükle (MP4 / WebM)
          </Button3D>
          <span className="text-xs text-ink-muted">
            Yerel dosya · Boyut sınırı yok · Projeksiyonda oynatılır
          </span>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-muted">
        💡 Yüklediğiniz medya dosyaları <strong className="text-ink">bu cihazda</strong> saklanır ve
        öğrencilere internet üzerinden aktarılmaz; doğrudan amfi perdesinde ve hoca bilgisayarında
        oynatılır. Bu nedenle dersi aynı bilgisayardan başlatmanız gerekir.
      </p>

      {/* ══════════════════════════════════════════════════════════
          VİDEO SES SORGULAMA MODALI ("Videonun sesi var mı?")
         ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {bekleyenVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="file-card max-w-lg w-full p-6 sm:p-7 shadow-lift border-2 border-ink space-y-5"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-deep text-xl">
                  🎬
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold text-ink">
                    Videonun Sesi Var mı?
                  </h3>
                  <p className="text-xs text-ink-muted truncate max-w-xs">{bekleyenVideo.name}</p>
                </div>
              </div>

              <div className="rounded-sm border border-paper-edge bg-paper-deep p-4 text-sm leading-relaxed text-ink">
                Yüklediğiniz bu video dosyasında dersin anlatım veya konuşma sesi yer alıyor mu?
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void videoSesOnayla(true)}
                  className="flex flex-col items-start gap-1 rounded-sm border-2 border-verify bg-verify-soft p-4 text-left transition-all hover:bg-verify-soft/80 active:scale-[0.98]"
                >
                  <span className="font-display font-bold text-verify flex items-center gap-1.5 text-base">
                    🔊 Evet, Sesi Var
                  </span>
                  <span className="text-xs text-ink-muted leading-relaxed">
                    Ders anlatım sesi doğrudan bu videodan dinlenecek.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void videoSesOnayla(false)}
                  className="flex flex-col items-start gap-1 rounded-sm border-2 border-paper-edge bg-paper-card p-4 text-left transition-all hover:border-ink active:scale-[0.98]"
                >
                  <span className="font-display font-bold text-ink flex items-center gap-1.5 text-base">
                    🔇 Hayır, Video Sessiz
                  </span>
                  <span className="text-xs text-ink-muted leading-relaxed">
                    Video sessiz oynatılır; ekstra ses yükleyebilir veya yapay zeka sesi seçebilirsiniz.
                  </span>
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBekleyenVideo(null)}
                  className="text-xs text-ink-muted hover:text-ink underline transition-colors"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
