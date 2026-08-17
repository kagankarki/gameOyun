/**
 * DEMO MOD deposu — Firebase yapılandırılmadığında devreye girer.
 * Veriler tarayıcının localStorage'ında tutulur, sekmeler arasında senkronlanır.
 */
import type {
  AppUser,
  Buzz,
  Lesson,
  LiveSession,
  Participant,
  SessionRating,
  StudentNote,
} from './types'
import { demoLesson } from './seed'

const K = {
  users: 'hy.users',
  creds: 'hy.creds',
  session: 'hy.session',
  lessons: 'hy.lessons',
  seeded: 'hy.seeded.v1',
  // Amfi / canlı ders
  live: 'hy.live.sessions',
  parts: 'hy.live.participants',
  buzzes: 'hy.live.buzzes', // Eski mod (geçiş dönemi)
  notes: 'hy.live.notes', // Yeni mod
  ratings: 'hy.live.ratings',
  /** Bu sekmedeki öğrencinin katılımı — { sessionId, participantId } */
  meParticipant: 'hy.live.me',
}

type Listener = () => void
const listeners = new Set<Listener>()

export const notify = () => {
  listeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      console.error(e)
    }
  })
}

export const subscribe = (fn: Listener) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => notify())
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error('localStorage yazılamadı', e)
  }
  notify()
}

/* ── Tohumlama ─────────────────────────────────────────── */
export const ensureSeed = () => {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(K.seeded)) return
  const lessons = read<Lesson[]>(K.lessons, [])
  if (!lessons.some((l) => l.id === 'demo_anatomi_1')) {
    lessons.push(demoLesson())
    localStorage.setItem(K.lessons, JSON.stringify(lessons))
  }
  localStorage.setItem(K.seeded, '1')
}

/* ── Kullanıcılar ──────────────────────────────────────── */
export const getUsers = () => read<AppUser[]>(K.users, [])
export const putUser = (u: AppUser) => {
  const users = getUsers().filter((x) => x.uid !== u.uid)
  users.push(u)
  write(K.users, users)
}
export const getCreds = () => read<Record<string, string>>(K.creds, {})
export const putCred = (email: string, password: string) => {
  const c = getCreds()
  c[email.toLowerCase()] = password
  write(K.creds, c)
}
export const getSession = () => read<string | null>(K.session, null)
export const setSession = (uidValue: string | null) => write(K.session, uidValue)

/* ── Dersler ───────────────────────────────────────────── */
export const getLessons = () => read<Lesson[]>(K.lessons, [])
export const putLesson = (l: Lesson) => {
  const list = getLessons().filter((x) => x.id !== l.id)
  list.push(l)
  write(K.lessons, list)
}
export const removeLesson = (id: string) =>
  write(K.lessons, getLessons().filter((l) => l.id !== id))

/* ── Amfi: canlı oturumlar ─────────────────────────────── */
export const getLiveSessions = () => read<LiveSession[]>(K.live, [])
export const putLiveSession = (s: LiveSession) => {
  const list = getLiveSessions().filter((x) => x.id !== s.id)
  list.push(s)
  write(K.live, list)
}

export const getParticipants = () => read<Participant[]>(K.parts, [])
export const putParticipant = (p: Participant) => {
  const list = getParticipants().filter((x) => x.id !== p.id)
  list.push(p)
  write(K.parts, list)
}

export const getBuzzes = () => read<Buzz[]>(K.buzzes, [])
export const putBuzz = (b: Buzz) => {
  const list = getBuzzes().filter((x) => x.id !== b.id)
  list.push(b)
  write(K.buzzes, list)
}

export const getStudentNotes = () => read<StudentNote[]>(K.notes, [])
export const putStudentNote = (n: StudentNote) => {
  const list = getStudentNotes().filter((x) => x.id !== n.id)
  list.push(n)
  write(K.notes, list)
}

export const getRatings = () => read<SessionRating[]>(K.ratings, [])
export const putRating = (r: SessionRating) => {
  const list = getRatings().filter((x) => x.id !== r.id)
  list.push(r)
  write(K.ratings, list)
}

/**
 * Bu sekmenin hangi oturuma hangi katılımcı olarak girdiği — sayfa
 * yenilenince kaybolmasın.
 *
 * Eskiden yalnızca katılımcı kimliği tutuluyordu; oturumu bulmak için
 * localStorage'daki katılımcı listesi taranıyordu. Firebase modunda o liste
 * boş olduğu için yenileyen öğrenci oyundan düşüyordu — oturum kimliğini de
 * saklıyoruz.
 */
export interface MyJoin {
  sessionId: string
  participantId: string
}

export const getMyJoin = (): MyJoin | null => {
  const raw = read<MyJoin | string | null>(K.meParticipant, null)
  if (!raw) return null
  // Eski sürüm yalnızca id yazıyordu — okunabilir kalsın
  if (typeof raw === 'string') return null
  return raw.sessionId && raw.participantId ? raw : null
}

export const setMyJoin = (join: MyJoin | null) => write(K.meParticipant, join)

export const wipeAll = () => {
  Object.values(K).forEach((k) => localStorage.removeItem(k))
  notify()
}
