import type { CSSProperties, ReactNode } from 'react'
import { cx } from '@/lib/utils'

interface Props {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** @deprecated 3B eğilme kaldırıldı — kağıt metaforuna aykırıydı. */
  max?: number
  /** @deprecated */
  lift?: number
  /** @deprecated parlama efekti kaldırıldı. */
  glare?: boolean
}

/**
 * Kağıt kartı — üzerine gelince masadan hafifçe kalkar.
 * Eski 3B eğilen/parlayan kart yerine geçti; dosya adı ve API
 * geriye dönük uyumluluk için korundu.
 */
export default function TiltCard({ children, className, style }: Props) {
  return (
    <div
      style={style}
      className={cx(
        'group/paper transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </div>
  )
}
