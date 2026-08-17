/**
 * ARAŞTIRMA ANKETİ — öğrencinin telefonunda, ders bitince.
 *
 * Yıldız değerlendirmesinden AYRI ve İSTEĞE BAĞLI. Yıldız beş saniyelik
 * geri bildirim; bu form araştırma verisi. Katılmayan öğrenci de yıldızını
 * vermiş olur, veri tamamen kaybolmaz.
 *
 * Bölüm bölüm ilerliyor: 41 maddeyi telefonda tek sayfada göstermek
 * kimseyi sonuna getirmez.
 */
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import * as ses from '@/lib/session'
import {
  ACIK_UCLU,
  ALT_BOYUTLAR,
  GENEL_SORULAR,
  LIKERT_ETIKETLERI,
  TOPLAM_MADDE,
} from '@/lib/survey'
import type { Participant, SurveyResponse } from '@/lib/types'
import { cx, uid } from '@/lib/utils'

interface Props {
  sessionId: string
  participant: Participant | null
}

/** Adımlar: künye → 8 alt boyut → genel → açık uçlu */
const ADIM_SAYISI = 1 + ALT_BOYUTLAR.length + 2

export default function SurveyForm({ sessionId, participant }: Props) {
  const [acik, setAcik] = useState(false)
  const [adim, setAdim] = useState(0)
  const [gonderildi, setGonderildi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const [katilimciKodu, setKatilimciKodu] = useState('')
  const [grupKodu, setGrupKodu] = useState('')
  const [oncekiDers, setOncekiDers] = useState<'evet' | 'hayir' | ''>('')
  const [likert, setLikert] = useState<Record<number, number>>({})
  const [acikUclu, setAcikUclu] = useState<Record<number, string>>({})

  const cevaplanan = useMemo(
    () => Object.keys(likert).length + Object.values(acikUclu).filter((v) => v.trim()).length,
    [likert, acikUclu],
  )

  const gonder = async () => {
    if (!participant) return
    setBusy(true)
    setHata(null)
    try {
      const r: SurveyResponse = {
        id: uid('survey'),
        sessionId,
        participantId: participant.id,
        katilimciKodu: katilimciKodu.trim(),
        grupKodu: grupKodu.trim(),
        oncekiDers,
        likert,
        acikUclu,
        createdAt: Date.now(),
      }
      await ses.submitSurvey(r)
      setGonderildi(true)
    } catch (err) {
      setHata((err as Error).message || 'Anket gönderilemedi.')
    } finally {
      setBusy(false)
    }
  }

  /* ── Teşekkür ── */
  if (gonderildi)
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="file-card p-6 text-center"
      >
        <span className="stamp-verify animate-stamp">ANKET ALINDI</span>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Katkın için teşekkürler. Yanıtların yalnızca araştırma kapsamında değerlendirilecek.
        </p>
      </motion.div>
    )

  /* ── Davet ── */
  if (!acik)
    return (
      <div className="file-card p-6">
        <p className="label">ARAŞTIRMA ANKETİ</p>
        <h3 className="mt-2 font-display text-lg font-bold text-ink">
          Kasıtlı Hata Temelli Anatomi Eğitimi
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Bu form, uygulanan derse ilişkin öğrenme deneyimini değerlendirmek için hazırlandı.
          Yanıtların yalnızca bilimsel araştırma kapsamında kullanılacak ve{' '}
          <strong className="text-ink">ders başarı notunu etkilemeyecek</strong>.
        </p>
        <p className="mt-3 font-mono text-[11px] text-ink-faint">
          {TOPLAM_MADDE} MADDE · YAKLAŞIK 6 DAKİKA
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button3D size="md" onClick={() => setAcik(true)} disabled={!participant}>
            Ankete Katıl
          </Button3D>
        </div>
      </div>
    )

  const sonAdim = adim === ADIM_SAYISI - 1

  return (
    <div className="file-card p-6">
      {/* İlerleme */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between">
          <p className="label font-bold">ARAŞTIRMA ANKETİ</p>
          <span className="font-mono text-[11px] text-ink-muted">
            {adim + 1}/{ADIM_SAYISI} · {cevaplanan} yanıt
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full bg-verify transition-all duration-300"
            style={{ width: `${((adim + 1) / ADIM_SAYISI) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={adim}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── A. Temel bilgiler ── */}
          {adim === 0 && (
            <div className="space-y-4">
              <h3 className="font-display text-lg font-bold text-ink">Temel Bilgiler</h3>
              <div>
                <label className="field-label" htmlFor="kkod">
                  KATILIMCI KODU (isteğe bağlı)
                </label>
                <input
                  id="kkod"
                  className="field"
                  value={katilimciKodu}
                  onChange={(e) => setKatilimciKodu(e.target.value)}
                  placeholder="Araştırmacının verdiği kod"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="gkod">
                  GRUP KODU (isteğe bağlı)
                </label>
                <input
                  id="gkod"
                  className="field"
                  value={grupKodu}
                  onChange={(e) => setGrupKodu(e.target.value)}
                  placeholder="Örn: A"
                />
              </div>
              <div>
                <p className="field-label">
                  DAHA ÖNCE BU KONUDA FORMAL BİR DERS ALDIN MI?
                </p>
                <div className="flex gap-2">
                  {(
                    [
                      ['evet', 'Evet'],
                      ['hayir', 'Hayır'],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setOncekiDers(v)}
                      className={cx(
                        'flex-1 rounded-sm border-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                        oncekiDers === v
                          ? 'border-ink bg-ink text-paper'
                          : 'border-paper-edge bg-paper-card text-ink hover:border-ink',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── B–I. Likert bölümleri ── */}
          {adim > 0 && adim <= ALT_BOYUTLAR.length && (
            <LikertBolumu
              boyut={ALT_BOYUTLAR[adim - 1]}
              degerler={likert}
              setDeger={(no, v) => setLikert((s) => ({ ...s, [no]: v }))}
            />
          )}

          {/* ── J. Genel değerlendirme ── */}
          {adim === ALT_BOYUTLAR.length + 1 && (
            <div className="space-y-6">
              <h3 className="font-display text-lg font-bold text-ink">Genel Değerlendirme</h3>
              {GENEL_SORULAR.map((s) => (
                <div key={s.no}>
                  <p className="text-sm leading-relaxed text-ink">
                    <span className="font-mono text-xs font-bold text-ink-muted">{s.no}. </span>
                    {s.metin}
                  </p>
                  <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                    {s.etiketler.map((et, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLikert((v) => ({ ...v, [s.no]: i + 1 }))}
                        className={cx(
                          'rounded-sm border-2 px-1 py-2 text-center transition-colors',
                          likert[s.no] === i + 1
                            ? 'border-verify bg-verify text-white'
                            : 'border-paper-edge bg-paper-card hover:border-ink',
                        )}
                      >
                        <span className="block font-display text-base font-bold">{i + 1}</span>
                        <span className="mt-0.5 block text-[9px] leading-tight opacity-80">
                          {et}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── K. Açık uçlu ── */}
          {sonAdim && (
            <div className="space-y-5">
              <h3 className="font-display text-lg font-bold text-ink">Açık Uçlu Sorular</h3>
              {ACIK_UCLU.map((s) => (
                <div key={s.no}>
                  <label className="field-label" htmlFor={`au${s.no}`}>
                    {s.no}. {s.metin}
                  </label>
                  <textarea
                    id={`au${s.no}`}
                    className="field min-h-[90px] resize-none"
                    value={acikUclu[s.no] ?? ''}
                    onChange={(e) => setAcikUclu((v) => ({ ...v, [s.no]: e.target.value }))}
                    placeholder="İstersen boş bırakabilirsin"
                  />
                </div>
              ))}
              {hata && (
                <p className="rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm text-ink">
                  {hata}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gezinme */}
      <div className="mt-6 flex gap-3">
        {adim > 0 && (
          <Button3D size="md" tone="ghost" onClick={() => setAdim((a) => a - 1)} disabled={busy}>
            Geri
          </Button3D>
        )}
        {sonAdim ? (
          <Button3D size="md" tone="success" full onClick={gonder} disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Anketi Gönder'}
          </Button3D>
        ) : (
          <Button3D size="md" full onClick={() => setAdim((a) => a + 1)}>
            Devam
          </Button3D>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAcik(false)}
        className="mt-4 block w-full text-center font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint hover:text-ink-muted"
      >
        Şimdi değil
      </button>
    </div>
  )
}

/* ══════════════ Likert bölümü ══════════════ */

function LikertBolumu({
  boyut,
  degerler,
  setDeger,
}: {
  boyut: (typeof ALT_BOYUTLAR)[number]
  degerler: Record<number, number>
  setDeger: (no: number, v: number) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-bold text-ink">{boyut.baslik}</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          1 = {LIKERT_ETIKETLERI[0]} · 5 = {LIKERT_ETIKETLERI[4]}
        </p>
      </div>

      {boyut.maddeler.map((m) => (
        <div key={m.no}>
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-mono text-xs font-bold text-ink-muted">{m.no}. </span>
            {m.metin}
          </p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-label={`${m.no}. madde: ${LIKERT_ETIKETLERI[v - 1]}`}
                onClick={() => setDeger(m.no, v)}
                className={cx(
                  'rounded-sm border-2 py-2.5 font-display text-base font-bold transition-colors',
                  degerler[m.no] === v
                    ? 'border-verify bg-verify text-white'
                    : 'border-paper-edge bg-paper-card text-ink-muted hover:border-ink',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
