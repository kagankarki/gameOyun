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
  LeaderRow,
  Lesson,
  LiveSession,
  LiveSessionMode,
  LiveSessionVersion,
  Participant,
  SessionRating,
  StudentNote,
  WrongBlock,
} from './types'
import { uid } from './utils'
import { validateStudentNote } from './gemini'

const live = () => Boolean(isFirebaseConfigured && firestore)

/** Boşa basma / boşa yazma cezası */
export const FALSE_ALARM_PENALTY = 40
/** Hız bonusunun üst sınırı */
export const MAX_SPEED_BONUS = 30
/** Amfi 1.0: zile basmak bir saniyelik iş — kısa tolerans yeter */
export const GRACE_MS = 1500
/**
 * Amfi 2.0: öğrenci not YAZIYOR. Cümlenin sonundaki hatayı duyup bir şeyler
 * yazması 1,5 saniyede bitmez — bu yüzden ayrı ve uzun bir tolerans.
 */
export const NOTE_GRACE_MS = 20_000

/**
 * Türkçe TTS 1x hızda kabaca 14 karakter/sn okuyor.
 * Okuma bitmeden gelen notlara hız bonusu verebilmek için gerekli;
 * gerçek süre onEnd'de ölçülüp `blockDurationMs`e yazılıyor.
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
    segments: s.segments ?? [],
    wrongBlocks: s.wrongBlocks ?? [],
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
  /** Amfi 2.0: sesli okunacak parçalar */
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
    segments: opts.segments ?? [],
    currentBlockIndex: 0,
    blockStartedAt: 0,
    blockDurationMs: 0,
    blockEstimateMs: 0,
    graceEndsAt: 0,
    wrongBlocks: opts.wrongBlocks ?? [],
    createdAt: now,
    updatedAt: now,
  }
  await saveSession(session)
  return session
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
   ÖĞRENCI NOTLARI (AMFI 2.0)
   Öğrenci yanlış bölümde not yazıyor, Gemini doğruluyor.
   ══════════════════════════════════════════════════════════ */

export async function submitStudentNote(
  session: LiveSession,
  participantId: string,
  noteText: string,
  /** "HATA VAR"a bastığı an — verilmezse gönderim anı sayılır */
  flaggedAt?: number,
): Promise<StudentNote> {
  const now = Date.now()
  const note: StudentNote = {
    id: uid('note'),
    sessionId: session.id,
    participantId,
    blockIndex: session.currentBlockIndex,
    text: noteText.trim(),
    status: 'pending',
    flaggedAt: flaggedAt ?? now,
    createdAt: now,
  }

  if (live()) {
    await setDoc(doc(firestore!, 'studentNotes', note.id), note)
  } else {
    store.putStudentNote(note)
  }

  return note
}

/**
 * Gemini'ye gönder: yanlış doğru mu anlaşılmış?
 * Hoca'nın belirttiği yanlışı bulup kontrol et.
 */
export async function validateNote(
  session: LiveSession,
  note: StudentNote,
): Promise<StudentNote> {
  const wrong = session.wrongBlocks.find((w) => w.blockIndex === note.blockIndex)

  // Bu bölümde işaretlenmiş bir yanlış yok — öğrenci boşa yazmış.
  // Gemini'ye sormaya gerek yok, doğrudan geçersiz.
  const updated: StudentNote = wrong
    ? await (async () => {
        const result = await validateStudentNote(wrong.explanation, note.text)
        return {
          ...note,
          status: result.valid ? ('valid' as const) : ('invalid' as const),
          geminiFeedback: result.feedback,
          validatedAt: Date.now(),
        }
      })()
    : {
        ...note,
        status: 'invalid',
        geminiFeedback: 'Bu bölümde bir yanlış yoktu.',
        validatedAt: Date.now(),
      }

  if (live()) {
    await setDoc(doc(firestore!, 'studentNotes', note.id), updated)
  } else {
    store.putStudentNote(updated)
  }

  return updated
}

