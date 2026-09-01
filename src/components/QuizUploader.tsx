/**
 * HOCA — ÖN TEST / SON TEST SORU YÜKLEME & DÖKÜMAN AKTARMA
 *
 * Hazırlık ve Ders Düzenleme ekranlarında kullanılır: bir ön test, bir son test için.
 * Soruları Word (.docx), TXT, JSON, MD dosyalarından veya Yapay Zekâ ile
 * ders notlarından tek tıkla otomatik olarak aktarabilir.
 */
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from './Button3D'
import Loader from './Loader'
import { useToast } from './Toast'
import { parseQuestions, readDocumentFile } from '@/lib/quiz'
import { extractQuestionsFromDocumentOrText, isGeminiConfigured } from '@/lib/gemini'
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
  lessonTitle?: string
}

export default function QuizUploader({
  baslik,
  aciklama,
  tone,
  questions,
  onChange,
  lessonTitle,
}: Props) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [acik, setAcik] = useState(false)
  const [aiAcik, setAiAcik] = useState(false)
  const [ham, setHam] = useState('')
  const [aiMetin, setAiMetin] = useState('')
  const [soruSayisi, setSoruSayisi] = useState(5)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [uyarilar, setUyarilar] = useState<string[]>([])

  /* ── Standart Format Yükleme ── */
  const yukle = (metin: string, kaynak: string) => {
    const { questions: yeni, warnings } = parseQuestions(metin)
    setUyarilar(warnings)
    if (!yeni.length) {
      toast(`${kaynak}: standart biçimde soru bulunamadı. Yapay Zekâ ile aktarmayı deneyebilirsiniz.`, 'error')
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

  /* ── Dosya Seçimi (Word / Metin) ── */
  const dosyaSec = async (file: File | undefined) => {
    if (!file) return
    setYukleniyor(true)
    try {
      const metin = await readDocumentFile(file)
      if (!metin.trim()) {
        toast('Dosya boş veya okunamadı.', 'error')
        return
      }

      // Önce standart soru formatını dene
      const { questions: yeni, warnings } = parseQuestions(metin)
      if (yeni.length > 0) {
        setUyarilar(warnings)
        onChange([...questions, ...yeni])
        toast(`${file.name}: ${yeni.length} soru başarıyla aktarıldı.`, 'success')
      } else if (isGeminiConfigured) {
        // Standart format tutmadıysa doğrudan yapay zekaya aktar
        toast('Döküman metni inceleniyor, Yapay Zekâ soruları çıkarıyor…', 'info')
        const aiRes = await extractQuestionsFromDocumentOrText({
          rawText: metin,
          kind: tone,
          targetCount: 5,
          lessonTitle,
        })
        if (aiRes.questions.length > 0) {
          onChange([...questions, ...aiRes.questions])
          toast(`Yapay Zekâ dökümandan ${aiRes.questions.length} soru üretti ve ekledi.`, 'success')
        } else {
          toast(aiRes.error || 'Dökümandan soru çıkarılamadı.', 'error')
        }
      } else {
        toast(`${file.name}: standart soru şablonuna uymuyor. Lütfen soruları kontrol edin.`, 'error')
      }
    } catch (err) {
      toast('Dosya okunamadı: ' + (err as Error).message, 'error')
    } finally {
      setYukleniyor(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /* ── Yapay Zekâ ile Metinden Soru Üretme ── */
  const aiIleUret = async () => {
    if (!aiMetin.trim()) {
      toast('Lütfen ders notunu veya metni yapıştırın.', 'error')
      return
    }
    setYukleniyor(true)
    try {
      const res = await extractQuestionsFromDocumentOrText({
        rawText: aiMetin,
        kind: tone,
        targetCount: soruSayisi,
        lessonTitle,
      })
      if (res.questions.length > 0) {
        onChange([...questions, ...res.questions])
        setAiMetin('')
        setAiAcik(false)
        toast(`${res.questions.length} soru Yapay Zekâ ile başarıyla oluşturuldu.`, 'success')
      } else {
        toast(res.error || 'Sorular oluşturulamadı.', 'error')
      }
    } catch (err) {
      toast('Hata oluştu: ' + (err as Error).message, 'error')
    } finally {
      setYukleniyor(false)
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
          <div className="flex items-center gap-2">
            <span
              className={cx(
                'rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                tone === 'pre' ? 'bg-flag-soft text-flag' : 'bg-verify-soft text-verify',
              )}
            >
              {tone === 'pre' ? 'DERS ÖNCESİ' : 'DERS SONRASI'}
            </span>
            <p className="label font-bold text-ink">{baslik}</p>
          </div>
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
          accept=".docx,.txt,.json,.csv,.md,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => dosyaSec(e.target.files?.[0])}
        />
        <Button3D
          size="sm"
          type="button"
          tone="primary"
          onClick={() => fileRef.current?.click()}
          disabled={yukleniyor}
        >
          📄 Döküman Yükle (Word / TXT)
        </Button3D>

        {isGeminiConfigured && (
          <Button3D
            size="sm"
            tone="gold"
            type="button"
            onClick={() => {
              setAiAcik((v) => !v)
              setAcik(false)
            }}
            disabled={yukleniyor}
          >
            ✨ Yapay Zekâ ile Aktar / Üret
          </Button3D>
        )}

        <Button3D
          size="sm"
          tone="ghost"
          type="button"
          onClick={() => {
            setAcik((v) => !v)
            setAiAcik(false)
          }}
          disabled={yukleniyor}
        >
          {acik ? 'Yapıştırmayı Kapat' : '📋 Metin Yapıştır'}
        </Button3D>

        <Button3D size="sm" tone="ghost" type="button" onClick={bosEkle} disabled={yukleniyor}>
          + Boş Soru Ekle
        </Button3D>

        {questions.length > 0 && (
          <Button3D size="sm" tone="ghost" type="button" onClick={hepsiniSil} disabled={yukleniyor}>
            Tümünü Temizle
          </Button3D>
        )}
      </div>

      {yukleniyor && (
        <div className="rounded-sm border border-paper-edge bg-paper-deep p-4 text-center">
          <p className="text-sm font-semibold text-ink">Döküman işleniyor ve sorular aktarılıyor…</p>
        </div>
      )}

      {/* Yapay Zekâ ile Üretme Penceresi */}
      <AnimatePresence>
        {aiAcik && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-sm border border-flag/30 bg-flag-soft/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                ✨ Yapay Zekâ Soru Asistanı ({tone === 'pre' ? 'Ön Test' : 'Son Test'})
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-ink-muted">Üretilecek Soru:</label>
                <select
                  value={soruSayisi}
                  onChange={(e) => setSoruSayisi(Number(e.target.value))}
                  className="rounded border border-paper-edge bg-paper-card px-2 py-1 text-xs font-bold text-ink"
                >
                  <option value={3}>3 Soru</option>
                  <option value={5}>5 Soru</option>
                  <option value={10}>10 Soru</option>
                </select>
              </div>
            </div>
            <textarea
              value={aiMetin}
              onChange={(e) => setAiMetin(e.target.value)}
              className="field min-h-[140px] resize-y text-xs"
              placeholder="Ders notunu, slayt özetini veya soruları buraya yapıştırın. Yapay zekâ otomatik olarak çoktan seçmeli 5 şıklı sorulara dönüştürecektir..."
            />
            <div className="flex items-center justify-between gap-3">
              <Button3D
                size="sm"
                tone="gold"
                type="button"
                onClick={aiIleUret}
                disabled={yukleniyor || !aiMetin.trim()}
              >
                {yukleniyor ? 'Yapay Zekâ Üretiyor…' : 'Soruları Otomatik Çıkar & Ekle'}
              </Button3D>
              <button
                type="button"
                onClick={() => setAiAcik(false)}
                className="text-xs text-ink-muted hover:underline"
              >
                Kapat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standart Metin Yapıştırma Penceresi */}
      <AnimatePresence>
        {acik && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-3"
          >
            <textarea
              value={ham}
              onChange={(e) => setHam(e.target.value)}
              className="field min-h-[160px] resize-y font-mono text-[13px]"
              placeholder={ORNEK}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button3D size="sm" type="button" onClick={() => yukle(ham, 'Yapıştırılan metin')}>
                Soruları Ayrıştır & Ekle
              </Button3D>
              <button
                type="button"
                onClick={() => setHam(ORNEK)}
                className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Örnek şablonu doldur
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-muted">
              Biçim: Numaralı soru satırı, altına <code className="font-mono">A)</code>, <code className="font-mono">B)</code> şıkları,
              altına <code className="font-mono">Cevap: B</code> (veya doğru şık başına <code className="font-mono">*</code>).
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
        <div className="rounded-sm border border-dashed border-paper-edge py-8 text-center text-sm text-ink-muted">
          <p className="font-medium text-ink">Henüz {baslik.toLowerCase()} sorusu eklenmedi.</p>
          <p className="mt-1 text-xs text-ink-faint">
            Döküman yükleyerek, yapay zekâ ile üreterek veya elle soru ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-sm border border-paper-edge bg-paper-deep p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2.5 font-mono text-xs font-bold text-ink-faint">{qi + 1}.</span>
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
                      title={q.correctIndex === oi ? 'Doğru Cevap (Seçili)' : 'Doğru Cevap Yap'}
                      onClick={() => guncelle(q.id, { correctIndex: oi })}
                      className={cx(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 font-mono text-xs font-bold transition-all',
                        q.correctIndex === oi
                          ? 'border-verify bg-verify text-paper ring-2 ring-verify/30'
                          : 'border-paper-edge bg-paper-card text-ink-faint hover:border-ink',
                      )}
                    >
                      {HARF[oi]}
                    </button>
                    <input
                      value={opt}
                      onChange={(e) => sikGuncelle(q.id, oi, e.target.value)}
                      className={cx(
                        'field flex-1 text-sm',
                        q.correctIndex === oi && 'border-verify/50 bg-verify-soft/20 font-medium',
                      )}
                      placeholder={`${HARF[oi]} şıkkı${oi > 1 ? ' (boş bırakılabilir)' : ''}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 pl-7 text-[11px] text-ink-muted">
                Yeşil harf doğru cevaptır. Değiştirmek için doğru olan şıkkın harf butonuna tıklayın.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

