/**
 * Gazi Üniversitesi — Hatayı Yakala Resmi Amblem Logosu
 */
export default function Logo({
  size = 44,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src="/icon.png"
      alt="Gazi Üniversitesi Hatayı Yakala Logosu"
      width={size}
      height={size}
      className={`shrink-0 rounded-xl object-contain shadow-sm transition-transform duration-200 group-hover:scale-105 ${className}`}
      style={{ width: size, height: size }}
      loading="eager"
    />
  )
}
