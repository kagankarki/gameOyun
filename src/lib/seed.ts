import type { Lesson } from './types'
import { uid } from './utils'

/**
 * Demo ders — sistem ilk açıldığında örnek olması için yüklenir.
 * Hoca kendi derslerini panelden ekleyince buna ihtiyaç kalmaz.
 */
export const demoLesson = (): Lesson => {
  const now = Date.now()
  return {
    id: 'demo_anatomi_1',
    title: 'Üst Ekstremite Kemikleri — Giriş',
    subject: 'Anatomi',
    description:
      'Ders sırasında bilinçli olarak 4 hatalı bilgi verilmiştir. Hatayı gördüğün anda kartın üzerindeki kırmızı butona bas!',
    teacherId: 'seed_teacher',
    teacherName: 'Prof. Dr. Tuncay Peker',
    isLive: true,
    createdAt: now,
    updatedAt: now,
    blocks: [
      {
        id: uid('b'),
        text: 'Üst ekstremite; omuz kuşağı, kol (brachium), ön kol (antebrachium) ve el olmak üzere dört bölümde incelenir.',
        isWrong: false,
      },
      {
        id: uid('b'),
        text: 'Omuz kuşağını oluşturan kemikler clavicula ve sternum’dur.',
        isWrong: true,
        correction:
          'Omuz kuşağını clavicula ve scapula oluşturur. Sternum, gövde (thorax) iskeletine aittir.',
        points: 100,
      },
      {
        id: uid('b'),
        text: 'Humerus, vücudun en uzun kemiğidir ve proksimalde caput humeri ile articulatio glenohumeralis’e katılır.',
        isWrong: true,
        correction:
          'Vücudun en uzun kemiği femur’dur. Humerus üst ekstremitenin en uzun kemiğidir. Cümlenin geri kalanı doğrudur.',
        points: 100,
      },
      {
        id: uid('b'),
        text: 'Ön kolda radius lateralde, ulna medialde yer alır. Anatomik pozisyonda avuç içi öne bakar.',
        isWrong: false,
      },
      {
        id: uid('b'),
        text: 'El bileğinde toplam 10 adet carpal kemik bulunur ve bunlar iki sıra halinde dizilmiştir.',
        isWrong: true,
        correction: 'Carpal kemik sayısı 8’dir; her sırada 4 kemik bulunur.',
        points: 120,
      },
      {
        id: uid('b'),
        text: 'Scaphoid, proksimal sıradaki carpal kemiklerdendir ve en sık kırılan carpal kemiktir.',
        isWrong: false,
      },
      {
        id: uid('b'),
        text: 'Başparmak (pollex) üç falanks içerir: proksimal, orta ve distal falanks.',
        isWrong: true,
        correction:
          'Başparmakta orta falanks yoktur; sadece proksimal ve distal olmak üzere 2 falanks bulunur.',
        points: 100,
      },
      {
        id: uid('b'),
        text: 'N. radialis, sulcus nervi radialis içinde humerus gövdesine komşu seyreder; bu nedenle humerus cisim kırıklarında zedelenebilir.',
        isWrong: false,
      },
    ],
  }
}
