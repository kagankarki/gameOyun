import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import Navbar from './components/Navbar'
import Loader from './components/Loader'
import { useAuth } from './context/AuthContext'
import { cx } from './lib/utils'

const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'))
const LessonEditor = lazy(() => import('./pages/LessonEditor'))
const LiveResults = lazy(() => import('./pages/LiveResults'))
const StudentLessons = lazy(() => import('./pages/StudentLessons'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const AmfiHost = lazy(() => import('./pages/AmfiHost'))
const AmfiJoin = lazy(() => import('./pages/AmfiJoin'))
const AmfiSetup = lazy(() => import('./pages/AmfiSetup'))
const AmfiHostV2 = lazy(() => import('./pages/AmfiHostV2'))

function Protected({ children, teacher }: { children: ReactNode; teacher?: boolean }) {
  const { user, loading, isTeacher } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/giris" replace />
  if (teacher && !isTeacher) return <Navigate to="/dersler" replace />
  return <>{children}</>
}

export default function App() {
  const location = useLocation()

  /**
   * Amfi ekranları öğrencinin telefonunda tam ekran bir "uygulama" gibi
   * davranmalı: alt bilgi şeridi, ders sırasında lazım olan durum çubuğunu
   * ve geri sayımı ekranın dışına itiyordu.
   */
  const amfiEkrani = location.pathname.startsWith('/amfi')

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Navbar />

      <main className="flex-1">
        {/*
          Suspense, AnimatePresence'ın İÇİNDE ve anahtarlı olmalı.
          Dışarıda kaldığında, henüz yüklenmemiş bir lazy rotaya SPA ile
          geçerken AnimatePresence eski Routes'u tutuyor, yeni rota hiç
          mount olmuyordu (chunk bile indirilmiyordu) — sayfa değişmiş
          gibi görünüp ekranda eski içerik kalıyordu.
          Anahtarlı Suspense ile her rota için yeni bir sınır oluşur ve
          yükleme sırasında fallback gösterilir.
        */}
        <Suspense key={location.pathname} fallback={<Loader />}>
          <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/giris" element={<Login />} />

              {/* Amfi katılımı — bilinçli olarak HERKESE AÇIK.
                  150 öğrenciye kayıt yaptırmak gerçekçi değil. */}
              <Route path="/amfi" element={<AmfiJoin />} />
              <Route path="/amfi/:code" element={<AmfiJoin />} />

              {/* Amfi 2.0 (not yazma) öğrenci ekranı da /amfi üzerinden açılır —
                  AmfiJoin oturumun sürümüne bakıp doğru oyunu gösterir. */}

              <Route
                path="/dersler"
                element={
                  <Protected>
                    <StudentLessons />
                  </Protected>
                }
              />
              {/* /ders/:id (tek kişilik mod) KALDIRILDI.
                  Öğrenci ders metnini önceden okuyabildiğinde hataların
                  nerede olduğunu da görüyordu — oyunun tamamı buna dayanıyor.
                  Metin artık yalnızca amfide, hocanın sesinden duyuluyor. */}
              <Route
                path="/siralama"
                element={
                  <Protected>
                    <Leaderboard />
                  </Protected>
                }
              />

              <Route
                path="/hoca"
                element={
                  <Protected teacher>
                    <TeacherDashboard />
                  </Protected>
                }
              />
              <Route
                path="/hoca/ders/:id"
                element={
                  <Protected teacher>
                    <LessonEditor />
                  </Protected>
                }
              />
              <Route
                path="/hoca/amfi/:lessonId"
                element={
                  <Protected teacher>
                    <AmfiHost />
                  </Protected>
                }
              />
              <Route
                path="/hoca/amfi-setup/:lessonId"
                element={
                  <Protected teacher>
                    <AmfiSetup />
                  </Protected>
                }
              />
              <Route
                path="/hoca/amfi-host-v2/:lessonId"
                element={
                  <Protected teacher>
                    <AmfiHostV2 />
                  </Protected>
                }
              />
              <Route
                path="/hoca/sonuclar/:id"
                element={
                  <Protected teacher>
                    <LiveResults />
                  </Protected>
                }
              />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <footer
        className={cx(
          'mt-16 border-t border-paper-edge bg-paper-card py-7',
          amfiEkrani && 'hidden',
        )}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-ink-muted sm:flex-row">
          <p>
            © 2026 Gazi Üniversitesi ·{' '}
            <span className="font-semibold text-ink">Prof. Dr. Tuncay Peker</span> &amp;{' '}
            <span className="font-semibold text-ink">Doç. Dr. Ayşe Soylu</span> iş birliğiyle
          </p>
          <p className="label font-medium text-ink">
            Kağan Karkı tarafından hazırlanmıştır
          </p>
        </div>
      </footer>
    </div>
  )
}
