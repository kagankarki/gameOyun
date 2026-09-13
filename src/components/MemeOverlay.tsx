import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const CORRECT_MEMES = [
  '/meme/correct/1.png',
  '/meme/correct/2.jpg',
  '/meme/correct/3.png',
  '/meme/correct/4.jpg',
  '/meme/correct/5.jpg',
  '/meme/correct/6.jpg',
  '/meme/correct/7.jpg',
]

const INCORRECT_MEMES = [
  '/meme/incorrrect/1.jpg',
  '/meme/incorrrect/2.jpg',
  '/meme/incorrrect/3.jpg',
  '/meme/incorrrect/4.jpg',
  '/meme/incorrrect/5.png',
  '/meme/incorrrect/6.jpg',
  '/meme/incorrrect/7.jpg',
  '/meme/incorrrect/8.jpg',
]

interface Props {
  type: 'correct' | 'incorrect' | null
  onClose: () => void
  autoCloseMs?: number
}

export default function MemeOverlay({ type, onClose, autoCloseMs = 3000 }: Props) {
  const [memeUrl, setMemeUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!type) {
      setMemeUrl(null)
      return
    }

    const list = type === 'correct' ? CORRECT_MEMES : INCORRECT_MEMES
    const randomIndex = Math.floor(Math.random() * list.length)
    setMemeUrl(list[randomIndex])

    // Dokunsal geri bildirim
    if (type === 'correct') {
      navigator.vibrate?.([40, 60, 40])
    } else {
      navigator.vibrate?.(120)
    }

    const timer = setTimeout(() => {
      onClose()
    }, autoCloseMs)

    return () => clearTimeout(timer)
  }, [type, onClose, autoCloseMs])

  return (
    <AnimatePresence>
      {type && memeUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative flex max-w-sm flex-col items-center overflow-hidden rounded-2xl border border-white/20 bg-neutral-900/90 p-4 shadow-2xl backdrop-blur-xl"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          >
            {/* Üst Rozet */}
            <div
              className={`mb-3 flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide shadow-sm ${
                type === 'correct'
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : 'border-rose-500/50 bg-rose-500/20 text-rose-300'
              }`}
            >
              <span>{type === 'correct' ? '🎉' : '😅'}</span>
              <span>
                {type === 'correct' ? 'HATAYI DOĞRU BİLDİN!' : 'BOŞA BASTIN!'}
              </span>
            </div>

            {/* Meme Resmi */}
            <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-inner">
              <img
                src={memeUrl}
                alt={type === 'correct' ? 'Tebrikler' : 'Boşa basıldı'}
                className="max-h-[60vh] max-w-full object-contain rounded-lg"
              />
            </div>

            {/* Alt Kapatma Notu */}
            <p className="mt-3 text-xs font-medium text-neutral-400">
              Kapatmak için dokun
            </p>

            {/* Otomatik kapanma ilerleme çubuğu */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: autoCloseMs / 1000, ease: 'linear' }}
              className={`mt-2 h-1 w-full origin-left rounded-full ${
                type === 'correct' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
