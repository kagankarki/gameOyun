import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { uid } from '@/lib/utils'

type Kind = 'success' | 'error' | 'info'
interface Item {
  id: string
  kind: Kind
  text: string
}

const Ctx = createContext<{ push: (text: string, kind?: Kind) => void } | null>(null)

/** Kenara iliştirilmiş not kağıdı — sol kenarı renkli şerit. */
const styles: Record<Kind, string> = {
  success: 'border-l-verify',
  error: 'border-l-mark',
  info: 'border-l-ink',
}
const badges: Record<Kind, string> = {
  success: 'bg-verify text-white',
  error: 'bg-mark text-white',
  info: 'bg-ink text-paper',
}
const icons: Record<Kind, string> = { success: '✓', error: '!', info: 'i' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])

  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = uid('t')
    setItems((s) => [...s, { id, kind, text }])
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3800)
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[min(92vw,380px)] flex-col gap-3"
      >
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, x: 32, rotate: 1.5 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-sm border border-paper-edge bg-paper-card px-4 py-3 text-sm text-ink shadow-lift ${styles[i.kind]}`}
              style={{ borderLeftWidth: 3 }}
            >
              <span
                aria-hidden
                className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${badges[i.kind]}`}
              >
                {icons[i.kind]}
              </span>
              <p className="leading-snug">{i.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast, ToastProvider içinde kullanılmalı')
  return c.push
}