export function watchStudentNotes(
  sessionId: string,
  cb: (list: StudentNote[]) => void,
): () => void {
  if (live()) {
    const q = query(collection(firestore!, 'studentNotes'), where('sessionId', '==', sessionId))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => d.data() as StudentNote)),
      (err) => {
        console.error('[studentNotes] dinlenemedi:', err)
        cb([])
      },
    )
  }
  const emit = () =>
    cb(store.getStudentNotes().filter((n) => n.sessionId === sessionId))
  emit()
  return store.subscribe(emit)
}

/* ══════════════════════════════════════════════════════════
   PUANLAMA (AMFI 2.0)
   Yalnızca hoca cihazı hesaplar — 150 istemci kendi hesaplasa
   tutarsızlık çıkardı. Firestore kuralları da katılımcı puanını
   sadece hocanın yazmasına izin veriyor.
   ══════════════════════════════════════════════════════════ */

/**
 * Ne kadar erken YAKALADIYSA o kadar bonus.
 *
 * Ölçülen an, öğrencinin butona bastığı an (`flaggedAt`) — gönderim anı
 * değil. Aksi hâlde hatayı ilk fark eden ama yavaş yazan öğrenci bonusu
 * kaybederdi; ölçtüğümüz şey yazma hızı değil, fark etme hızı.
 *
 * Okuma sürerken gerçek süre henüz bilinmediği için tahmine düşeriz;
 * bölüm kapanınca `blockDurationMs` dolar ve ölçülen süre kullanılır.
 */
export function speedBonusFromNote(note: StudentNote, session: LiveSession): number {
  const span = session.blockDurationMs || session.blockEstimateMs
  if (span <= 0) return 0
  const reactionMs = (note.flaggedAt ?? note.createdAt) - session.blockStartedAt
  const ratio = 1 - reactionMs / span
  return Math.max(0, Math.round(MAX_SPEED_BONUS * Math.min(1, ratio)))
}

export interface NoteOutcome {
  note: StudentNote
  delta: number
}

/**
 * Bir notu Gemini'ye doğrulatır ve puanı ANINDA işler.
 *
 * Hoca ekranı bekleyen her notu buraya verir; öğrenci bölüm daha
 * kapanmadan "✓ doğru, +115" görür. Notlar sırayla işlenmeli —
 * aynı katılımcının iki notu paralel işlenirse ikincisi birincinin
 * puanını ezer.
 */
export async function resolveNote(
  session: LiveSession,
  note: StudentNote,
  participants: Participant[],
): Promise<NoteOutcome> {
  const validated = await validateNote(session, note)
  const p = participants.find((x) => x.id === note.participantId)
  if (!p) return { note: validated, delta: 0 }

  const wrong = session.wrongBlocks.find((w) => w.blockIndex === note.blockIndex)
  const delta =
    validated.status === 'valid'
      ? (wrong?.points ?? 100) + speedBonusFromNote(validated, session)
      : -FALSE_ALARM_PENALTY

  await saveParticipant({
    ...p,
    score: Math.max(0, p.score + delta),
    hits: p.hits + (delta > 0 ? 1 : 0),
    falseAlarms: p.falseAlarms + (delta < 0 ? 1 : 0),
  })

  return { note: validated, delta }
}

/**
 * Bölüm kapanırken hiç not yazmayanlara "kaçırdı" yazar.
 * Puan düşmez — Amfi 1.0'daki `miss` davranışıyla aynı.
 */
export async function markMisses(
  session: LiveSession,
  participants: Participant[],
  notes: StudentNote[],
): Promise<number> {
  const wrong = session.wrongBlocks.find((w) => w.blockIndex === session.currentBlockIndex)
  if (!wrong) return 0 // Bu bölümde yakalanacak bir şey yoktu

  const wrote = new Set(
    notes.filter((n) => n.blockIndex === session.currentBlockIndex).map((n) => n.participantId),
  )
  const missed = participants.filter((p) => !wrote.has(p.id))
  for (const p of missed) {
    await saveParticipant({ ...p, misses: p.misses + 1 })
  }
  return missed.length
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
   Yeni kod StudentNote kullanıyor. Eski ekranlar uyumlu tutulması için.
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
