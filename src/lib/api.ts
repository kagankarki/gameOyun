/**
 * TEK GİRİŞ NOKTASI — Uygulamanın tüm veri işlemleri buradan geçer.
 * Firebase yapılandırılmışsa Firestore + Firebase Auth kullanılır,
 * yapılandırılmamışsa otomatik olarak DEMO MOD (localStorage) devreye girer.
 */
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'

import { firebaseAuth, firestore, isFirebaseConfigured } from './firebase'
import * as store from './store'
import type { AppUser, Lesson, Role } from './types'
import { uid } from './utils'

const live = () => Boolean(isFirebaseConfigured && firestore && firebaseAuth)

/* ══════════════════════════════════════════════════════════
   KİMLİK DOĞRULAMA
   ══════════════════════════════════════════════════════════ */

export async function signUp(
  name: string,
  email: string,
  password: string,
  role: Role,
): Promise<AppUser> {
  if (live()) {
    const cred = await createUserWithEmailAndPassword(firebaseAuth!, email, password)
    await updateProfile(cred.user, { displayName: name })
    const user: AppUser = {
      uid: cred.user.uid,
      name,
      email,
      role,
      createdAt: Date.now(),
    }
    await setDoc(doc(firestore!, 'users', user.uid), user)
    return user
  }

  // DEMO MOD
  store.ensureSeed()
  const key = email.trim().toLowerCase()
  if (store.getUsers().some((u) => u.email.toLowerCase() === key)) {
    throw new Error('Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.')
  }
  if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.')
  const user: AppUser = { uid: uid('u'), name, email: key, role, createdAt: Date.now() }
  store.putUser(user)
  store.putCred(key, password)
  store.setSession(user.uid)
  return user
}

export async function signIn(email: string, password: string): Promise<AppUser> {
  if (live()) {
    const cred = await signInWithEmailAndPassword(firebaseAuth!, email, password)
    const snap = await getDoc(doc(firestore!, 'users', cred.user.uid))
    if (snap.exists()) return snap.data() as AppUser
    const fallback: AppUser = {
      uid: cred.user.uid,
      name: cred.user.displayName || email.split('@')[0],
      email,
      role: 'student',
      createdAt: Date.now(),
    }
    await setDoc(doc(firestore!, 'users', fallback.uid), fallback)
    return fallback
  }

  // DEMO MOD
  store.ensureSeed()
  const key = email.trim().toLowerCase()
  const user = store.getUsers().find((u) => u.email.toLowerCase() === key)
  if (!user) throw new Error('Böyle bir hesap bulunamadı. Önce kayıt ol.')
  if (store.getCreds()[key] !== password) throw new Error('Şifre hatalı.')
  store.setSession(user.uid)
  return user
}

export async function signOutUser() {
  if (live()) return fbSignOut(firebaseAuth!)
  store.setSession(null)
}

/** Oturum değişimlerini dinler. Temizleme fonksiyonu döner. */
export function watchAuth(cb: (u: AppUser | null) => void): () => void {
  if (live()) {
    return onAuthStateChanged(firebaseAuth!, async (fbUser) => {
      if (!fbUser) return cb(null)
      try {
        const snap = await getDoc(doc(firestore!, 'users', fbUser.uid))
        cb(
          snap.exists()
            ? (snap.data() as AppUser)
            : {
                uid: fbUser.uid,
                name: fbUser.displayName || 'Kullanıcı',
                email: fbUser.email || '',
                role: 'student',
                createdAt: Date.now(),
              },
        )
      } catch (e) {
        console.error(e)
        cb(null)
      }
    })
  }

  store.ensureSeed()
  const emit = () => {
    const id = store.getSession()
    cb(id ? (store.getUsers().find((u) => u.uid === id) ?? null) : null)
  }
  emit()
  return store.subscribe(emit)
}

/* ══════════════════════════════════════════════════════════
   DERSLER
   ══════════════════════════════════════════════════════════ */

export function watchLessons(cb: (lessons: Lesson[]) => void): () => void {
  const sortDesc = (a: Lesson, b: Lesson) => b.updatedAt - a.updatedAt

  if (live()) {
    return onSnapshot(
      collection(firestore!, 'lessons'),
      (snap) => cb(snap.docs.map((d) => d.data() as Lesson).sort(sortDesc)),
      (err) => {
        console.error('[lessons] dinlenemedi:', err)
        cb([])
      },
    )
  }

  store.ensureSeed()
  const emit = () => cb([...store.getLessons()].sort(sortDesc))
  emit()
  return store.subscribe(emit)
}

export async function getLesson(id: string): Promise<Lesson | null> {
  if (live()) {
    const snap = await getDoc(doc(firestore!, 'lessons', id))
    return snap.exists() ? (snap.data() as Lesson) : null
  }
  store.ensureSeed()
  return store.getLessons().find((l) => l.id === id) ?? null
}

export async function saveLesson(lesson: Lesson): Promise<void> {
  const payload = { ...lesson, updatedAt: Date.now() }
  if (live()) {
    await setDoc(doc(firestore!, 'lessons', payload.id), payload)
    return
  }
  store.putLesson(payload)
}

export async function deleteLesson(id: string): Promise<void> {
  if (live()) {
    await deleteDoc(doc(firestore!, 'lessons', id))
    return
  }
  store.removeLesson(id)
}

export { isFirebaseConfigured }
