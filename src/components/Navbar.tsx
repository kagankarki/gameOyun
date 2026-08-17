import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import Logo from './Logo'
import Button3D from './Button3D'
import { useAuth } from '@/context/AuthContext'
import { isFirebaseConfigured } from '@/lib/api'
import { cx, initials } from '@/lib/utils'

/** Dosya başlığı — belgenin üst künyesi gibi. */
export default function Navbar() {
  const { user, signOut, isTeacher } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  const [scrolled, setScrolled] = useState(!isHome)

  useEffect(() => {
    if (!isHome) {
      setScrolled(true)
      return
    }
    let lastY = window.scrollY

    const handleScroll = () => {
      const currentY = window.scrollY
      if (currentY > 150) {
        // Show navbar ONLY when scrolling UP
        if (currentY < lastY) {
          setScrolled(true)
        } else {
          setScrolled(false)
        }
      } else {
        setScrolled(false)
      }
      lastY = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHome])

  const links = user
    ? isTeacher
      ? [
        { to: '/hoca', label: 'Panelim' },
        { to: '/siralama', label: 'Sıralama' },
      ]
      : [
        { to: '/dersler', label: 'Dersler' },
        { to: '/siralama', label: 'Sıralama' },
      ]
    : []

  return (
    <>
      {!isHome && <div className="h-[68px]" />}
      <header
        className={cx(
          'fixed top-0 left-0 right-0 z-50 border-b border-paper-edge bg-paper-card/90 backdrop-blur-sm transition-all duration-300',
          scrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-3">
            <Logo size={36} />
            <div className="leading-none">
              <p className="font-display text-[17px] font-bold tracking-tight text-ink">
                Hatayı Yakala
              </p>
              <p className="label mt-1">GAZİ ÜNİVERSİTESİ</p>
            </div>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cx(
                    'rounded-sm px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-paper-deep text-ink ring-1 ring-paper-edge'
                      : 'text-ink-muted hover:bg-paper-deep hover:text-ink',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {!isFirebaseConfigured && (
              <span
                title="İnteraktif test modu aktif."
                className="label-chip hidden border-flag-edge bg-flag-soft text-flag sm:inline-flex"
              >
                DEMO MOD
              </span>
            )}

            {user ? (
              <>
                <div className="hidden items-center gap-2.5 sm:flex">
                  <div className="grid h-9 w-9 place-items-center rounded-sm border border-paper-edge bg-paper-deep font-mono text-xs font-bold text-ink">
                    {initials(user.name)}
                  </div>
                  <div className="leading-tight">
                    <p className="text-[13px] font-semibold text-ink">{user.name}</p>
                    <p className="label mt-0.5">{isTeacher ? 'ÖĞRETİM ÜYESİ' : 'ÖĞRENCİ'}</p>
                  </div>
                </div>
                <Button3D
                  tone="ghost"
                  size="sm"
                  onClick={async () => {
                    await signOut()
                    nav('/')
                  }}
                >
                  Çıkış
                </Button3D>
              </>
            ) : (
              <Button3D size="sm" onClick={() => nav('/giris')}>
                Giriş Yap
              </Button3D>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
