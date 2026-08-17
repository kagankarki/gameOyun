/**
 * AMFİ / CANLI DERS OTURUMU
 *
 * api.ts ile aynı desen: Firebase yapılandırılmışsa Firestore, değilse
 * localStorage (demo). Demo taşıyıcı store.ts'in `storage` olayı sayesinde
 * aynı tarayıcının sekmeleri arasında senkron çalışır.
 *
 * SINIR: Demo taşıyıcı yalnızca tek bilgisayarın sekmeleri arasındadır.
 * Gerçek amfide 150 telefon için Firebase şarttır.
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  limit,
} from 'firebase/firestore'

import { signInAnonymously } from 'firebase/auth'

import { firebaseAuth, firestore, isFirebaseConfigured } from './firebase'
import * as store from './store'
import type {
  Block,
  Buzz,
  Catch,
  LeaderRow,
  Lesson,
  LiveSession,
  LiveSessionMode,
  LiveSessionVersion,
  Participant,
  ReadingMode,
  SessionRating,
  SessionSecret,
  SurveyResponse,
  WrongBlock,
} from './types'
import { uid } from './utils'

const live = () => Boolean(isFirebaseConfigured && firestore)

/** Boşa basma cezası */
export const FALSE_ALARM_PENALTY = 40
/** Hız bonusunun üst sınırı */
export const MAX_SPEED_BONUS = 30
/** Amfi 1.0: zile basmak bir saniyelik iş — kısa tolerans yeter */
export const GRACE_MS = 1500

/**
 * Bir hata okunduktan sonra öğrencinin basabileceği süre.
 *
 * Sürekli okumada metin durmuyor; öğrenci hatayı duyup "dur, bu yanlıştı"
 * diye düşünene kadar birkaç saniye geçiyor. Bu pencere kapanınca basış
 * artık o hataya sayılmaz.
 */
export const CATCH_WINDOW_MS = 8_000

/**
 * Türkçe TTS 1x hızda kabaca 14 karakter/sn okuyor.
 * Okuma bitmeden hız bonusu hesaplayabilmek için gerekli; gerçek süre
 * onEnd'de ölçülüp `blockDurationMs`e yazılıyor.
 */
export const estimateReadMs = (text: string) =>
  Math.max(3_000, Math.round((text.length / 14) * 1000))

/* ══════════════════════════════════════════════════════════
   ESKİ KAYITLARI TAMAMLAMA
   ══════════════════════════════════════════════════════════ */

/**
 * `version`, `segments`, `wrongBlocks` gibi alanlar Amfi 2.0 ile eklendi.
 * Daha önce açılmış oturumlarda bu alanlar hiç yok; okuyan ekranlar
 * `session.wrongBlocks.find(...)` deyince patlıyordu.
 *
 * Depodan çıkan HER oturum buradan geçirilir — tek tek her kullanım
 * yerinde `?? []` yazmak yerine sınırı tek noktada tutuyoruz.
 */
function hydrate(s: LiveSession): LiveSession {
  return {
    ...s,
    version: s.version ?? 1,
    readingMode: s.readingMode ?? 'segmented',
    segments: s.segments ?? [],
    wrongCount: s.wrongCount ?? 0,
    scriptLength: s.scriptLength ?? 0,
    blockEstimateMs: s.blockEstimateMs ?? 0,
    graceEndsAt: s.graceEndsAt ?? 0,
  }
}

/* ══════════════════════════════════════════════════════════
   KATILIM KODU
   ══════════════════════════════════════════════════════════ */

/** Karışan karakterler (I, O, 0, 1) bilinçli olarak yok */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const makeCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

/* ══════════════════════════════════════════════════════════
   OTURUM YAŞAM DÖNGÜSÜ
   ══════════════════════════════════════════════════════════ */

export interface SessionOptions {
  mode?: LiveSessionMode
  version?: LiveSessionVersion
  readingMode?: ReadingMode
  /** Sürekli okumada metnin tamamı */
  script?: string
  /** Eski parça modeli */
  segments?: string[]
  wrongBlocks?: WrongBlock[]
}

