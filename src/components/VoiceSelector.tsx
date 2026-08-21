import { useEffect, useState } from 'react'
import {
  ELEVENLABS_VOICE_PRESETS,
  getSelectedVoiceId,
  getSelectedVoiceRate,
  isElevenLabsConfigured,
  previewVoice,
  setSelectedVoiceId,
  setSelectedVoiceRate,
  type SpeakHandle,
  type VoicePreset,
} from '@/lib/speech'
import { cx } from '@/lib/utils'

interface Props {
  onSelect?: (preset: VoicePreset) => void
  compact?: boolean
}

export default function VoiceSelector({ onSelect, compact = false }: Props) {
  const [selectedId, setSelectedId] = useState<string>(getSelectedVoiceId())
  const [currentRate, setCurrentRate] = useState<number>(getSelectedVoiceRate())
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [speakHandle, setSpeakHandle] = useState<SpeakHandle | null>(null)

  useEffect(() => {
    return () => {
      speakHandle?.cancel()
    }
  }, [speakHandle])

  const handleSelect = (preset: VoicePreset) => {
    setSelectedId(preset.id)
    setSelectedVoiceId(preset.id)
    onSelect?.(preset)
  }

  const handleRateChange = (rate: number) => {
    setCurrentRate(rate)
    setSelectedVoiceRate(rate)
  }

  const handlePreview = (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation()

    if (previewingId === preset.id) {
      speakHandle?.cancel()
      setPreviewingId(null)
      setSpeakHandle(null)
      return
    }

    speakHandle?.cancel()
    setPreviewingId(preset.id)

    const handle = previewVoice(
      preset.id,
      'Merhaba arkadaşlar, bugünkü dersimize hoş geldiniz. Hazırsanız başlayalım.',
      currentRate,
      () => {
        setPreviewingId(null)
        setSpeakHandle(null)
      },
      () => {
        setPreviewingId(null)
        setSpeakHandle(null)
      },
    )

    setSpeakHandle(handle)
  }

  if (!isElevenLabsConfigured()) {
    return null
  }

  return (
    <div className="file-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-ink">🎙️ Ses & Tonlama Seçimi</span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              ElevenLabs AI
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Dersin seslendirmesi için istediğiniz tonu seçebilir ve önizleme yapabilirsiniz.
          </p>
        </div>

        {/* Hız Ayarı */}
        <div className="flex items-center gap-1.5 rounded-sm border border-paper-edge bg-paper-deep p-1 text-xs">
          <span className="px-2 text-[11px] font-medium text-ink-muted">Okuma Hızı:</span>
          {[
            { label: 'Sakin (%30 Yavaş)', val: 0.85 },
            { label: 'Normal', val: 1.0 },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => handleRateChange(item.val)}
              className={cx(
                'rounded px-2.5 py-1 text-xs font-semibold transition-all',
                Math.abs(currentRate - item.val) < 0.05
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cx(
          'mt-4 grid gap-3',
          compact
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {ELEVENLABS_VOICE_PRESETS.map((preset) => {
          const isSelected = selectedId === preset.id
          const isPlaying = previewingId === preset.id

          return (
            <div
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={cx(
                'group relative flex cursor-pointer flex-col justify-between rounded-sm border p-3.5 transition-all duration-150',
                isSelected
                  ? 'border-ink bg-paper-card ring-2 ring-ink/10 shadow-sm'
                  : 'border-paper-edge bg-paper-deep/60 hover:border-ink/40 hover:bg-paper-card',
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-sm font-bold text-ink">
                      {preset.name}
                    </span>
                    <span
                      className={cx(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        isSelected
                          ? 'bg-ink text-paper'
                          : 'bg-paper-edge text-ink-muted',
                      )}
                    >
                      {preset.tag}
                    </span>
                  </div>

                  {preset.badge && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      {preset.badge}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                  {preset.description}
                </p>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-paper-edge/60 pt-2.5">
                <button
                  type="button"
                  onClick={(e) => handlePreview(e, preset)}
                  className={cx(
                    'flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold transition-all',
                    isPlaying
                      ? 'bg-mark text-white animate-pulse'
                      : 'bg-paper-edge/80 text-ink hover:bg-ink hover:text-paper',
                  )}
                >
                  {isPlaying ? (
                    <>
                      <span className="inline-block h-2 w-2 rounded-full bg-white animate-ping" />
                      Durdur
                    </>
                  ) : (
                    <>
                      <span>▶</span>
                      Önizle
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <span
                    className={cx(
                      'text-[11px] font-semibold',
                      isSelected ? 'text-ink font-bold' : 'text-ink-muted',
                    )}
                  >
                    {isSelected ? '✓ Seçili' : 'Seç'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
