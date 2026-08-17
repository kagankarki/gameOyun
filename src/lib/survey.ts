/**
 * ÖĞRENCİ DEĞERLENDİRME ANKETİ
 * "Kasıtlı Hata Temelli Anatomi Eğitimi" araştırması.
 *
 * Maddeler ve alt boyutlar araştırma formundan birebir alınmıştır.
 * 27–30. maddeler TERS puanlanır (1↔5); `ters: true` ile işaretli.
 *
 * Puanlama notu: alt boyutlar madde TOPLAMI değil ORTALAMASI (1–5) ile
 * raporlanır — boyutlar farklı sayıda madde içeriyor. Tek bir "anket
 * puanı" üretilmez; faktör yapısı doğrulanmadan maddeleri tek ölçek
 * olarak toplamak uygun değil.
 */

export interface AnketMaddesi {
  no: number
  metin: string
  /** 27–30: ters puanlanır */
  ters?: boolean
}

export interface AltBoyut {
  kod: string
  baslik: string
  /** Yalnızca deney grubuna uygulanan boyutlar */
  yalnizDeney?: boolean
  maddeler: AnketMaddesi[]
}

export const ALT_BOYUTLAR: AltBoyut[] = [
  {
    kod: 'B',
    baslik: 'Dikkat ve Aktif Katılım',
    maddeler: [
      { no: 1, metin: 'Ders boyunca anlatılan anatomik bilgileri dikkatle takip ettim.' },
      { no: 2, metin: 'Ders sırasında verilen bilgilerin doğruluğunu aktif olarak değerlendirdim.' },
      {
        no: 3,
        metin:
          'Ders yöntemi, pasif olarak dinlemek yerine derse zihinsel olarak katılmamı sağladı.',
      },
      { no: 4, metin: 'Ders boyunca dikkatimi sürdürmekte zorlanmadım.' },
    ],
  },
  {
    kod: 'C',
    baslik: 'Bilişsel Sorgulama ve Eleştirel Düşünme',
    maddeler: [
      {
        no: 5,
        metin:
          'Bir anatomik bilginin doğru olup olmadığını değerlendirmek, konu hakkında daha ayrıntılı düşünmemi sağladı.',
      },
      {
        no: 6,
        metin: 'Ders sırasında anatomik yapılar arasındaki ilişkileri zihnimde yeniden değerlendirdim.',
      },
      { no: 7, metin: 'Duyduğum bilgiyi önceden sahip olduğum anatomi bilgisiyle karşılaştırdım.' },
      {
        no: 8,
        metin:
          'Ders yöntemi, anatomik bilgileri sorgulamadan kabul etmek yerine doğruluğunu değerlendirmemi teşvik etti.',
      },
    ],
  },
  {
    kod: 'D',
    baslik: 'Hata Tespiti ve Düzeltme Yoluyla Öğrenme',
    yalnizDeney: true,
    maddeler: [
      {
        no: 9,
        metin:
          'Ders sırasında hatalı bilgileri tespit etmeye çalışmak doğru anatomik bilgiyi daha iyi öğrenmeme yardımcı oldu.',
      },
      {
        no: 10,
        metin:
          'Bir hatayı fark ettikten sonra doğru bilginin verilmesi, doğru cevabı hatırlamamı kolaylaştırdı.',
      },
      {
        no: 11,
        metin: 'Hatalı bilgi ile doğru bilgiyi karşılaştırmak anatomik bilgiyi daha iyi anlamamı sağladı.',
      },
      {
        no: 12,
        metin:
          'Kendi bilgimle eğitmenin verdiği bilgi arasındaki çelişkiyi fark etmek öğrenmemi destekledi.',
      },
      {
        no: 13,
        metin:
          'Bir hatayı fark edemediğimi görmek, hangi konularda bilgi eksikliğim olduğunu anlamama yardımcı oldu.',
      },
    ],
  },
  {
    kod: 'E',
    baslik: 'Görsel-Mekânsal ve Klinik-Anatomik Öğrenme',
    maddeler: [
      {
        no: 14,
        metin:
          'Üç boyutlu anatomik model üzerinde yapıları takip etmek, yapıların birbirleriyle olan mekânsal ilişkilerini anlamamı kolaylaştırdı.',
      },
      {
        no: 15,
        metin:
          'Görsel olarak gördüğüm yapı ile anlatılan bilgiyi karşılaştırmak anatomik ilişkileri değerlendirmemi kolaylaştırdı.',
      },
      {
        no: 16,
        metin:
          'Klinik/fonksiyonel bilgiler, temel anatomik yapıların fonksiyonlarını daha iyi anlamamı sağladı.',
      },
      {
        no: 17,
        metin:
          'Klinik bulgular ile ilgili anatomik yapılar arasında bağlantı kurmak öğrenmemi kolaylaştırdı.',
      },
    ],
  },
  {
    kod: 'F',
    baslik: 'Algılanan Öğrenme ve Kalıcılık',
    maddeler: [
      {
        no: 18,
        metin:
          'Bu ders sonunda mesencephalon anatomisini ders öncesine göre daha iyi anladığımı düşünüyorum.',
      },
      {
        no: 19,
        metin:
          'Derste üzerinde özellikle düşündüğüm anatomik bilgileri daha uzun süre hatırlayacağımı düşünüyorum.',
      },
      {
        no: 20,
        metin: 'Ders yöntemi anatomik bilgileri yalnızca ezberlemek yerine anlamlandırmama yardımcı oldu.',
      },
      { no: 21, metin: 'Bu derste öğrendiğim bilgileri daha sonra hatırlayabileceğimi düşünüyorum.' },
    ],
  },
  {
    kod: 'G',
    baslik: 'Mobil Uygulama ve Kullanılabilirlik',
    maddeler: [
      { no: 22, metin: 'Mobil uygulamadaki hata bildirme düğmesini kullanmak kolaydı.' },
      {
        no: 23,
        metin: 'Bir bilgiden şüphelendiğim anda uygulama üzerinden hızlı bir şekilde yanıt verebildim.',
      },
      { no: 24, metin: 'Mobil uygulamayı kullanmak dersin akışını olumsuz etkilemedi.' },
      { no: 25, metin: 'Uygulamanın kullanılması dikkatimi anatomik içerikten uzaklaştırmadı.' },
      {
        no: 26,
        metin: 'Hata tespitinden sonra sunulan sorular, neden hata olduğunu değerlendirmeme yardımcı oldu.',
      },
    ],
  },
  {
    kod: 'H',
    baslik: 'Bilişsel Yük ve Olumsuz Etkiler',
    maddeler: [
      { no: 27, metin: 'Ders sırasında olası hataları takip etmek zihinsel olarak yorucuydu.', ters: true },
      {
        no: 28,
        metin:
          'Anlatılan bilgilerin doğru olup olmadığını sürekli değerlendirmek konuya odaklanmamı zorlaştırdı.',
        ters: true,
      },
      {
        no: 29,
        metin: 'Ders sırasında hata bulunabileceğini bilmek bende gereksiz kaygı oluşturdu.',
        ters: true,
      },
      {
        no: 30,
        metin:
          'Hatalı bilgi duymak, ders sonunda hangi bilginin doğru olduğu konusunda kafamı karıştırdı.',
        ters: true,
      },
    ],
  },
  {
    kod: 'I',
    baslik: 'Yöntemin Kabulü ve Gelecekte Kullanımı',
    maddeler: [
      { no: 31, metin: 'Bu öğretim yönteminin anatominin diğer konularında da kullanılmasını isterim.' },
      {
        no: 32,
        metin:
          'Benzer hata-tespit etkinliklerinin diğer temel tıp bilimleri derslerinde de kullanılmasının yararlı olacağını düşünüyorum.',
      },
      {
        no: 33,
        metin:
          'Bu yöntem geleneksel olarak yalnızca doğru bilginin anlatıldığı bir derse göre beni daha aktif tuttu.',
      },
      { no: 34, metin: 'Bu yöntemin anatomi öğrenimime katkı sağladığını düşünüyorum.' },
      { no: 35, metin: 'Gelecekte benzer bir ders etkinliğine tekrar katılmak isterim.' },
    ],
  },
]