export async function createSession(
  lesson: Lesson,
  teacherId: string,
  teacherName: string,
  opts: SessionOptions = {},
): Promise<LiveSession> {
  const now = Date.now()
  const script = opts.script ?? ''
  const wrongBlocks = opts.wrongBlocks ?? []

  const session: LiveSession = {
    id: uid('ses'),
    code: makeCode(),
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    teacherId,
    teacherName,
    phase: 'lobby',
    mode: opts.mode ?? 'capture',
    version: opts.version ?? 1,
    readingMode: opts.readingMode ?? 'segmented',
    segments: opts.segments ?? [],
    // Öğrenciye yalnızca KAÇ hata olduğunu söylüyoruz, nerede olduğunu değil
    wrongCount: wrongBlocks.length,
    scriptLength: script.length,
    currentBlockIndex: 0,
    blockStartedAt: 0,
    blockDurationMs: 0,
    blockEstimateMs: script ? estimateReadMs(script) : 0,
    graceEndsAt: 0,
    createdAt: now,
    updatedAt: now,
  }
  await saveSession(session)
  // Metin ve hatalar ayrı, hocaya özel dokümanda
  await saveSessionSecret({ sessionId: session.id, teacherId, script, wrongBlocks })
  return session
}

/* ── Hocaya özel bölüm ─────────────────────────────────── */

export async function saveSessionSecret(secret: SessionSecret): Promise<void> {
  if (live()) {
    await setDoc(doc(firestore!, 'sessionSecrets', secret.sessionId), secret)
    return
  }
  store.putSessionSecret(secret)
}

/**
 * Yalnızca hoca cihazı çağırır. Öğrenci çağırırsa Firestore kuralları
 * reddeder — zaten öğrencinin ekranında bu veriye ihtiyaç yok.
 */
export function watchSessionSecret(
  sessionId: string,
  cb: (s: SessionSecret | null) => void,
): () => void {
  if (live()) {
    return onSnapshot(
      doc(firestore!, 'sessionSecrets', sessionId),
      (snap) => cb(snap.exists() ? (snap.data() as SessionSecret) : null),
      (err) => {
        console.error('[sessionSecret] dinlenemedi:', err)
        cb(null)
      },
    )
  }
  const emit = () => cb(store.getSessionSecrets().find((s) => s.sessionId === sessionId) ?? null)
  emit()
  return store.subscribe(emit)
}

/**
 * Bu ders için hâlâ açık bir oturum var mı?
 *
 * Hoca sayfayı yenilerse yeni kod üretmemeliyiz — aksi hâlde amfideki
 * 150 öğrencinin bağlantısı kopar ve hepsinin yeniden katılması gerekir.
 */
export async function findActiveSession(
  lessonId: string,
  teacherId: string,
  version: LiveSessionVersion = 1,
): Promise<LiveSession | null> {
  // `version` alanı sonradan eklendi; eski kayıtlar 1.0 sayılır
  const isOpen = (s: LiveSession) => s.phase !== 'ended' && (s.version ?? 1) === version

  if (live()) {
    const q = query(
      collection(firestore!, 'sessions'),
      where('lessonId', '==', lessonId),
      where('teacherId', '==', teacherId),
    )
    const snap = await getDocs(q)
    const open = snap.docs
      .map((d) => hydrate(d.data() as LiveSession))
      .filter(isOpen)
      .sort((a, b) => b.createdAt - a.createdAt)
    return open[0] ?? null
  }

  const open = store
    .getLiveSessions()
    .map(hydrate)
    .filter((s) => s.lessonId === lessonId && s.teacherId === teacherId && isOpen(s))
    .sort((a, b) => b.createdAt - a.createdAt)
  return open[0] ?? null
}

/** Açık oturum varsa onu sürdürür, yoksa yenisini açar. */
export async function resumeOrCreateSession(
  lesson: Lesson,
  teacherId: string,
  teacherName: string,
): Promise<LiveSession> {
  const existing = await findActiveSession(lesson.id, teacherId, 1)
  if (existing) return existing
  return createSession(lesson, teacherId, teacherName, { version: 1 })
}

