import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Button3D from '@/components/Button3D'
import Loader from '@/components/Loader'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import type { Block, Lesson } from '@/lib/types'
import { cx, uid } from '@/lib/utils'

/** Yapıştırılan ders notunu anlamlı bloklara böler. */
function splitNote(raw: string): string[] {
  const byLine = raw
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  // Tek satırlık uzun metin geldiyse cümlelere böl
  if (byLine.length <= 1) {
    return raw
      .split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
  }

  return byLine.map((l) => l.replace(/^([-•*–]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}

export default function LessonEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulk, setBulk] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    let alive = true
    api.getLesson(id!).then((l) => {
      if (!alive) return
      setLesson(l)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id])

  const patch = (p: Partial<Lesson>) => {
    dirty.current = true
    setLesson((l) => (l ? { ...l, ...p } : l))
  }

  const patchBlock = (bid: string, p: Partial<Block>) => {
    dirty.current = true
    setLesson((l) =>
      l ? { ...l, blocks: l.blocks.map((b) => (b.id === bid ? { ...b, ...p } : b)) } : l,
    )
  }

  const addBlock = () => {
    dirty.current = true
    setLesson((l) =>
      l
        ? { ...l, blocks: [...l.blocks, { id: uid('b'), text: '', isWrong: false, points: 100 }] }
        : l,
    )
  }

  const removeBlock = (bid: string) => {
    dirty.current = true
    setLesson((l) => (l ? { ...l, blocks: l.blocks.filter((b) => b.id !== bid) } : l))
  }

  const move = (index: number, dir: -1 | 1) => {
    setLesson((l) => {
      if (!l) return l
      const next = [...l.blocks]
      const j = index + dir
      if (j < 0 || j >= next.length) return l
      ;[next[index], next[j]] = [next[j], next[index]]
      dirty.current = true
      return { ...l, blocks: next }
    })
  }

  const importBulk = () => {
    const parts = splitNote(bulk)
    if (!parts.length) return toast('Metin boş görünüyor.', 'error')
    dirty.current = true
    setLesson((l) =>
      l
        ? {
            ...l,
            blocks: [
              ...l.blocks,
              ...parts.map((t) => ({ id: uid('b'), text: t, isWrong: false, points: 100 })),
            ],
          }
        : l,
    )
    setBulk('')
    setShowBulk(false)
    toast(`${parts.length} bölüm eklendi. Şimdi hatalı olanları işaretle.`, 'success')
  }

  const save = async (publish?: boolean) => {
    if (!lesson) return
    const cleaned = lesson.blocks.filter((b) => b.text.trim())
    const traps = cleaned.filter((b) => b.isWrong)

    if (!lesson.title.trim()) return toast('Ders başlığı boş olamaz.', 'error')
    if (publish && cleaned.length < 2) return toast('En az 2 bölüm gerekli.', 'error')
    if (publish && traps.length === 0)
      return toast('Yayına almadan önce en az bir hatalı bölüm işaretle.', 'error')
    if (traps.some((b) => !b.correction?.trim()))
      return toast('İşaretlediğin her hata için “doğrusu” alanını doldur.', 'error')

    setSaving(true)
    try {
      const next = { ...lesson, blocks: cleaned, isLive: publish ?? lesson.isLive }
      await api.saveLesson(next)
      setLesson(next)
      dirty.current = false
      toast(publish ? 'Ders yayına alındı.' : 'Kaydedildi.', 'success')
      if (publish) nav('/hoca')
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader label="Dosya yükleniyor…" />
  if (!lesson)
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div className="file-card max-w-md p-10">
          <p className="label">DOSYA BULUNAMADI</p>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">Ders bulunamadı</h2>
          <div className="mt-7">
            <Button3D onClick={() => nav('/hoca')}>Panele Dön</Button3D>
          </div>
        </div>
      </div>
    )

  const traps = lesson.blocks.filter((b) => b.isWrong).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-5xl px-5 py-12 sm:px-6"
    >
      <button
        onClick={() => nav('/hoca')}
        className="mb-6 rounded-sm text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        ← Panele dön
      </button>

      {/* ── Dosya künyesi ── */}
      <div className="file-card mb-8 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-deep px-6 py-3">
          <span className="label">DOSYA KÜNYESİ</span>
        </div>

        <div className="p-7">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="title">
                BAŞLIK
              </label>
              <input
                id="title"
                className="field"
                value={lesson.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Örn. Üst Ekstremite Kemikleri"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="subject">
                DERS / KONU
              </label>
              <input
                id="subject"
                className="field"
                value={lesson.subject}
                onChange={(e) => patch({ subject: e.target.value })}
                placeholder="Anatomi"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="field-label" htmlFor="desc">
                AÇIKLAMA / ÖĞRENCİYE YÖNERGE
              </label>
              <textarea
                id="desc"
                className="field min-h-[84px] resize-y"
                value={lesson.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Bu derste 4 kasıtlı hata var, hepsini yakala!"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Araç çubuğu ── */}
      <div className="file-card sticky top-[76px] z-30 mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="label-chip border-paper-edge bg-paper-deep">
            {lesson.blocks.length} BÖLÜM
          </span>
          <span
            className={cx(
              'label-chip',
              traps > 0
                ? 'border-mark-edge bg-mark-soft text-mark'
                : 'border-paper-edge bg-paper-deep',
            )}
          >
            {traps} TUZAK
          </span>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button3D size="sm" tone="ghost" onClick={() => setShowBulk((s) => !s)}>
            Notu Yapıştır
          </Button3D>
          <Button3D size="sm" tone="ghost" onClick={addBlock} icon="+">
            Bölüm Ekle
          </Button3D>
          <Button3D size="sm" onClick={() => save()} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button3D>
          <Button3D size="sm" tone="success" onClick={() => save(true)} disabled={saving}>
            Yayına Al
          </Button3D>
        </div>
      </div>

      {/* ── Toplu içe aktarma ── */}
      <AnimatePresence>
        {showBulk && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="file-card mb-6 p-6">
              <h3 className="font-display text-lg font-bold text-ink">Ders notunu yapıştır</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                Her satır ayrı bir bölüm olur. Tek paragraf yapıştırırsan cümlelere bölünür.
                Sonrasında hangi bölümlerin yanlış olduğunu işaretlersin.
              </p>
              <textarea
                className="field mt-4 min-h-[200px] resize-y font-mono text-[13px]"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={
                  'Omuz kuşağını clavicula ve scapula oluşturur.\nHumerus kolun tek kemiğidir.\n…'
                }
              />
              <div className="mt-4 flex gap-2">
                <Button3D size="sm" onClick={importBulk}>
                  Bölümlere Dönüştür
                </Button3D>
                <Button3D size="sm" tone="ghost" onClick={() => setShowBulk(false)}>
                  Vazgeç
                </Button3D>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bölümler ── */}
      {lesson.blocks.length === 0 ? (
        <div className="file-card grid place-items-center p-14 text-center">
          <p className="label">SAYFA BOŞ</p>
          <h3 className="mt-4 font-display text-lg font-bold text-ink">Ders notu boş</h3>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            “Notu Yapıştır” ile hazır metnini aktar ya da tek tek bölüm ekle.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {lesson.blocks.map((b, i) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
                className={cx(
                  'file-card-tabbed p-5 transition-colors duration-300',
                  b.isWrong ? 'border-l-mark bg-mark-soft' : 'border-l-paper-edge',
                )}
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-bold text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  <label className="flex cursor-pointer select-none items-center gap-2.5">
                    <span className="relative inline-flex">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={b.isWrong}
                        onChange={(e) =>
                          patchBlock(b.id, {
                            isWrong: e.target.checked,
                            points: b.points ?? 100,
                          })
                        }
                      />
                      <span className="block h-6 w-11 rounded-full border border-paper-edge bg-paper-deep transition-colors peer-checked:border-mark peer-checked:bg-mark peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2" />
                      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-paper-card shadow transition-transform peer-checked:translate-x-5" />
                    </span>
                    <span
                      className={cx(
                        'text-sm font-semibold transition-colors',
                        b.isWrong ? 'text-mark' : 'text-ink-muted',
                      )}
                    >
                      {b.isWrong ? 'Bu bölümde HATA var' : 'Bilgi doğru'}
                    </span>
                  </label>

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      className="rounded-sm px-2 py-1 text-ink-muted transition-colors hover:bg-paper-deep hover:text-ink"
                      title="Yukarı taşı"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      className="rounded-sm px-2 py-1 text-ink-muted transition-colors hover:bg-paper-deep hover:text-ink"
                      title="Aşağı taşı"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeBlock(b.id)}
                      className="rounded-sm px-2 py-1 text-ink-muted transition-colors hover:bg-mark-soft hover:text-mark"
                      title="Bölümü sil"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <textarea
                  className="field min-h-[76px] resize-y leading-relaxed"
                  value={b.text}
                  onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                  placeholder="Ders notunun bu bölümü…"
                />

                <AnimatePresence>
                  {b.isWrong && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px]">
                        <div>
                          <label className="field-label text-verify">
                            DOĞRUSU — ÖĞRENCİYE GÖSTERİLİR
                          </label>
                          <textarea
                            className="field min-h-[62px] resize-y border-verify-edge bg-verify-soft"
                            value={b.correction ?? ''}
                            onChange={(e) => patchBlock(b.id, { correction: e.target.value })}
                            placeholder="Doğrusu şudur çünkü…"
                          />
                        </div>
                        <div>
                          <label className="field-label text-flag">PUAN</label>
                          <input
                            type="number"
                            min={10}
                            max={500}
                            step={10}
                            className="field border-flag-edge bg-flag-soft"
                            value={b.points ?? 100}
                            onChange={(e) =>
                              patchBlock(b.id, { points: Number(e.target.value) || 100 })
                            }
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="flex justify-center pt-2">
            <Button3D tone="ghost" onClick={addBlock} icon="+">
              Bölüm Ekle
            </Button3D>
          </div>
        </div>
      )}
    </motion.div>
  )
}
