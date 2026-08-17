import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import Logo from '@/components/Logo'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import { TEACHER_CODE } from '@/lib/firebase'
import { isFirebaseConfigured } from '@/lib/api'
import { EASE } from '@/lib/motion'
import { cx } from '@/lib/utils'
import type { Role } from '@/lib/types'

export default function Login() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { signIn, signUp } = useAuth()

  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [role, setRole] = useState<Role>(params.get('rol') === 'teacher' ? 'teacher' : 'student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('kagankarki03@gmail.com')
  const [password, setPassword] = useState('kagan3002')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'in') {
        const u = await signIn(email.trim(), password)
        toast(`Hoş geldin ${u.name}!`, 'success')
        nav(u.role === 'teacher' ? '/hoca' : '/dersler')
      } else {
        if (!name.trim()) throw new Error('Ad soyad gerekli.')
        if (role === 'teacher' && code.trim() !== TEACHER_CODE) {
          throw new Error('Öğretim üyesi kodu hatalı.')
        }
        const u = await signUp(name.trim(), email.trim(), password, role)
        toast('Hesabın oluşturuldu.', 'success')
        nav(u.role === 'teacher' ? '/hoca' : '/dersler')
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
              .replace('Firebase: ', '')
              .replace('auth/invalid-credential', 'E-posta veya şifre hatalı')
              .replace('auth/email-already-in-use', 'Bu e-posta zaten kayıtlı')
              .replace('auth/weak-password', 'Şifre en az 6 karakter olmalı')
              .replace('auth/invalid-email', 'Geçersiz e-posta')
          : 'Bir şeyler ters gitti.'
      toast(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-lg place-items-center px-5 py-14"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="w-full"
      >
        <div className="file-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
            <span className="label">KAYIT FORMU</span>
            <span className="label ml-auto">GAZİ ÜNİVERSİTESİ</span>
          </div>

          <div className="p-7 sm:p-9">
            <div className="mb-8 flex flex-col items-center text-center">
              <Logo size={54} />
              <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
                {mode === 'up' ? 'Aramıza katıl' : 'Tekrar hoş geldin'}
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">Hatayı Yakala platformu</p>
            </div>

            {/* Mod seçici — dosya sekmesi */}
            <div className="mb-7 flex border-b border-paper-edge">
              {(
                [
                  ['up', 'Kayıt Ol'],
                  ['in', 'Giriş Yap'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cx(
                    'relative -mb-px px-5 py-3 text-sm font-semibold transition-colors',
                    mode === m
                      ? 'border-b-2 border-ink text-ink'
                      : 'border-b-2 border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-5">
              {mode === 'up' && (
                <>
                  <div>
                    <span className="field-label">KAYIT TÜRÜ</span>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          ['student', 'Öğrenci'],
                          ['teacher', 'Öğretim Üyesi'],
                        ] as const
                      ).map(([r, label]) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={role === r}
                          onClick={() => setRole(r)}
                          className={cx(
                            'rounded-sm border-2 px-4 py-3.5 text-sm font-semibold transition-all',
                            role === r
                              ? 'border-ink bg-ink text-paper'
                              : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink hover:text-ink',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="name">
                      AD SOYAD
                    </label>
                    <input
                      id="name"
                      className="field"
                      placeholder="Ayşe Yılmaz"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="field-label" htmlFor="email">
                  E-POSTA
                </label>
                <input
                  id="email"
                  className="field"
                  type="email"
                  required
                  placeholder="ornek@gazi.edu.tr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="password">
                  ŞİFRE
                </label>
                <input
                  id="password"
                  className="field"
                  type="password"
                  required
                  minLength={6}
                  placeholder="En az 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                />
              </div>

              {mode === 'up' && role === 'teacher' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                >
                  <label className="field-label" htmlFor="code">
                    ÖĞRETİM ÜYESİ KODU
                  </label>
                  <input
                    id="code"
                    className="field border-flag-edge bg-flag-soft"
                    placeholder="Kurum tarafından verilen kod"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                    Varsayılan kod:{' '}
                    <code className="font-mono font-semibold text-ink">{TEACHER_CODE}</code> —{' '}
                    <code className="font-mono">.env</code> dosyasından değiştirebilirsin.
                  </p>
                </motion.div>
              )}

              <Button3D type="submit" size="lg" full disabled={busy}>
                {busy ? 'Lütfen bekle…' : mode === 'up' ? 'Hesap Oluştur' : 'Giriş Yap'}
              </Button3D>
            </form>

            {!isFirebaseConfigured && (
              <div className="mt-7 rounded-sm border-l-2 border-flag bg-flag-soft p-4 text-[12px] leading-relaxed text-ink">
                <strong className="font-semibold">İnteraktif Deneme Modu:</strong> Hesaplar ve dersler
                bu oturum için yerel hafızada saklanmaktadır. İstediğiniz e-posta ve şifre ile giriş yapıp
                platformu anında deneyimleyebilirsiniz.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