export async function saveSession(s: LiveSession): Promise<void> {
  const payload = { ...s, updatedAt: Date.now() }
  if (live()) {
    await setDoc(doc(firestore!, 'sessions', payload.id), payload)
    return
  }
  store.putLiveSession(payload)
}

/** Koddan oturum bulur (öğrenci katılırken) */
export async function findSessionByCode(code: string): Promise<LiveSession | null> {
  const key = code.trim().toLocaleUpperCase('tr-TR')
  if (!key) return null

  if (live()) {
    await ensureAuthForJoin() // Firestore sorgusundan önce yetkiyi al
    const q = query(collection(firestore!, 'sessions'), where('code', '==', key), limit(1))
    const snap = await getDocs(q)
    return snap.empty ? null : hydrate(snap.docs[0].data() as LiveSession)
  }
  const found = store.getLiveSessions().find((s) => s.code === key)
  return found ? hydrate(found) : null
}

export function watchSession(id: string, cb: (s: LiveSession | null) => void): () => void {
  if (live()) {
    return onSnapshot(
      doc(firestore!, 'sessions', id),
      (snap) => cb(snap.exists() ? hydrate(snap.data() as LiveSession) : null),
      (err) => {
        console.error('[session] dinlenemedi:', err)
        cb(null)
      },
    )
  }
  const emit = () => {
    const found = store.getLiveSessions().find((s) => s.id === id)
    cb(found ? hydrate(found) : null)
  }
  emit()
  return store.subscribe(emit)
}

/* ══════════════════════════════════════════════════════════
   KATILIMCILAR
   ══════════════════════════════════════════════════════════ */

/**
 * Amfiye katılan öğrencinin hesabı yok. Firebase modunda Firestore kuralları
 * kimlik ister, bu yüzden anonim oturum açarız.
 *
 * ÖNEMLİ: Zaten giriş yapmış bir kullanıcı varsa dokunmuyoruz — aksi hâlde
 * signInAnonymously onun hesabını düşürürdü.
 */
async function ensureAuthForJoin(): Promise<void> {
  if (!live() || !firebaseAuth) return
  if (firebaseAuth.currentUser) return
  await signInAnonymously(firebaseAuth)
}

export async function joinSession(
  sessionId: string,
  name: string,
  /** Giriş yapmış öğrenci varsa uid'si — sıralamada kayıtları birleştirir */
  studentId?: string,
): Promise<Participant> {
  await ensureAuthForJoin()

  const p: Participant = {
    id: uid('p'),
    sessionId,
    name: name.trim(),
    // Firestore undefined kabul etmiyor — alanı yalnızca değer varsa koy
    ...(studentId ? { studentId } : {}),
    score: 0,
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    joinedAt: Date.now(),
  }
  await saveParticipant(p)
  store.setMyJoin({ sessionId, participantId: p.id })
  return p
}

export async function saveParticipant(p: Participant): Promise<void> {
  if (live()) {
    await setDoc(doc(firestore!, 'participants', p.id), p)
    return
  }
  store.putParticipant(p)
}

