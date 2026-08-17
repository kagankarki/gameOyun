export type Role = 'teacher' | 'student'

export interface AppUser {
  uid: string
  name: string
  email: string
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
   * Amfi 2.0: ders notunun sesli okunacak parçaları.
   * `currentBlockIndex` ve `WrongBlock.blockIndex` bu diziye işaret eder.
   * Amfi 1.0'da boştur — orada bölümler `Lesson.blocks`ten gelir.
   */
  segments: string[]
  currentBlockIndex: number
  /**
   * TTS'in gerçekten konuşmaya başladığı an (onstart).
   * Not yazma penceresinin sıfır noktası — speak() çağrısı değil, çünkü
   * arada ~1 sn başlama gecikmesi var.
   */
  blockStartedAt: number
  /** Bölümün okunması kaç ms sürdü — okuma bitmeden 0'dır */
  blockDurationMs: number
  /**
   * Okuma daha bitmeden gelen notlara hız bonusu verebilmek için
   * karakter sayısından hesaplanan tahmini süre.
   */
  blockEstimateMs: number
  /** Tolerans süresi bu ana kadar — öğrencinin telefonunda geri sayım */
  graceEndsAt: number
  /** Hocanın belirttiği yanlışlar — öğrenci bu bölümde bir note yazsa kontrol edilir */
  wrongBlocks: WrongBlock[]
  createdAt: number
  updatedAt: number
}

export interface WrongBlock {
  blockIndex: number
  text: string
  /** Hoca'nın yazısı: "Bu yanlış çünkü..." */
  explanation: string
  /** Doğru versiyonu / düzeltme */
  correction: string
  /** Varsayılan 100 — yakalayan öğrenci bunu + hız bonusu alır */
  points?: number
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
 * Amfi 2.0: Öğrenci yanlış bölümde not yazıyor.
 * Gemini doğruluyor, öğrenci puan alıyor.
 */
export interface StudentNote {
  id: string
  sessionId: string
  participantId: string
  blockIndex: number
  /** Öğrenci yazdığı kısa not */
  text: string
  /** Gemini'nin doğrulama sonucu */
  status: 'pending' | 'valid' | 'invalid'
  /** Gemini'nin açıklaması — öğrenciye gösterilir */
  geminiFeedback?: string
  /**
   * "HATA VAR"a bastığı an — asıl tepki süresi budur.
   * Hız bonusu buradan hesaplanır; `createdAt` yazıyı bitirip gönderdiği
   * an olduğu için yavaş yazan öğrenciyi haksız yere cezalandırırdı.
   */
  flaggedAt?: number
  createdAt: number
  validatedAt?: number
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
 * Eski Amfi modu (TTS zili) — geçiş dönemi için tutulur.
 * Yeni kod StudentNote kullanır.
 */
export interface Buzz {
  id: string
  sessionId: string
  participantId: string
  blockIndex: number
  reactionMs: number
  createdAt: number
}