/** J bölümü — kendi etiket takımları var */
export interface GenelSoru {
  no: number
  metin: string
  etiketler: [string, string, string, string, string]
  yalnizDeney?: boolean
}

export const GENEL_SORULAR: GenelSoru[] = [
  {
    no: 36,
    metin: 'Bu ders yönteminin öğrenmenize genel katkısını nasıl değerlendirirsiniz?',
    etiketler: ['Hiç katkı sağlamadı', 'Az', 'Orta', 'Oldukça', 'Çok fazla'],
  },
  {
    no: 37,
    metin: 'Bu ders sırasında kendinizi ne kadar aktif bir öğrenen olarak hissettiniz?',
    etiketler: ['Hiç', 'Az', 'Orta', 'Oldukça', 'Çok fazla'],
  },
  {
    no: 38,
    metin:
      'Ders sırasında olası anatomik hataları fark etme konusunda kendinizi genel olarak ne kadar başarılı buldunuz?',
    etiketler: ['Hiç başarılı değil', 'Biraz', 'Orta', 'Oldukça', 'Çok başarılı'],
    yalnizDeney: true,
  },
]

export const ACIK_UCLU = [
  { no: 39, metin: 'Bu ders yönteminin öğrenmenize en fazla katkı sağlayan özelliği neydi?' },
  { no: 40, metin: 'Ders yönteminde değiştirilmesini veya geliştirilmesini istediğiniz bir özellik var mı?' },
  {
    no: 41,
    metin:
      'Hatalı bir anatomik bilgiyi fark etmek ve ardından doğrusunu görmek öğrenme şeklinizi nasıl etkiledi?',
    yalnizDeney: true,
  },
]

export const LIKERT_ETIKETLERI = [
  'Kesinlikle katılmıyorum',
  'Katılmıyorum',
  'Kararsızım',
  'Katılıyorum',
  'Kesinlikle katılıyorum',
] as const

/** Likert maddelerinin toplam sayısı (1–35) */
export const LIKERT_MADDE_SAYISI = ALT_BOYUTLAR.reduce((n, b) => n + b.maddeler.length, 0)
/** Anketin tamamı: 35 Likert + 3 genel + 3 açık uçlu */
export const TOPLAM_MADDE = LIKERT_MADDE_SAYISI + GENEL_SORULAR.length + ACIK_UCLU.length

/** Ters maddelerin numaraları */
export const TERS_MADDELER = new Set(
  ALT_BOYUTLAR.flatMap((b) => b.maddeler.filter((m) => m.ters).map((m) => m.no)),
)

/** Ters maddeyi çevirir: 1→5, 2→4, 3→3, 4→2, 5→1 */
export const puanla = (no: number, deger: number) =>
  TERS_MADDELER.has(no) ? 6 - deger : deger

/**
 * Alt boyut ortalamaları — araştırmacı raporu için.
 * Cevaplanmamış maddeler ortalamaya katılmaz.
 */
export function altBoyutOrtalamalari(
  yanitlar: Array<Record<number, number>>,
): Array<{ kod: string; baslik: string; ortalama: number; n: number }> {
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
      ortalama: adet ? toplam / adet : 0,
      n: adet,
    }
  })
}
