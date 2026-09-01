/**
 * HOCA — ÖN TEST / SON TEST SORU YÜKLEME
 *
 * Hazırlık ekranında iki kez kullanılır: bir ön test, bir son test için.
 * Soruları tek tek yazmak yerine dosyadan ya da yapıştırarak yüklemek
 * esas yol; yüklenen her soru sonrasında elle düzeltilebilir.
 *
 * Doğru şıklar burada görünür — bu ekran yalnızca hocanın cihazında açılır
 * ve sorular öğrenciye giderken doğru şıkları sökülür (bkz. lib/quiz.ts).
 */
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from './Button3D'
import { useToast } from './Toast'
import { parseQuestions } from '@/lib/quiz'
import type { QuizQuestion } from '@/lib/types'
import { cx, uid } from '@/lib/utils'

const HARF = ['A', 'B', 'C', 'D', 'E']

const ORNEK = `1) Humerus hangi bölgenin kemiğidir?
A) Ön kol
B) Kol
C) El bileği
D) Uyluk
Cevap: B

2) Radius ve ulna hangi bölgede bulunur?
A) Kol
B) Ön kol
C) Bacak
D) Ayak
Cevap: B`

interface Props {
  /** Başlıkta ve mesajlarda geçen ad — "Ön test" / "Son test" */
  baslik: string
  aciklama: string
  /** Ayırt edici renk sınıfı — ön test / son test karışmasın */
  tone: 'pre' | 'post'
  questions: QuizQuestion[]
  onChange: (list: QuizQuestion[]) => void
}

export default function QuizUploader({ baslik, aciklama, tone, questions, onChange }: Props) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [acik, setAcik] = useState(false)
  const [ham, setHam] = useState('')
  const [uyarilar, setUyarilar] = useState<string[]>([])

  /* ── Yükleme ── */
  const yukle = (metin: string, kaynak: string) => {
    const { questions: yeni, warnings } = parseQuestions(metin)
    setUyarilar(warnings)
    if (!yeni.length) {
      toast(`${kaynak}: hiç soru okunamadı.`, 'error')
      return
    }
    onChange([...questions, ...yeni])
    setHam('')
    setAcik(false)
    toast(
      `${yeni.length} soru eklendi${warnings.length ? ` (${warnings.length} uyarı)` : ''}.`,
      'success',
    )
  }

  const dosyaSec = async (file: File | undefined) => {
    if (!file) return
    try {
      const metin = await file.text()
      yukle(metin, file.name)
    } catch (err) {
      toast('Dosya okunamadı: ' + (err as Error).message, 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /* ── Elle düzenleme ── */
  const guncelle = (id: string, patch: Partial<QuizQuestion>) =>
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const sikGuncelle = (id: string, i: number, value: string) =>
    onChange(
      questions.map((q) =>
        q.id === id ? { ...q, options: q.options.map((o, oi) => (oi === i ? value : o)) } : q,
      ),
    )

  const sil = (id: string) => onChange(questions.filter((q) => q.id !== id))

  const bosEkle = () =>
    onChange([
      ...questions,
      { id: uid('q'), question: '', options: ['', '', '', '', ''], correctIndex: 0, points: 1 },
    ])

  const hepsiniSil = () => {
    if (!questions.length) return
    if (!window.confirm(`${baslik}: ${questions.length} sorunun hepsi silinsin mi?`)) return
    onChange([])
    setUyarilar([])
  }

  const eksik = questions.filter(
    (q) => !q.question.trim() || q.options.filter((o) => o.trim()).length < 2,
  ).length

  return (
    <div
      className={cx(
        'file-card space-y-5 border-l-4 p-6',
        tone === 'pre' ? 'border-l-flag' : 'border-l-verify',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="label font-bold">{baslik}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{aciklama}</p>
        </div>
        <span className="label">
          {questions.length} SORU
          {eksik > 0 && <span className="ml-2 text-mark">· {eksik} EKSİK</span>}
        </span>
      </div>

      {/* Yükleme araçları */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.json,.csv,.md,text/plain,application/json"
          className="hidden"
          onChange={(e) => dosyaSec(e.target.files?.[0])}
        />
        <Button3D size="sm" type="button" onClick={() => fileRef.current?.click()}>
          Dosyadan Yükle
        </Button3D>
        <Button3D size="sm" tone="ghost" type="button" onClick={() => setAcik((v) => !v)}>
          {acik ? 'Yapıştırmayı Kapat' : 'Yapıştırarak Yükle'}
        </Button3D>
        <Button3D size="sm" tone="ghost" type="button" onClick={bosEkle}>
          Boş Soru Ekle
        </Button3D>
        {questions.length > 0 && (
          <Button3D size="sm" tone="ghost" type="button" onClick={hepsiniSil}>
            Hepsini Sil
          </Button3D>
        )}
      </div>

      <AnimatePresence>
        {acik && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <textarea
              value={ham}
              onChange={(e) => setHam(e.target.value)}
              className="field min-h-[180px] resize-y font-mono text-[13px]"
              placeholder={ORNEK}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button3D size="sm" type="button" onClick={() => yukle(ham, 'Yapıştırılan metin')}>
                Soruları Ayrıştır
              </Button3D>
              <button
                type="button"
                onClick={() => setHam(ORNEK)}
                className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Örnek biçimi doldur
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Biçim: numaralı soru satırı, altına <code className="font-mono">A)</code> ile
              başlayan şıklar, sonra <code className="font-mono">Cevap: B</code>. Doğru şıkkın
              başına <code className="font-mono">*</code> koyarak da işaretleyebilirsin. JSON
              dosyası da (<code className="font-mono">question, options, correctIndex</code>)
              kabul edilir.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {uyarilar.length > 0 && (
        <div className="rounded-sm border-l-2 border-flag bg-flag-soft p-4 text-[12px] leading-relaxed text-ink">
          <strong className="font-semibold">Yükleme uyarıları:</strong>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {uyarilar.slice(0, 8).map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Soru listesi — yüklenen her soru elle düzeltilebilir */}
      {questions.length === 0 ? (
        <p className="rounded-sm border border-dashed border-paper-edge py-8 text-center text-sm text-ink-muted">
          Henüz soru yok. Bu test boş bırakılırsa derste hiç sorulmaz.
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-sm border border-paper-edge bg-paper-deep p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2.5 font-mono text-xs font-bold text-ink-faint">{qi + 1}</span>
                <textarea
                  value={q.question}
                  onChange={(e) => guncelle(q.id, { question: e.target.value })}
                  className="field min-h-[52px] flex-1 resize-y text-sm"
                  placeholder="Soru metni"
                />
                <button
                  type="button"
                  onClick={() => sil(q.id)}
                  className="mt-2 shrink-0 text-xs font-semibold text-mark hover:underline"
                >
                  Sil
                </button>
              </div>

              <div className="mt-3 space-y-2 pl-7">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Doğru şık"
                      onClick={() => guncelle(q.id, { correctIndex: oi })}
                      className={cx(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                        q.correctIndex === oi
                          ? 'border-verify bg-verify text-paper'
                          : 'border-paper-edge bg-paper-card text-ink-faint hover:border-ink',
                      )}
                    >
                      {HARF[oi]}
                    </button>
                    <input
                      value={opt}
                      onChange={(e) => sikGuncelle(q.id, oi, e.target.value)}
                      className="field flex-1 text-sm"
                      placeholder={`${HARF[oi]} şıkkı${oi > 1 ? ' (boş bırakılabilir)' : ''}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 pl-7 text-[11px] text-ink-muted">
                Yeşil harf doğru cevap — değiştirmek için harfe bas.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
