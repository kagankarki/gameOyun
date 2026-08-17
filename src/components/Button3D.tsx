import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/utils'

type Tone = 'primary' | 'danger' | 'ghost' | 'success' | 'gold'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  tone?: Tone
  size?: 'sm' | 'md' | 'lg' | 'xl'
  icon?: ReactNode
  full?: boolean
}

/**
 * Damga butonu — kağıda mühür basar gibi aşağı iner.
 * Dosya adı ve prop API'si geriye dönük uyumluluk için korundu.
 */
const tones: Record<Tone, string> = {
  primary: 'bg-ink text-paper border-ink hover:bg-ink-soft',
  danger: 'bg-mark text-white border-mark hover:brightness-110',
  success: 'bg-verify text-white border-verify hover:brightness-110',
  gold: 'bg-flag text-white border-flag hover:brightness-110',
  ghost: 'bg-paper-card text-ink border-paper-edge hover:border-ink hover:bg-paper-deep',
}

const sizes = {
  sm: 'px-3.5 py-1.5 text-[13px] gap-1.5',
  md: 'px-5 py-2.5 text-[15px] gap-2',
  lg: 'px-6 py-3 text-base gap-2',
  xl: 'px-8 py-4 text-lg gap-2.5',
}

export default function Button3D({
  children,
  tone = 'primary',
  size = 'md',
  icon,
  full,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-sm border-2',
        'font-display font-semibold tracking-tight',
        // Damga hissi: basınca aşağı iner ve gölgesi içeri gömülür
        'shadow-paper transition-all duration-100',
        'hover:-translate-y-px active:translate-y-[2px] active:shadow-press',
        'disabled:pointer-events-none disabled:opacity-40',
        sizes[size],
        tones[tone],
        full && 'w-full',
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="shrink-0 text-[1.05em] leading-none">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  )
}
