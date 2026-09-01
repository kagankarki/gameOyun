/**
 * KASITLI HATA TEMELLİ ANATOMİ EĞİTİMİ ÖĞRENCİ DEĞERLENDİRME ANKETİ
 *
 * 15 Maddelik Form & 8 Alt Boyut.
 * Öğrencinin telefonunda veya bilgisayarında ders bitiminde açılır.
 */
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import Button3D from '@/components/Button3D'
import * as ses from '@/lib/session'
import {
  ALT_BOYUTLAR,
  ARASTIRMA_KONUSU,
  CALISMA_BASLIGI,
  CALISMA_BASLIGI_KISA,
  KATILIMCI_BILGILENDIRMESI,
  LIKERT_ETIKETLERI,
  TOPLAM_MADDE,
} from '@/lib/survey'
import type { Participant, SurveyResponse } from '@/lib/types'
import { cx, uid } from '@/lib/utils'

interface Props {
  sessionId: string
  participant: Participant | null
}

/** Adımlar: 0: Temel Bilgiler, 1–8: 8 Alt Boyut */
const ADIM_SAYISI = 1 + ALT_BOYUTLAR.length

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

  const cevaplanan = useMemo(() => Object.keys(likert).length, [likert])

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
        acikUclu: {},
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
        <span className="stamp-verify animate-stamp">ANKET TAMAMLANDI</span>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Katkınız için teşekkür ederiz. Yanıtlarınız yalnızca bilimsel araştırma kapsamında
          değerlendirilecektir.
        </p>
      </motion.div>
    )

  /* ── Davet Kartı ── */
  if (!acik)
    return (
      <div className="file-card p-6">
        <p className="label">ARAŞTIRMA ANKETİ</p>
        <h3 className="mt-2 font-display text-lg font-bold text-ink">
          {CALISMA_BASLIGI}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          <strong>Araştırma konusu:</strong> {ARASTIRMA_KONUSU}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          {KATILIMCI_BILGILENDIRMESI}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold text-ink-muted">
            {TOPLAM_MADDE} DEĞERLENDİRME İFADESİ · ~2 DAKİKA
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button3D size="md" tone="gold" onClick={() => setAcik(true)} disabled={!participant}>
            📝 Anketi Doldur
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
          <p className="label font-bold">ÖĞRENCİ DEĞERLENDİRME ANKETİ</p>
          <span className="font-mono text-[11px] text-ink-muted">
            {adim === 0 ? 'Giriş' : `${adim}/${ALT_BOYUTLAR.length}`} · {cevaplanan}/{TOPLAM_MADDE} Yanıt
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
          {/* ── 0. Adım: Katılımcı Bilgileri ── */}
          {adim === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-lg font-bold text-ink">Katılımcı Bilgileri</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Yanıt seçenekleri: 1 = Kesinlikle katılmıyorum | 5 = Kesinlikle katılıyorum
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="kkod">
                  KATILIMCI KODU (İsteğe Bağlı)
                </label>
                <input
                  id="kkod"
                  className="field"
                  value={katilimciKodu}
                  onChange={(e) => setKatilimciKodu(e.target.value)}
                  placeholder="Örn: K-101"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="gkod">
                  GRUP KODU (İsteğe Bağlı)
                </label>
                <input
                  id="gkod"
                  className="field"
                  value={grupKodu}
                  onChange={(e) => setGrupKodu(e.target.value)}
                  placeholder="Örn: Deney Grubu 1"
                />
              </div>

              <div>
                <p className="field-label">
                  DAHA ÖNCE MESENCEPHALON KONUSUNDA FORMAL BİR DERS ALDINIZ MI?
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

          {/* ── 1–8. Adımlar: 8 Alt Boyut ── */}
          {adim > 0 && adim <= ALT_BOYUTLAR.length && (
            <LikertBolumu
              boyut={ALT_BOYUTLAR[adim - 1]}
              degerler={likert}
              setDeger={(no, v) => setLikert((s) => ({ ...s, [no]: v }))}
            />
          )}

          {hata && (
            <p className="mt-4 rounded-sm border-l-2 border-mark bg-mark-soft px-4 py-3 text-sm text-ink">
              {hata}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gezinme Butonları */}
      <div className="mt-6 flex gap-3">
        {adim > 0 && (
          <Button3D size="md" tone="ghost" onClick={() => setAdim((a) => a - 1)} disabled={busy}>
            Geri
          </Button3D>
        )}
        {sonAdim ? (
          <Button3D size="md" tone="success" full onClick={gonder} disabled={busy}>
            {busy ? 'Gönderiliyor…' : '✓ Anketi Tamamla & Gönder'}
          </Button3D>
        ) : (
          <Button3D size="md" full onClick={() => setAdim((a) => a + 1)}>
            İleri ➔
          </Button3D>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAcik(false)}
        className="mt-4 block w-full text-center font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint hover:text-ink-muted"
      >
        Kapat
      </button>
    </div>
  )
}

/* ══════════════ Likert Alt Boyut Bölümü ══════════════ */

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
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-ink">{boyut.baslik}</h3>
          <span className="rounded-sm bg-paper-deep px-2 py-0.5 font-mono text-[10px] font-bold text-ink-muted">
            Madde {boyut.maddeAraligi}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          1: Kesinlikle katılmıyorum · 3: Kararsızım · 5: Kesinlikle katılıyorum
        </p>
      </div>

      {boyut.maddeler.map((m) => (
        <div key={m.no} className="rounded-sm border border-paper-edge bg-paper-card p-3.5">
          <p className="text-sm font-medium leading-relaxed text-ink">
            <span className="font-mono text-xs font-bold text-ink-muted mr-1.5">{m.no}.</span>
            {m.metin}
            {m.ters && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-mark">
                (TERS)
              </span>
            )}
          </p>

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-label={`${m.no}. madde: ${LIKERT_ETIKETLERI[v - 1]}`}
                onClick={() => setDeger(m.no, v)}
                className={cx(
                  'flex flex-col items-center justify-center rounded-sm border-2 py-2 transition-all',
                  degerler[m.no] === v
                    ? 'border-verify bg-verify text-white shadow-sm font-bold scale-[1.03]'
                    : 'border-paper-edge bg-paper-deep text-ink-muted hover:border-ink hover:text-ink',
                )}
              >
                <span className="font-display text-base font-bold leading-none">{v}</span>
                <span className="mt-1 text-[8px] leading-tight text-center truncate max-w-[50px] opacity-80">
                  {v === 1
                    ? 'Katılmıyorum'
                    : v === 3
                      ? 'Kararsız'
                      : v === 5
                        ? 'Katılıyorum'
                        : `${v}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
