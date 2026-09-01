/**
 * KASITLI HATA TEMELLİ ANATOMİ EĞİTİMİ ÖĞRENCİ DEĞERLENDİRME ANKETİ
 *
 * 15 Maddelik Likert Formu ve 8 Alt Boyut Analiz Modeli.
 * 13. ve 14. maddeler TERS puanlanır: (1→5, 2→4, 3→3, 4→2, 5→1).
 *
 * Puanlama notu: Alt boyutlar madde ortalaması (1.00–5.00) ile raporlanır.
 */

export interface AnketMaddesi {
  no: number
  metin: string
  /** 13 ve 14: ters puanlanır */
  ters?: boolean
}

export interface AltBoyut {
  kod: string
  baslik: string
  maddeAraligi: string
  maddeler: AnketMaddesi[]
}

export const CALISMA_BASLIGI =
  'KASITLI HATA TEMELLİ ANATOMİ EĞİTİMİ ÖĞRENCİ DEĞERLENDİRME ANKETİ'

export const CALISMA_BASLIGI_KISA = 'Öğrenci Değerlendirme Anketi'

export const ARASTIRMA_KONUSU =
  'Mesencephalon dersinde kasıtlı pedagojik hata tespiti, reaksiyon süresi ve öğrenme çıktılarının değerlendirilmesi.'

export const KATILIMCI_BILGILENDIRMESI =
  'Bu form, uygulanan mesencephalon dersine ilişkin öğrenme deneyiminizi değerlendirmek amacıyla hazırlanmıştır. ' +
  'Yanıtlarınız yalnızca bilimsel araştırma kapsamında değerlendirilecek ve ders başarı notunuzu etkilemeyecektir.'

export const LIKERT_ETIKETLERI = [
  'Kesinlikle katılmıyorum',
  'Katılmıyorum',
  'Kararsızım',
  'Katılıyorum',
  'Kesinlikle katılıyorum',
] as const

export const ALT_BOYUTLAR: AltBoyut[] = [
  {
    kod: '1',
    baslik: 'Dikkat / Aktif Katılım',
    maddeAraligi: '1–2',
    maddeler: [
      { no: 1, metin: 'Ders boyunca anlatılan anatomik bilgileri dikkatle takip ettim.' },
      {
        no: 2,
        metin:
          'Ders yöntemi, pasif olarak dinlemek yerine derse zihinsel olarak aktif katılmamı sağladı.',
      },
    ],
  },
  {
    kod: '2',
    baslik: 'Bilişsel Sorgulama',
    maddeAraligi: '3–4',
    maddeler: [
      { no: 3, metin: 'Duyduğum bilgileri önceden sahip olduğum anatomi bilgisiyle karşılaştırdım.' },
      {
        no: 4,
        metin:
          'Bir anatomik bilginin doğru olup olmadığını değerlendirmek, konu hakkında daha ayrıntılı düşünmemi sağladı.',
      },
    ],
  },
  {
    kod: '3',
    baslik: 'Hata Tespiti ve Düzeltme Yoluyla Öğrenme',
    maddeAraligi: '5–7',
    maddeler: [
      {
        no: 5,
        metin:
          'Ders sırasında hatalı bilgileri tespit etmeye çalışmak doğru anatomik bilgiyi daha iyi öğrenmeme yardımcı oldu.',
      },
      {
        no: 6,
        metin:
          'Bir hatayı fark ettikten sonra doğru bilginin verilmesi, doğru bilgiyi hatırlamamı kolaylaştırdı.',
      },
      {
        no: 7,
        metin:
          'Hatalı bilgi ile doğru bilgiyi karşılaştırmak anatomik konuyu daha iyi anlamamı sağladı.',
      },
    ],
  },
  {
    kod: '4',
    baslik: 'Görsel-Mekânsal ve Klinik-Fonksiyonel Öğrenme',
    maddeAraligi: '8–9',
    maddeler: [
      {
        no: 8,
        metin:
          'Ders sırasında kullanılan anatomik görseller, yapıların birbirleriyle olan mekânsal ilişkilerini anlamamı kolaylaştırdı.',
      },
      {
        no: 9,
        metin:
          'Klinik ve fonksiyonel ilişkiler, temel anatomik bilgiyi anlamlandırmamı kolaylaştırdı.',
      },
    ],
  },
  {
    kod: '5',
    baslik: 'Algılanan Öğrenme ve Kalıcılık',
    maddeAraligi: '10–11',
    maddeler: [
      {
        no: 10,
        metin:
          'Bu ders sonunda mesencephalon anatomisini ders öncesine göre daha iyi anladığımı düşünüyorum.',
      },
      {
        no: 11,
        metin:
          'Bu derste üzerinde özellikle düşündüğüm anatomik bilgileri daha uzun süre hatırlayacağımı düşünüyorum.',
      },
    ],
  },
  {
    kod: '6',
    baslik: 'Kullanılabilirlik',
    maddeAraligi: '12',
    maddeler: [
      {
        no: 12,
        metin: 'Mobil uygulamadaki hata bildirme ve yanıt verme sürecini kullanmak kolaydı.',
      },
    ],
  },
  {
    kod: '7',
    baslik: 'Bilişsel Yük / Olumsuz Etki',
    maddeAraligi: '13–14',
    maddeler: [
      {
        no: 13,
        metin: 'Ders sırasında olası hataları takip etmek zihinsel olarak yorucuydu.',
        ters: true,
      },
      {
        no: 14,
        metin:
          'Hatalı bilgi duymak, ders sonunda hangi bilginin doğru olduğu konusunda kafamı karıştırdı.',
        ters: true,
      },
    ],
  },
  {
    kod: '8',
    baslik: 'Yöntemin Kabulü',
    maddeAraligi: '15',
    maddeler: [
      {
        no: 15,
        metin: 'Bu öğretim yönteminin anatominin diğer konularında da kullanılmasını isterim.',
      },
    ],
  },
]

/** Tüm 15 soru sırasıyla */
export const ANKET_MADDELERI: AnketMaddesi[] = ALT_BOYUTLAR.flatMap((b) => b.maddeler)
export const TOPLAM_MADDE = 15

/** 13 ve 14 numaralı ters maddeler */
export const TERS_MADDELER = new Set([13, 14])

/** Ters maddeyi puanlar: 1→5, 2→4, 3→3, 4→2, 5→1 */
export const puanla = (no: number, deger: number): number =>
  TERS_MADDELER.has(no) ? 6 - deger : deger

/**
 * 8 Alt Boyut Ortalama Puanlarını Hesaplar (1.00 – 5.00)
 */
export function altBoyutOrtalamalari(
  yanitlar: Array<Record<number, number>>,
): Array<{ kod: string; baslik: string; maddeAraligi: string; ortalama: number; n: number }> {
  return ALT_BOYUTLAR.map((b) => {
    let toplam = 0
    let adet = 0
    for (const y of yanitlar) {
      for (const m of b.maddeler) {
        const v = y[m.no]
        if (typeof v === 'number' && v >= 1 && v <= 5) {
          toplam += puanla(m.no, v)
          adet++
        }
      }
    }
    return {
      kod: b.kod,
      baslik: b.baslik,
      maddeAraligi: b.maddeAraligi,
      ortalama: adet ? Number((toplam / adet).toFixed(2)) : 0,
      n: adet,
    }
  })
}
