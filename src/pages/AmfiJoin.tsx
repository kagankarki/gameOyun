import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import Logo from '@/components/Logo'
import AmfiPlay from './AmfiPlay'
import AmfiPlayV2 from './AmfiPlayV2'
import { useAuth } from '@/context/AuthContext'
import * as ses from '@/lib/session'
import * as store from '@/lib/store'
import type { LiveSession } from '@/lib/types'
import { EASE } from '@/lib/motion'

/**
 * Amfiye katılım — HESAP GEREKTİRMEZ.
 * 150 öğrenciye kayıt yaptırmak gerçekçi değil; QR doğrudan buraya düşer.
 */
export default function AmfiJoin() {
  const { code: codeParam } = useParams()
  const { user } = useAuth()

  const [code, setCode] = useState(codeParam?.toLocaleUpperCase('tr-TR') ?? '')
  // Giriş yapmış öğrenci adını tekrar yazmasın
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<{ sessionId: string; participantId: string } | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)

  /* Oturum bilgisi asenkron geliyor — geldiğinde adı doldur.
     Kullanıcı kutuya dokunduysa üzerine yazma. */
  const [nameTouched, setNameTouched] = useState(false)
  useEffect(() => {
    if (user?.name && !nameTouched) setName(user.name)
  }, [user?.name, nameTouched])

  /**
   * Katılımı bırak — cihaz yeniden katılım ekranına döner.
   * Bu olmadan bir kez koda girildiğinde /amfi hep o oturumu açıyor,
   * öğrenci ikinci bir derse giremiyordu.
   */
  const leave = useCallback(() => {
    store.setMyJoin(null)
    setJoined(null)
    setSession(null)
    setError(null)
    setCode(codeParam?.toLocaleUpperCase('tr-TR') ?? '')
  }, [codeParam])

  /* Sayfa yenilenirse oturuma geri dön.
     Katılım bilgisi localStorage'da duruyor; oturumun kendisini ağdan
     (ya da demo deposundan) dinleyerek alıyoruz. */
  useEffect(() => {
    const join = store.getMyJoin()
    if (!join) return
    setJoined(join)
  }, [])

  /* Hangi oyun ekranı açılacak? Oturumun sürümünü izleyerek karar veriyoruz —
     katılımdan sonra hoca bölüm değiştirdikçe oturum güncelleniyor. */
  useEffect(() => {
    if (!joined?.sessionId) return
    return ses.watchSession(joined.sessionId, (s) => {
      // Oturum silinmişse ya da bulunamıyorsa katılım ekranına dön
      if (!s) {
        leave()
        return
      }
      /* QR/bağlantı BAŞKA bir oturumun kodunu taşıyorsa eski katılım geçersiz:
         öğrenci yeni derse giriyor demektir. */
      if (
        codeParam &&
        s.code.toLocaleUpperCase('tr-TR') !== codeParam.toLocaleUpperCase('tr-TR')
      ) {
        leave()
        return
      }
      setSession(s)
    })
  }, [joined?.sessionId, codeParam, leave])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    const key = code.trim().toLocaleUpperCase('tr-TR')
    if (key.length < 4) return setError('Katılım kodunu gir.')
    if (!name.trim()) return setError('Adını gir — sıralamada bu görünecek.')

    setBusy(true)
    try {
      const session = await ses.findSessionByCode(key)
      if (!session) {
        setError('Bu kodla açık bir oturum bulunamadı. Kodu kontrol et.')
        return
      }
      if (session.phase === 'ended') {
        setError('Bu ders bitmiş.')
        return
      }
      const p = await ses.joinSession(session.id, name, user?.uid)
      setSession(session)
      setJoined({ sessionId: session.id, participantId: p.id })
    } catch (err) {
      setError((err as Error).message || 'Katılınamadı.')
    } finally {
      setBusy(false)
    }
  }

  if (joined) {
    // Oturum daha gelmediyse bekle — yanlış ekranı açıp geri almak
    // öğrencinin yazdığı notu uçururdu.
    if (!session)
      return (
        <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
          <p className="text-sm text-ink-muted">Oturuma bağlanılıyor…</p>
        </div>
      )

    // Sürüme göre ekran: 1 = zil, 2 = not yazma.
    // `version` alanı sonradan eklendi; eski oturumlar 1.0 sayılır.
    return (session.version ?? 1) === 2 ? (
      <AmfiPlayV2
        sessionId={joined.sessionId}
        participantId={joined.participantId}
        onLeave={leave}
      />
    ) : (
      <AmfiPlay
        sessionId={joined.sessionId}
        participantId={joined.participantId}
        onLeave={leave}
      />
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-md place-items-center px-5 py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="w-full"
      >
        <div className="file-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">AMFİ KATILIMI</span>
          </div>

          <div className="p-7">
            <div className="mb-7 flex flex-col items-center text-center">
              <Logo size={48} />
              <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
                Derse katıl
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Hesap açmana gerek yok. Kodu ve adını gir, yeter.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="field-label" htmlFor="code">
                  KATILIM KODU
                </label>
                <input
                  id="code"
                  className="field text-center font-mono text-2xl font-bold tracking-[0.28em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toLocaleUpperCase('tr-TR'))}
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="name">
                  ADIN
                </label>
                <input
                  id="name"
                  className="field"
                  value={name}
                  onChange={(e) => {
                    setNameTouched(true)
                    setName(e.target.value)
                  }}
                  placeholder="Ayşe Yılmaz"
                  autoComplete="name"
                />
              </div>

              {error && (
                <p className="rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm text-ink">
                  {error}
                </p>
              )}

              <Button3D type="submit" size="lg" full disabled={busy}>
                {busy ? 'Katılıyor…' : 'Katıl'}
              </Button3D>
            </form>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
