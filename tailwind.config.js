/** @type {import('tailwindcss').Config} */

/**
 * "ADLİ DOSYA" TASARIM SİSTEMİ
 * Ders notu = incelenen belge. Öğrenci o belgeye düzeltme işareti koyar.
 * Tek tema (kağıt). Tüm metin renkleri kağıt zeminde WCAG AA'yı geçer.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Başlıklar — akademik serif
        display: ['"Crimson Pro"', 'Georgia', 'serif'],
        // Gövde — Braille Institute'un okunabilirlik fontu
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        // Dosya etiketleri, numaralar, süre
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      colors: {
        /* Kağıt — zemin katmanları */
        paper: {
          DEFAULT: '#FAF8F4', // sayfa zemini
          card: '#FFFFFF', // dosya kartı
          deep: '#F2EEE7', // gömük alan / ikincil zemin
          edge: '#E7E1D7', // kenar çizgisi
          rule: '#EDE7DC', // cetvel çizgisi
        },

        /* Mürekkep — metin */
        ink: {
          DEFAULT: '#16130F', // 17.46:1 (AAA)
          soft: '#2E2822', // ikincil başlık
          muted: '#57534E', //  7.19:1 (AAA) — yardımcı metin
          faint: '#8A8279', // yalnızca dekoratif / devre dışı
        },

        /* Kırmızı — hata, düzeltme işareti */
        mark: {
          DEFAULT: '#C0281E', // 5.56:1 (AA)
          soft: '#FBEAE8',
          edge: '#E8A9A3',
        },

        /* Yeşil — onay, doğru bilgi */
        verify: {
          DEFAULT: '#1F6F43', // 5.80:1 (AA)
          soft: '#E6F2EA',
          edge: '#A8CDB7',
        },

        /* Amber — uyarı, kaçırılan hata, puan */
        flag: {
          DEFAULT: '#A16207', // 4.64:1 (AA) — büyük punto/etiket tercih edilir
          soft: '#FBF1DE',
          edge: '#E3C88A',
        },
      },

      boxShadow: {
        // Kağıdın masaya düşen yumuşak gölgesi
        paper: '0 1px 2px rgba(22,19,15,.05), 0 8px 20px -8px rgba(22,19,15,.14)',
        // Kaldırılmış sayfa
        lift: '0 2px 4px rgba(22,19,15,.06), 0 18px 36px -14px rgba(22,19,15,.22)',
        // Damga basılmış his (içe gömük)
        press: 'inset 0 2px 4px rgba(22,19,15,.18)',
      },

      keyframes: {
        // Damga vuruşu — hızlı iner, hafif sekerek oturur
        stamp: {
          '0%': { transform: 'scale(1.6) rotate(-8deg)', opacity: '0' },
          '55%': { transform: 'scale(.94) rotate(-3deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-3deg)', opacity: '1' },
        },
        // Mürekkebin kağıda yayılması
        inkspread: {
          '0%': { transform: 'scaleX(0)', opacity: '.35' },
          '100%': { transform: 'scaleX(1)', opacity: '1' },
        },
        // Sayfa çevirme
        pageturn: {
          '0%': { transform: 'rotateY(-12deg) translateY(10px)', opacity: '0' },
          '100%': { transform: 'rotateY(0) translateY(0)', opacity: '1' },
        },
        // Dikkat çeken kırmızı işaret nabzı (yalnızca aktif blokta)
        markpulse: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(192,40,30,.30)' },
          '50%': { boxShadow: '0 0 0 10px rgba(192,40,30,0)' },
        },
        fadeSlideIn: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },

      animation: {
        stamp: 'stamp .42s cubic-bezier(.22,1,.36,1) both',
        inkspread: 'inkspread .5s cubic-bezier(.22,1,.36,1) both',
        pageturn: 'pageturn .45s cubic-bezier(.22,1,.36,1) both',
        markpulse: 'markpulse 2s ease-out infinite',
      },
    },
  },
  plugins: [],
}
