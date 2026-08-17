/**
 * Logo — incelenen belge ve üzerine vurulmuş kırmızı düzeltme işareti.
 * "Hatayı Yakala": sayfadaki hatalı satır kırmızı, köşede işaret mührü.
 */
export default function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="Hatayı Yakala"
      className="shrink-0"
    >
      {/* Belge */}
      <rect
        x="7"
        y="4"
        width="29"
        height="37"
        rx="2"
        fill="#FFFFFF"
        stroke="#16130F"
        strokeWidth="2.2"
      />

      {/* Doğru satırlar */}
      <rect x="13" y="12" width="17" height="2.4" rx="1.2" fill="#8A8279" />
      <rect x="13" y="26" width="17" height="2.4" rx="1.2" fill="#8A8279" />
      <rect x="13" y="33" width="11" height="2.4" rx="1.2" fill="#8A8279" />

      {/* Hatalı satır — kırmızı, altı dalgalı */}
      <rect x="13" y="19" width="17" height="2.4" rx="1.2" fill="#C0281E" />

      {/* Köşeye vurulmuş kırmızı işaret mührü */}
      <g transform="rotate(-8 34 32)">
        <circle cx="34" cy="32" r="11" fill="#FFFFFF" stroke="#C0281E" strokeWidth="2.4" />
        <path
          d="M29 32.2 l3.4 3.6 l6.2 -7.6"
          fill="none"
          stroke="#C0281E"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
