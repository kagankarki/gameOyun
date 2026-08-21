export type Role = 'teacher' | 'student'

export interface AppUser {
  uid: string
  name: string
  email: string
  password?: string
  role: Role
  createdAt: number
}

/** Ders notunun tek bir parçası (paragraf / madde / cümle) */
export interface Block {
  id: string
  text: string
  /** Hoca bu bloğa kasıtlı hata koyduysa true */
  isWrong: boolean
  /** Hatanın doğrusu / açıklaması — öğrenci yakalayınca gösterilir */
  correction?: string
  /** Bu bloğun puanı (varsayılan 100) */
  points?: number
}

export interface Lesson {
  id: string
  title: string
  description: string
  subject: string
  teacherId: string
  teacherName: string
  /** Kesintisiz okuma metni */
  script?: string
  /** Metindeki işaretli yanlışlar */
  wrongBlocks?: WrongBlock[]
  /** Eski blok modeli ile uyumluluk için */
  blocks: Block[]
  /** true ise öğrenciler girip oynayabilir */
  isLive: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Genel sıralama satırı — amfi katılımlarından toplanır.
 * (Tek kişilik `Attempt` modu kaldırıldı: öğrenci ders metnini önceden
 * okuyabildiğinde hataların yerini de görüyordu.)
 */
export interface LeaderRow {
  /** Giriş yapmışsa uid, yapmamışsa `ad:<isim>` */
  studentId: string
  studentName: string
  totalScore: number
  /** Katıldığı amfi oturumu sayısı */
  sessions: number
  bestScore: number
  accuracy: number
}

/* ══════════════════════════════════════════════════════════
   AMFİ / CANLI DERS MODU
   Hoca oturumu açar, öğrenciler koddan katılır, metni TTS okur,
   öğrenciler hatayı duyduğu an "HATA VAR"a basar.
   ══════════════════════════════════════════════════════════ */

export type SessionPhase =
  /** Öğrenciler katılıyor, ders henüz başlamadı */
  | 'lobby'
  /** TTS bölümü okuyor — not yazma penceresi açık */
  | 'speaking'
  /** Konuşma bitti, geç notlar için tolerans süresi */
  | 'grace'
  /** Bölüm kapandı, sonuç gösteriliyor */
  | 'reveal'
  /** Ders bitti */
  | 'ended'

/**
 * `capture` — TTS bölümü sesli okur, pencere okuma boyunca açıktır.
 * `quiz`    — ses yok; metin perdede durur, pencereyi hoca açıp kapatır.
 */
export type LiveSessionMode = 'capture' | 'quiz'

/**
 * 1 = eski zil modu (AmfiHost/AmfiPlay), 2 = not yazma modu (AmfiHostV2/AmfiPlayV2).
 * Öğrencinin telefonunda hangi ekranın açılacağını bu belirler.
 */
export type LiveSessionVersion = 1 | 2

/**
 * OTURUM — HERKESE AÇIK KISIM
 *
 * Öğrencinin telefonu bu dokümanı okur. Ders metni, hataların yeri ve
 * çoktan seçmeli soruların doğru şıkları BURADA DURMAZ — hepsi
 * `SessionSecret` içinde, yalnızca hocanın okuyabildiği ayrı bir
 * dokümanda. Aksi hâlde tarayıcı konsolunu açan öğrenci bütün
 * cevapları ders başlamadan görürdü.
 */
export interface LiveSession {
  id: string
  /** 6 karakterli katılım kodu — karışan harfler (I, O, 0, 1) kullanılmaz */
  code: string
  lessonId: string
  lessonTitle: string
  teacherId: string
  teacherName: string
  phase: SessionPhase
  mode: LiveSessionMode
  version: LiveSessionVersion
  /**
   * Sürekli okuma (yeni) mi, parça parça (eski) mı?
   * Sürekli okumada metnin tamamı tek seferde okunur; öğrenci istediği
   * an "HATA VAR"a basar, hangi hataya denk geldiği hoca cihazındaki
   * karakter/zaman çizelgesinden hesaplanır.
   */
  readingMode: ReadingMode
  /** Kaç hata var — öğrenciye ilerleme göstermek için (yerleri değil) */
  wrongCount: number
  /** Sürekli okumada metnin toplam karakter sayısı — ilerleme çubuğu */
  scriptLength: number
  /** Eski parça modeli — sürekli okumada boştur */
  segments: string[]
  currentBlockIndex: number
  /**
   * TTS'in gerçekten konuşmaya başladığı an (onstart).
   * speak() çağrısı değil — arada ~1 sn başlama gecikmesi var.
   */
  blockStartedAt: number
  /** Okuma kaç ms sürdü — bitmeden 0'dır */
  blockDurationMs: number
  /** Karakter sayısından hesaplanan tahmini okuma süresi */
  blockEstimateMs: number
  /** Tolerans süresi bu ana kadar (eski parça modeli) */
  graceEndsAt: number
  createdAt: number
  updatedAt: number
}

export type ReadingMode = 'continuous' | 'segmented'

/**
 * OTURUM — HOCAYA ÖZEL KISIM
 * Firestore kuralları bu koleksiyonu yalnızca oturumu açan hocaya açar.
 */
export interface SessionSecret {
  sessionId: string
  teacherId: string
  /** Sesli okunacak metnin tamamı */
  script: string
  wrongBlocks: WrongBlock[]
}

export interface WrongBlock {
  /** Eski parça modelinde parça indeksi; sürekli okumada sıra numarası */
  blockIndex: number
  text: string
  /** Hoca'nın yazısı: "Bu yanlış çünkü..." */
  explanation: string
  /** Doğru versiyonu / düzeltme */
  correction: string
  /** Varsayılan 100 — yakalayan öğrenci bunu + hız bonusu alır */
  points?: number
  /** Sürekli okumada ham metindeki karakter aralığı */
  start: number
  end: number
  /** Zorluk derecesi */
  difficulty?: 'kolay' | 'orta' | 'zor'
  /** Yakalayan öğrenciye sorulan ek soru — hoca hazırlık ekranında yazar */
  followUp?: FollowUpQuestion
}

/**
 * Hatayı yakalayan öğrenciye sorulan çoktan seçmeli soru.
 * Doğru bilirse ek puan; bilemezse yakalama puanını korur, ceza yok.
 */
export interface FollowUpQuestion {
  question: string
  /** 5 şık (A, B, C, D, E) */
  options: string[]
  correctIndex: number
  /** Doğru bilirse eklenecek puan */
  bonus: number
  difficulty?: 'kolay' | 'orta' | 'zor'
}

export interface Participant {
  id: string
  sessionId: string
  name: string
  /**
   * Giriş yapmış öğrencinin uid'si — yoksa anonim katılım.
   * Sıralamada ve "son derslerin" listesinde kayıtları birleştirmek için;
   * amfiye hesapsız da girilebildiği için isteğe bağlı.
   */
  studentId?: string
  score: number
  hits: number
  misses: number
  falseAlarms: number
  joinedAt: number
}

/**
 * YAKALAMA — öğrenci "HATA VAR"a bastığında oluşan kayıt.
 *
 * Öğrenci yalnızca `flaggedAt` ile bu dokümanı açar; gerisini HOCA
 * cihazı doldurur. Hangi hataya denk geldiğini, kaç puan olduğunu ve
 * sorulacak soruyu hoca yazar — öğrencinin telefonu bunları bilmiyor,
 * bilseydi puanını kendi verirdi.
 */
export interface Catch {
  id: string
  sessionId: string
  participantId: string
  /** Butona bastığı an — tepki süresi ve eşleştirme bunun üzerinden */
  flaggedAt: number
  /**
   * `pending` hoca henüz çözmedi · `hit` bir hataya denk geldi ·
   * `miss` o anda okunan yerde hata yoktu
   */
  status: 'pending' | 'hit' | 'miss'
  /** Yakaladığı hatanın sırası (hit ise) */
  wrongIndex?: number
  /** Yakalama puanı (hız bonusu dâhil) — miss ise negatif ceza */
  points: number
  /**
   * Hocanın hazırladığı ek soru, DOĞRU ŞIK OLMADAN.
   * Hoca cihazı yakalamayı çözerken buraya kopyalar; öğrenci yalnızca
   * soruyu ve şıkları görür.
   */
  question?: string
  options?: string[]
  /** Öğrencinin işaretlediği şık — öğrencinin yazabildiği TEK alan */
  answerIndex?: number
  /** Hoca cihazının verdiği karar */
  answerCorrect?: boolean
  /** Doğruysa eklenen puan */
  bonus?: number
  /** Cevaptan sonra gösterilen doğru şık ve açıklama */
  revealIndex?: number
  revealText?: string
  createdAt: number
  resolvedAt?: number
}

/**
 * Ders bitince öğrencinin verdiği 5 üzerinden puan.
 * Hoca oturum raporunda ortalamayı ve yorumları görür.
 */
export interface SessionRating {
  id: string
  sessionId: string
  participantId: string
  participantName: string
  /** 1–5 */
  stars: number
  /** Serbest yorum — boş bırakılabilir (Firestore undefined kabul etmez, '' yazılır) */
  comment: string
  createdAt: number
}

/**
 * ARAŞTIRMA ANKETİ — "Kasıtlı Hata Temelli Anatomi Eğitimi"
 * Yıldız değerlendirmesinden ayrı, isteğe bağlı bilimsel form.
 */
export interface SurveyResponse {
  id: string
  sessionId: string
  participantId: string
  /** Araştırmacının eşleştirmesi için — öğrenci girer, zorunlu değil */
  katilimciKodu: string
  grupKodu: string
  /** Daha önce bu konuda formal ders aldı mı */
  oncekiDers: 'evet' | 'hayir' | ''
  /** 1–41 arası madde numarası → 1–5 arası yanıt (ters maddeler ham hâliyle) */
  likert: Record<number, number>
  /** 39, 40, 41 numaralı açık uçlu sorular */
  acikUclu: Record<number, string>
  createdAt: number
}

/**
 * Eski Amfi modu (TTS zili) — geçiş dönemi için tutulur.
 * Yeni kod Catch kullanır.
 */
export interface Buzz {
  id: string
  sessionId: string
  participantId: string
  blockIndex: number
  reactionMs: number
  createdAt: number
}