export function watchParticipants(
  sessionId: string,
  cb: (list: Participant[]) => void,
): () => void {
  const sortByScore = (a: Participant, b: Participant) =>
    b.score - a.score || a.joinedAt - b.joinedAt

  if (live()) {
    const q = query(collection(firestore!, 'participants'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as Participant).sort(sortByScore)),
      (err) => {
        console.error('[participants] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () =>
    cb(store.getParticipants().filter((p) => p.sessionId === sessionId).sort(sortByScore))
  emit()
  return store.subscribe(emit)
}

/* ══════════════════════════════════════════════════════════
   GEÇMİŞ — TÜM OTURUMLAR
   Sıralama ve "son derslerin" listesi buradan besleniyor.
   Tek kişilik mod kaldırıldığı için puanların TEK kaynağı amfi.
   ══════════════════════════════════════════════════════════ */

export function watchAllParticipants(cb: (list: Participant[]) => void): () => void {
  if (live()) {
    return onSnapshot(
      collection(firestore!, 'participants'),
      (snap) => cb(snap.docs.map((d) => d.data() as Participant)),
      (err) => {
        console.error('[participants] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getParticipants())
  emit()
  return store.subscribe(emit)
}

export function watchAllSessions(cb: (list: LiveSession[]) => void): () => void {
  const sortDesc = (a: LiveSession, b: LiveSession) => b.createdAt - a.createdAt

  if (live()) {
    return onSnapshot(
      collection(firestore!, 'sessions'),
      (snap) => cb(snap.docs.map((d) => hydrate(d.data() as LiveSession)).sort(sortDesc)),
      (err) => {
        console.error('[sessions] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getLiveSessions().map(hydrate).sort(sortDesc))
  emit()
  return store.subscribe(emit)
}

/**
 * Aynı kişinin kayıtlarını birleştirmek için anahtar.
 *
 * Giriş yapmışsa uid; yapmamışsa yazdığı ad. Amfiye hesapsız girilebildiği
 * için ad dışında tutunacak bir şey yok — aynı adı yazan iki farklı kişi
 * tek satırda toplanır, bilinen ve kabul edilen sınır.
 */
const leaderKey = (p: Participant) =>
  p.studentId ?? `ad:${p.name.trim().toLocaleLowerCase('tr-TR')}`

/** Amfi katılımlarından genel sıralama üretir. */
export function buildLeaderboard(participants: Participant[]): LeaderRow[] {
  const map = new Map<string, LeaderRow & { _hits: number; _chances: number }>()

  for (const p of participants) {
    const key = leaderKey(p)
    const row = map.get(key) ?? {
      studentId: key,
      studentName: p.name,
      totalScore: 0,
      sessions: 0,
      bestScore: 0,
      accuracy: 0,
      _hits: 0,
      _chances: 0,
    }
    row.studentName = p.name
    row.totalScore += p.score
    row.sessions += 1
    row.bestScore = Math.max(row.bestScore, p.score)
    row._hits += p.hits
    row._chances += p.hits + p.misses
    map.set(key, row)
  }

  return [...map.values()]
    .map(({ _hits, _chances, ...r }) => ({
      ...r,
      accuracy: _chances ? Math.round((_hits / _chances) * 100) : 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy)
}

/* ══════════════════════════════════════════════════════════
   YAKALAMA (SÜREKLİ OKUMA)

   Öğrenci "HATA VAR"a basar → yalnızca bir zaman damgası gönderir.
   Hangi hataya denk geldiğini, puanını ve sorulacak soruyu HOCA cihazı
   hesaplar. Öğrencinin telefonu metni de hataları da bilmiyor.
   ══════════════════════════════════════════════════════════ */

/** Öğrenci tarafı: bastığını bildirir, gerisini bekler. */
export async function sendCatch(
  session: LiveSession,
  participantId: string,
): Promise<Catch> {
  const now = Date.now()
  const c: Catch = {
    id: uid('catch'),
    sessionId: session.id,
    participantId,
    flaggedAt: now,
    status: 'pending',
    points: 0,
    createdAt: now,
  }
  if (live()) {
    await setDoc(doc(firestore!, 'catches', c.id), c)
  } else {
    store.putCatch(c)
  }
  return c
}

export function watchCatches(sessionId: string, cb: (list: Catch[]) => void): () => void {
  const sortAsc = (a: Catch, b: Catch) => a.flaggedAt - b.flaggedAt

  if (live()) {
    const q = query(collection(firestore!, 'catches'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as Catch).sort(sortAsc)),
      (err) => {
        console.error('[catches] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getCatches().filter((c) => c.sessionId === sessionId).sort(sortAsc))
  emit()
  return store.subscribe(emit)
}

export async function saveCatch(c: Catch): Promise<void> {
  if (live()) {
    await setDoc(doc(firestore!, 'catches', c.id), c)
    return
  }
  store.putCatch(c)
}

/* ── Zaman ↔ karakter çizelgesi ───────────────────────────
   TTS okurken her kelimede `onboundary` tetikleniyor ve metindeki
   karakter konumunu veriyor. Hoca cihazı bu (an, konum) çiftlerini
   biriktirir; böylece "öğrenci saat 12:04:07'de bastığında metnin
   neresi okunuyordu?" sorusu geriye dönük cevaplanabilir.

   Bunu oturuma yazmıyoruz: saniyede birkaç kelime × 150 öğrenci =
   Firestore'u boşuna yakardı. Zaten puanlamayı da hoca yapıyor. */

export interface SpeechMark {
  /** Duvar saati */
  t: number
  /** Metindeki karakter konumu */
  i: number
}

/** Verilen anda metnin hangi karakterinde olduğumuz */
export function charIndexAt(marks: SpeechMark[], t: number): number {
  if (!marks.length) return 0
  let lo = 0
  let hi = marks.length - 1
  if (t <= marks[0].t) return marks[0].i
  if (t >= marks[hi].t) return marks[hi].i
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (marks[mid].t <= t) lo = mid
    else hi = mid
  }
  return marks[lo].i
}

/** Metnin verilen karakterine ilk ne zaman ulaşıldığı (yoksa null) */
function timeAtChar(marks: SpeechMark[], charIndex: number): number | null {
  const m = marks.find((x) => x.i >= charIndex)
  return m ? m.t : null
}

/**
 * Basış hangi hataya denk geliyor?
 *
 * Her hata için "duyulmaya başlandığı an" ile "bitişinden CATCH_WINDOW_MS
 * sonrası" arasında bir pencere açıyoruz. Basış bu pencerelerden birine
 * düşerse yakalama sayılır; birden fazlasına düşerse en yenisi kazanır
 * (öğrenci en son duyduğu şeye tepki veriyordur).
 */
export function matchWrong(
  marks: SpeechMark[],
  wrongBlocks: WrongBlock[],
  flaggedAt: number,
): number | null {
  let best: number | null = null
  let bestStart = -1

  wrongBlocks.forEach((w, index) => {
    const basladi = timeAtChar(marks, w.start)
    if (basladi === null) return // bu hataya daha gelinmedi
    const bitti = timeAtChar(marks, w.end) ?? basladi
    if (flaggedAt >= basladi && flaggedAt <= bitti + CATCH_WINDOW_MS) {
      if (basladi > bestStart) {
        bestStart = basladi
        best = index
      }
    }
  })

  return best
}

export interface CatchResolution {
  wrongIndex: number | null
  points: number
  /** Hız bonusu dâhil mi — arayüzde ayrı göstermek için */
  speedBonus: number
}

/**
 * Bir basışı çözer: hangi hata, kaç puan, hangi soru sorulacak.
 * Yalnızca hoca cihazı çağırır.
 *
 * `alreadyCaught`: bu öğrencinin daha önce yakaladığı hata sıraları —
 * aynı hataya iki kez basıp iki kez puan almasın.
 */
export async function resolveCatch(
  c: Catch,
  marks: SpeechMark[],
  wrongBlocks: WrongBlock[],
  participants: Participant[],
  alreadyCaught: Set<number>,
): Promise<Catch> {
  const wrongIndex = matchWrong(marks, wrongBlocks, c.flaggedAt)
  const p = participants.find((x) => x.id === c.participantId)

  /* ── Boşa basma ── */
  if (wrongIndex === null || alreadyCaught.has(wrongIndex)) {
    const resolved: Catch = {
      ...c,
      status: 'miss',
      points: -FALSE_ALARM_PENALTY,
      resolvedAt: Date.now(),
    }
    await saveCatch(resolved)
    if (p) {
      await saveParticipant({
        ...p,
        score: Math.max(0, p.score - FALSE_ALARM_PENALTY),
        falseAlarms: p.falseAlarms + 1,
      })
    }
    return resolved
  }

  /* ── Yakaladı ── */
  const wrong = wrongBlocks[wrongIndex]
  const basladi = timeAtChar(marks, wrong.start) ?? c.flaggedAt
  const bitti = timeAtChar(marks, wrong.end) ?? basladi
  // Hatanın okunması bittikten sonra ne kadar çabuk bastı?
  const gecikme = Math.max(0, c.flaggedAt - bitti)
  const oran = 1 - gecikme / CATCH_WINDOW_MS
  const speedBonus = Math.max(0, Math.round(MAX_SPEED_BONUS * Math.min(1, oran)))
  const points = (wrong.points ?? 100) + speedBonus

  const resolved: Catch = {
    ...c,
    status: 'hit',
    wrongIndex,
    points,
    // Soruyu DOĞRU ŞIK OLMADAN gönderiyoruz
    ...(wrong.followUp
      ? { question: wrong.followUp.question, options: wrong.followUp.options }
      : {}),
    resolvedAt: Date.now(),
  }
  await saveCatch(resolved)

  if (p) {
    await saveParticipant({
      ...p,
      score: p.score + points,
      hits: p.hits + 1,
    })
  }
  return resolved
}

/** Öğrenci tarafı: ek soruya cevap verir. Puanı yine hoca hesaplar. */
export async function answerCatch(c: Catch, answerIndex: number): Promise<void> {
  await saveCatch({ ...c, answerIndex })
}

/**
 * Hoca cihazı: cevabı değerlendirir, doğruysa bonus ekler ve doğru şıkkı
 * açığa çıkarır.
 */
export async function gradeAnswer(
  c: Catch,
  wrongBlocks: WrongBlock[],
  participants: Participant[],
): Promise<Catch> {
  const wrong = c.wrongIndex !== undefined ? wrongBlocks[c.wrongIndex] : undefined
  const fu = wrong?.followUp
  if (!fu || c.answerIndex === undefined) return c

  const dogru = c.answerIndex === fu.correctIndex
  const bonus = dogru ? fu.bonus : 0

  const graded: Catch = {
    ...c,
    answerCorrect: dogru,
    bonus,
    revealIndex: fu.correctIndex,
    revealText: wrong?.correction || wrong?.explanation || '',
  }
  await saveCatch(graded)

  if (bonus > 0) {
    const p = participants.find((x) => x.id === c.participantId)
    if (p) await saveParticipant({ ...p, score: p.score + bonus })
  }
  return graded
}

/**
 * Ders bitince: hiç yakalayamadığı her hata için "kaçırdı" işlenir.
 * Puan düşmez — bilgi eksiğini raporda göstermek için.
 */
export async function markMissedWrongs(
  wrongCount: number,
  participants: Participant[],
  catches: Catch[],
): Promise<void> {
  for (const p of participants) {
    const yakaladigi = new Set(
      catches
        .filter((c) => c.participantId === p.id && c.status === 'hit' && c.wrongIndex !== undefined)
        .map((c) => c.wrongIndex as number),
    )
    const kacirdi = wrongCount - yakaladigi.size
    if (kacirdi > 0 && p.misses !== kacirdi) {
      await saveParticipant({ ...p, misses: kacirdi })
    }
  }
}

/* ══════════════════════════════════════════════════════════
   ARAŞTIRMA ANKETİ
   ══════════════════════════════════════════════════════════ */

export async function submitSurvey(r: SurveyResponse): Promise<void> {
  if (live()) {
    await setDoc(doc(firestore!, 'surveys', r.id), r)
    return
  }
  store.putSurvey(r)
}

export function watchSurveys(sessionId: string, cb: (list: SurveyResponse[]) => void): () => void {
  if (live()) {
    const q = query(collection(firestore!, 'surveys'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as SurveyResponse)),
      (err) => {
        console.error('[surveys] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getSurveys().filter((r) => r.sessionId === sessionId))
  emit()
  return store.subscribe(emit)
}

/* ══════════════════════════════════════════════════════════
   DERS SONU DEĞERLENDİRMESİ (5 YILDIZ)
   ══════════════════════════════════════════════════════════ */

export async function submitRating(
  sessionId: string,
  participant: Participant,
  stars: number,
  comment: string,
): Promise<SessionRating> {
  const rating: SessionRating = {
    // Kimlik katılımcıdan türetiliyor: aynı öğrenci iki kez oy veremesin,
    // ikinci gönderim birincinin üzerine yazsın.
    id: `rate_${participant.id}`,
    sessionId,
    participantId: participant.id,
    participantName: participant.name,
    stars: Math.min(5, Math.max(1, Math.round(stars))),
    comment: comment.trim(),
    createdAt: Date.now(),
  }

  if (live()) {
    await setDoc(doc(firestore!, 'ratings', rating.id), rating)
  } else {
    store.putRating(rating)
  }
  return rating
}

export function watchRatings(sessionId: string, cb: (list: SessionRating[]) => void): () => void {
  if (live()) {
    const q = query(collection(firestore!, 'ratings'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as SessionRating)),
      (err) => {
        console.error('[ratings] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getRatings().filter((r) => r.sessionId === sessionId))
  emit()
  return store.subscribe(emit)
}

/** Ortalama yıldız ve 1–5 dağılımı */
export function ratingSummary(ratings: SessionRating[]) {
  const counts = [0, 0, 0, 0, 0] // index 0 = 1 yıldız
  for (const r of ratings) {
    const i = Math.min(5, Math.max(1, Math.round(r.stars))) - 1
    counts[i]++
  }
  const total = ratings.reduce((sum, r) => sum + r.stars, 0)
  return {
    count: ratings.length,
    average: ratings.length ? total / ratings.length : 0,
    counts,
  }
}

/* ══════════════════════════════════════════════════════════
   ESKİ AMFİ MODU (ZİL) — GEÇIŞ DÖNEMİ
   Yeni kod Catch kullanıyor. Amfi 1.0 ekranları için tutuluyor.
   ══════════════════════════════════════════════════════════ */

export async function sendBuzz(session: LiveSession, participantId: string): Promise<void> {
  const b: Buzz = {
    id: uid('bz'),
    sessionId: session.id,
    participantId,
    blockIndex: session.currentBlockIndex,
    reactionMs: Math.max(0, Date.now() - session.blockStartedAt),
    createdAt: Date.now(),
  }
  if (live()) {
    await setDoc(doc(firestore!, 'buzzes', b.id), b)
    return
  }
  store.putBuzz(b)
}

export function watchBuzzes(sessionId: string, cb: (list: Buzz[]) => void): () => void {
  if (live()) {
    const q = query(collection(firestore!, 'buzzes'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as Buzz)),
      (err) => {
        console.error('[buzzes] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () => cb(store.getBuzzes().filter((b) => b.sessionId === sessionId))
  emit()
  return store.subscribe(emit)
}

export interface BlockOutcome {
  participantId: string
  kind: 'hit' | 'miss' | 'false'
  delta: number
  reactionMs?: number
}

export async function scoreBlock(
  session: LiveSession,
  block: Block,
  participants: Participant[],
  buzzes: Buzz[],
): Promise<BlockOutcome[]> {
  const forBlock = buzzes.filter((b) => b.blockIndex === session.currentBlockIndex)
  const firstBuzz = new Map<string, Buzz>()
  for (const b of forBlock) {
    const prev = firstBuzz.get(b.participantId)
    if (!prev || b.reactionMs < prev.reactionMs) firstBuzz.set(b.participantId, b)
  }

  const outcomes: BlockOutcome[] = []
  const points = block.points ?? 100

  for (const p of participants) {
    const buzz = firstBuzz.get(p.id)
    let delta = 0
    let kind: BlockOutcome['kind']

    if (block.isWrong) {
      if (buzz) {
        kind = 'hit'
        delta = points + speedBonus(buzz.reactionMs, session.blockDurationMs)
      } else {
        kind = 'miss'
      }
    } else {
      if (buzz) {
        kind = 'false'
        delta = -FALSE_ALARM_PENALTY
      } else {
        continue
      }
    }

    outcomes.push({ participantId: p.id, kind, delta, reactionMs: buzz?.reactionMs })

    await saveParticipant({
      ...p,
      score: Math.max(0, p.score + delta),
      hits: p.hits + (kind === 'hit' ? 1 : 0),
      misses: p.misses + (kind === 'miss' ? 1 : 0),
      falseAlarms: p.falseAlarms + (kind === 'false' ? 1 : 0),
    })
  }

  return outcomes
}

// Eski speedBonus (reactionMs ile)
function speedBonus(reactionMs: number, blockDurationMs: number): number {
  if (blockDurationMs <= 0) return 0
  const ratio = 1 - reactionMs / blockDurationMs
  return Math.max(0, Math.round(MAX_SPEED_BONUS * Math.min(1, ratio)))
}

export { isFirebaseConfigured }
