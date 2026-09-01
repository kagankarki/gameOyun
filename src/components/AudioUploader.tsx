/**
 * DERS SES KAYDI YÜKLEME
 *
 * Hem ders düzenleyicide hem amfi hazırlık ekranında kullanılıyor —
 * hoca hangisinden derse başlarsa başlasın aynı yerden ses ekleyebilsin.
 *
 * Dosya **hocanın cihazında**, IndexedDB'de saklanır (bkz. `lib/audioStore.ts`):
 * ses dosyaları Firestore'un 1 MB doküman sınırına sığmaz ve sesi zaten
 * yalnızca hoca bilgisayarı çalıyor — öğrencinin telefonuna hiç gitmiyor.
 */
import { useEffect, useRef, useState } from 'react'

import Button3D from './Button3D'
import { useToast } from './Toast'
import {
  boyutMetni,
  sesGetir,
  sesKaydet,
  sesSil,
  sureMetni,
  type DersSesi,
} from '@/lib/audioStore'

interface Props {
  lessonId: string | undefined
  /** Kayıt değiştikçe üst ekrana bildir — oturum açılırken künyesi gerekiyor */
  onChange?: (kayit: DersSesi | null) => void
}

export default function AudioUploader({ lessonId, onChange }: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [kayit, setKayit] = useState<DersSesi | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  const bildir = (k: DersSesi | null) => {
    setKayit(k)
    onChange?.(k)
  }

  /* Bu derse ait kayıt bu cihazda var mı? */
  useEffect(() => {
    if (!lessonId) return
    let alive = true
    void sesGetir(lessonId).then((k) => {
      if (!alive) return
      setKayit(k)
      onChange?.(k)
    })
    return () => {
      alive = false
    }
    // onChange her render'da yeniden üretilebilir; kimliğe bağlamıyoruz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  /* Önizleme için blob URL */
  useEffect(() => {
    if (!kayit) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(kayit.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [kayit])

  const dosyaSec = async (file: File | undefined) => {
    if (!file || !lessonId) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|aac|webm)$/i.test(file.name)) {
      toast('Bu bir ses dosyası değil. MP3, M4A, WAV veya OGG yükle.', 'error')
      return
    }
    setYukleniyor(true)
    try {
      const k = await sesKaydet(lessonId, file)
      bildir(k)
      toast(
        k.durationMs
          ? `Ses yüklendi — ${sureMetni(k.durationMs)}. Şimdi bu kaydın metnini not alanına yapıştır.`
          : 'Ses yüklendi. Süresi okunamadı ama ders yine de bu kayda göre ilerler.',
        'success',
      )
    } catch (err) {
      toast('Ses kaydedilemedi: ' + (err as Error).message, 'error')
    } finally {
      setYukleniyor(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const kaldir = async () => {
    if (!lessonId) return
    if (!window.confirm('Ses kaydı kaldırılsın mı? Ders yeniden yapay zekâ sesiyle okunur.')) return
    await sesSil(lessonId)
    bildir(null)
    toast('Ses kaydı kaldırıldı.', 'success')
  }

  return (
    <div className="file-card space-y-4 border-l-4 border-l-ink p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="label font-bold">DERS SES KAYDI · İSTEĞE BAĞLI</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Ses dosyası yüklersen ders{' '}
            <strong className="text-ink">yapay zekâ sesiyle değil, bu kayıtla</strong> anlatılır.
            Yükledikten sonra{' '}
            <strong className="text-ink">kaydın metnini ders notu alanına yapıştır</strong> —
            öğrencinin hangi hataya bastığı, kaydın o andaki ilerlemesinden hesaplanır.
          </p>
        </div>
        <span className="label whitespace-nowrap">{kayit ? 'KAYIT VAR' : 'YAPAY ZEKÂ SESİ'}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
        className="hidden"
        onChange={(e) => void dosyaSec(e.target.files?.[0])}
      />

      {kayit ? (
        <div className="rounded-sm border border-paper-edge bg-paper-deep p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{kayit.name}</p>
            <span className="label whitespace-nowrap">
              {sureMetni(kayit.durationMs)} · {boyutMetni(kayit.size)}
            </span>
          </div>
          {url && <audio src={url} controls className="mt-3 w-full" />}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button3D size="sm" tone="ghost" type="button" onClick={() => inputRef.current?.click()}>
              Başka Dosya Seç
            </Button3D>
            <Button3D size="sm" tone="ghost" type="button" onClick={kaldir}>
              Kaydı Kaldır
            </Button3D>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button3D
            size="md"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={yukleniyor || !lessonId}
          >
            {yukleniyor ? 'Yükleniyor…' : 'Ses Dosyası Yükle'}
          </Button3D>
          <span className="text-xs text-ink-muted">MP3 · M4A · WAV · OGG</span>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-muted">
        Dosya <strong className="text-ink">bu cihazda</strong> saklanır, öğrencilerin telefonuna
        gitmez — sesi yalnızca hoca bilgisayarı çalar. Bu yüzden dersi de aynı bilgisayardan,
        aynı tarayıcıdan başlatman gerekir.
      </p>
    </div>
  )
}
