import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import Button3D from '@/components/Button3D'
import TiltCard from '@/components/TiltCard'
import { useAuth } from '@/context/AuthContext'
import { EASE } from '@/lib/motion'
import { cx } from '@/lib/utils'
import HeroDemo from '@/components/demo'

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: d, ease: EASE },
})

const steps = [
  {
    n: '01',
    title: 'Hoca dersi hazırlar',
    body: 'Ders notunu yapıştırır, hangi cümlelerin kasıtlı olarak yanlış olduğunu ve neden yanlış olduğunu yazar. Metin otomatik olarak okunacak parçalara bölünür.',
  },
  {
    n: '02',
    title: 'Öğrenciler koddan katılır',
    body: 'Perdeye düşen QR ya da 6 haneli kodla girilir. Hesap açmak gerekmez. Telefonlarında tek bir buton vardır — ders metni görünmez.',
  },
  {
    n: '03',
    title: 'Dinle, duy, bas, yaz',
    body: 'Ders sesli okunur. Öğrenci hatayı duyduğu an “HATA VAR”a basar; süresi o anda durur. Sonra acele etmeden neyin yanlış olduğunu yazar.',
  },
  {
    n: '04',
    title: 'Gemini anında karar verir',
    body: 'Yazılan not, hocanın açıklamasıyla karşılaştırılır. Doğruysa puan aynı saniyede perdedeki sıralamaya yansır.',
  },
]

/** Puanlama şeridi — sayılar session.ts'teki sabitlerle aynı */
const scoring = [
  {
    tone: 'verify' as const,
    head: '+100',
    title: 'Hatayı doğru açıkladın',
    body: 'Üstüne 30 puana kadar hız bonusu. Bonus, yazıyı bitirdiğin ana göre değil butona bastığın ana göre hesaplanır.',
  },
  {
    tone: 'mark' as const,
    head: '−40',
    title: 'Boşa bastın',
    body: 'O parçada hata yoktu ya da yazdığın açıklama tutmadı. Emin değilsen basmamak daha kârlı.',
  },
  {
    tone: 'flag' as const,
    head: '0',
    title: 'Hatayı kaçırdın',
    body: 'Puan kaybetmezsin ama “kaçırdın” olarak işlenir. Ders sonu raporunda hocanın gördüğü şey budur.',
  },
]

const stats = [
  { k: 'Anlık', v: 'Geri bildirim', d: 'İşaretlediğin an doğrusunu öğrenirsin' },
  { k: 'Erişilebilir', v: 'Tasarım', d: 'Yüksek kontrast, klavyeyle tam kullanım' },
  { k: 'Canlı', v: 'Ders Rekabeti', d: 'Anlık doğru/yanlış tepki ölçümü ve skor' },
]

export default function Landing() {
  const nav = useNavigate()
  const { user, isTeacher } = useAuth()
  const { scrollYProgress } = useScroll()

  // Video 3 End State & Ref
  const [videoEnded, setVideoEnded] = useState(false)
  const video3Ref = useRef<HTMLVideoElement>(null)

  const handleReplayVideo = () => {
    setVideoEnded(false)
    if (video3Ref.current) {
      video3Ref.current.currentTime = 0
      video3Ref.current.play()
    }
  }

  // Ultra-Premium Scroll Effects: Parallax, Zoom, Blur & Opacity
  const imageSectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: imageScrollProgress } = useScroll({
    target: imageSectionRef,
    offset: ['start end', 'end start'],
  })

  // 1. Opacity Fade
  const imageFadeOpacity = useTransform(imageScrollProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0])

  // 2. Slow Ken Burns Zoom
  const imageZoomScale = useTransform(imageScrollProgress, [0, 1], [1.0, 1.18])

  // 3. Parallax Y Motion
  const imageParallaxY = useTransform(imageScrollProgress, [0, 1], [-80, 80])

  // 4. Cinematic Focus / Blur Transition
  const imageBlur = useTransform(
    imageScrollProgress,
    [0, 0.3, 0.7, 1],
    ['blur(12px)', 'blur(0px)', 'blur(0px)', 'blur(12px)']
  )

  // 5. Floating Text Parallax
  const textParallaxY = useTransform(imageScrollProgress, [0, 1], [40, -40])

  // Dynamic ambient glow colors shifting as user scrolls down the landing page
  const ambientGlow = useTransform(
    scrollYProgress,
    [0, 0.3, 0.65, 1],
    [
      'radial-gradient(circle at 50% 10%, rgba(192, 40, 30, 0.12) 0%, transparent 60%)',
      'radial-gradient(circle at 80% 40%, rgba(161, 98, 7, 0.15) 0%, transparent 65%)',
      'radial-gradient(circle at 20% 70%, rgba(31, 111, 67, 0.15) 0%, transparent 65%)',
      'radial-gradient(circle at 50% 90%, rgba(192, 40, 30, 0.18) 0%, transparent 60%)',
    ]
  )

  return (
    /* overflow-x-clip: tam genişlik bölümleri (-50vw hilesi) 100vw kullanıyor,
       o da dikey kaydırma çubuğunun genişliğini içeriyor — masaüstü/tablette
       birkaç piksel yatay kaydırma doğuruyordu. `clip`, `hidden`in aksine
       yeni bir kaydırma bağlamı yaratmadığı için fixed/parallax bozulmuyor. */
    <div className="relative overflow-x-clip">
      <motion.div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
        style={{ background: ambientGlow }}
      />
      <HeroDemo />
      <motion.div exit={{ opacity: 0 }} className="relative z-10 mx-auto max-w-7xl px-5 sm:px-6">
        {/* ───────────── HERO ───────────── */}
      <section className="grid min-h-[calc(100dvh-68px)] place-items-center py-16">
        <div className="w-full">
          <motion.div {...fade(0)} className="flex justify-center">
            <span className="label-chip border-paper-edge bg-paper-card">
              <span className="h-1.5 w-1.5 rounded-full bg-mark" />
              GAZİ ÜNİVERSİTESİ × PROF. DR. TUNCAY PEKER
            </span>
          </motion.div>

          <motion.h1
            {...fade(0.08)}
            className="mt-8 text-center font-display text-[clamp(2.8rem,9vw,6.5rem)] font-bold leading-[0.95] tracking-tight text-ink"
          >
            Hatayı
            <br />
            <span className="relative inline-block">
              Yakala
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.55, duration: 0.6, ease: EASE }}
                className="absolute -bottom-1 left-0 h-[6px] w-full origin-left bg-mark"
              />
            </span>
          </motion.h1>

          <motion.p
            {...fade(0.18)}
            className="mx-auto mt-10 max-w-2xl text-center text-[16px] leading-relaxed text-ink-muted sm:text-lg"
          >
            Hoca derste bilinçli olarak{' '}
            <span className="font-semibold text-mark">yanlış bilgi</span> verir. Sen hatayı fark
            ettiğin anda işaretlersin. Dinleyici değil,{' '}
            <span className="font-semibold text-ink">dersi denetleyen</span> olursun.
          </motion.p>

          <motion.div
            {...fade(0.26)}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            {user ? (
              <>
                <Button3D size="lg" icon="→" onClick={() => nav(isTeacher ? '/hoca' : '/dersler')}>
                  {isTeacher ? 'Panelime Git' : 'Derslere Gir'}
                </Button3D>
                {/* Üst şerit ana sayfanın tepesinde gizli; başka hesapla girmek
                    isteyen (ör. telefonu devralan hoca) buradan çıkabilsin. */}
                <Button3D size="lg" tone="ghost" onClick={() => nav('/giris')}>
                  Hesap Değiştir
                </Button3D>
              </>
            ) : (
              <>
                <Button3D size="lg" onClick={() => nav('/giris')}>
                  Hemen Başla
                </Button3D>
                <Button3D size="lg" tone="ghost" onClick={() => nav('/giris?rol=teacher')}>
                  Hoca Girişi
                </Button3D>
              </>
            )}
          </motion.div>

          {/* Örnek dosya sayfası — ürünün özü */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7, ease: EASE }}
            className="mx-auto mt-20 max-w-3xl"
          >
            <TiltCard>
              <div className="file-card-tabbed border-l-ink overflow-hidden text-left">
                <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
                  <span className="label">ANATOMİ · BÖLÜM 02</span>
                  <span className="label ml-auto">İNCELEME</span>
                </div>

                <div className="p-7 sm:p-9">
                  <p className="font-display text-xl leading-relaxed text-ink sm:text-2xl">
                    Omuz kuşağını oluşturan kemikler{' '}
                    <span className="mark-underline font-semibold">clavicula ve sternum</span>’dur.
                  </p>

                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Button3D tone="danger" size="lg">
                      Burada Yanlış Var!
                    </Button3D>
                    <span className="stamp-verify animate-stamp">YAKALANDI</span>
                  </div>

                  <p className="marginalia mt-6">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-verify">
                      DOĞRUSU
                    </span>
                    <br />
                    Omuz kuşağını clavicula ve scapula oluşturur. Sternum, gövde iskeletine aittir.
                  </p>
                </div>
              </div>
            </TiltCard>
          </motion.div>

          {/* Ultra-Premium Parallax, Zoom & Blur Full-Screen Image Section */}
          <div ref={imageSectionRef} className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen min-h-screen my-12 flex justify-center items-center overflow-hidden">
            <motion.div
              style={{
                opacity: imageFadeOpacity,
                filter: imageBlur,
              }}
              className="relative w-full h-screen overflow-hidden"
            >
              <motion.img
                src="/anatomy.jpg"
                alt="Anatomi Görseli"
                style={{
                  scale: imageZoomScale,
                  y: imageParallaxY,
                }}
                className="h-[125%] w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/70 pointer-events-none flex items-center justify-center">
                <motion.div
                  style={{ y: textParallaxY }}
                  className="text-center px-6 max-w-3xl"
                >
                  <span className="label-chip border-white/20 bg-black/40 text-white backdrop-blur mb-4 inline-block tracking-widest font-mono text-xs">
                    ANATOMİ DERS MODELİ
                  </span>
                  <h3 className="font-display text-4xl sm:text-6xl font-bold text-white tracking-tight leading-tight">
                    Detaylı İnceleme & İnteraktif Analiz
                  </h3>
                  <p className="mt-4 text-white/80 text-sm sm:text-base max-w-xl mx-auto font-sans">
                    Ders notlarındaki hataları gerçek zamanlı yakalayın, bilginizi anında sınayın.
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ───────────── NASIL OYNANIR ─────────────
          Kahraman bölümündeki “Nasıl Oynanır?” butonu buraya çapa atıyor.
          scroll-mt: sabit navbar başlığı örtmesin. */}
      <section id="nasil-oynanir" className="scroll-mt-24 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ ease: EASE }}
          className="mb-12"
        >
          <p className="label">NASIL OYNANIR</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Dört adımda aktif ders
          </h2>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-muted">
            Oyun amfide, ders sırasında oynanır. Önceden çalışılacak bir şey yok —
            tek yapman gereken derse gelmek ve gerçekten dinlemek.
          </p>
          <div className="rule mt-8" />
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }}
            >
              <TiltCard className="h-full">
                <div className="file-card-tabbed border-l-ink h-full p-6">
                  <p className="font-mono text-3xl font-bold text-paper-edge">{s.n}</p>
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        {/* Oyunun can alıcı kuralı */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_1fr]"
        >
          <div className="file-card-tabbed border-l-mark p-7 sm:p-9">
            <p className="label">OYUNUN KURALI</p>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Ekranında metin yok
            </h3>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              Ders notunu okuyabilseydin hataların nerede olduğunu da görürdün — oyunun
              tamamı bunun üzerine kurulu. Bu yüzden öğrenci telefonunda hiçbir zaman
              metin görünmez. Kulağın dışında bir kaynağın yok.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              Telefonunda tek bir şey var: kocaman bir buton. Hatayı duyduğun an ona
              basarsın, kutu açılır, ne olduğunu yazarsın.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="stamp-mark animate-stamp">HATA VAR</span>
              <span className="font-mono text-xs text-ink-muted">
                → basınca süren durur, sonra rahat rahat yazarsın
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {scoring.map((s) => (
              <div
                key={s.head}
                className={cx(
                  'file-card flex gap-5 border-l-4 p-5',
                  s.tone === 'verify' && 'border-l-verify',
                  s.tone === 'mark' && 'border-l-mark',
                  s.tone === 'flag' && 'border-l-flag',
                )}
              >
                <p
                  className={cx(
                    'w-16 shrink-0 font-display text-2xl font-bold',
                    s.tone === 'verify' && 'text-verify',
                    s.tone === 'mark' && 'text-mark',
                    s.tone === 'flag' && 'text-flag',
                  )}
                >
                  {s.head}
                </p>
                <div className="min-w-0">
                  <p className="font-display font-bold text-ink">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Hoca tarafı */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="file-card mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 p-7"
        >
          <div className="min-w-0 flex-1">
            <p className="label">HOCAYSAN</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              Ders notunu yapıştırıp yanlış yerleri işaretlemen yeterli — hazırlık beş
              dakika. Ders boyunca kimin ne yazdığını, hangi hatayı kaçının yakaladığını
              perdede canlı görürsün.
            </p>
          </div>
          <Button3D tone="ghost" onClick={() => nav('/giris?rol=teacher')}>
            Hoca Girişi
          </Button3D>
        </motion.div>
      </section>

      {/* ───────────── ÖZELLİK ŞERİDİ ───────────── */}
      <section className="pb-24">
        <div className="grid gap-px overflow-hidden rounded-sm border border-paper-edge bg-paper-edge sm:grid-cols-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.v}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-paper-card p-7"
            >
              <p className="font-display text-3xl font-bold text-ink">{s.k}</p>
              <p className="mt-1 text-sm font-semibold text-ink-soft">{s.v}</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ───────────── SON ÇAĞRI ───────────── */}
      <section className="pb-28">
        <div className="file-card p-10 text-center sm:p-16">
          <p className="label">KAYIT</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Oyuna hazır mısın?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-muted">
            Öğrenciysen sıralamada yerini al, hocaysan ilk dersini beş dakikada hazırla.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Button3D size="lg" onClick={() => nav('/giris')}>
              Öğrenci Olarak Katıl
            </Button3D>
            <Button3D size="lg" tone="ghost" onClick={() => nav('/giris?rol=teacher')}>
              Ders Oluştur
            </Button3D>
          </div>
          <p className="mt-7 text-xs text-ink-muted">
            Zaten hesabın var mı?{' '}
            <Link to="/giris" className="font-semibold text-ink underline underline-offset-4">
              Giriş yap
            </Link>
          </p>
        </div>
      </section>

      {/* ───────────── ALT DERS VİDEOSU FULLSCREEN (video3.mp4) ───────────── */}
      <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen min-h-screen h-screen overflow-hidden bg-black mt-16">
        <video
          src="/video3.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-black/45 pointer-events-none flex flex-col items-center justify-center text-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 25 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE }}
            className="flex flex-col items-center gap-6"
          >
            <span className="label-chip border-verify-edge bg-verify-soft text-verify text-xs sm:text-sm px-4 py-1.5 font-bold tracking-widest uppercase">
              GAZİ ÜNİVERSİTESİ × PROF. DR. TUNCAY PEKER × KAĞAN KARKI
            </span>
            <h2 className="font-display text-6xl sm:text-8xl md:text-9xl font-extrabold text-white tracking-tight drop-shadow-2xl">
              BAŞARILAR
            </h2>
            <p className="text-white/85 text-base sm:text-xl max-w-lg font-sans">
              Derslerinizde, sınavlarınızda ve akademik hayatınızda başarılar dileriz.
            </p>
          </motion.div>
        </div>
      </section>
    </motion.div>
    </div>
  )
}
