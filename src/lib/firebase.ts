import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * .env dosyasında gerçek Firebase bilgileri varsa canlı moda geçeriz.
 * Yoksa uygulama DEMO MOD'da (localStorage) çalışır — kurulum gerekmez.
 */
export const isFirebaseConfigured = Boolean(
  cfg.apiKey && cfg.projectId && cfg.appId && !String(cfg.apiKey).includes('BURAYA'),
)

let app: FirebaseApp | null = null
let _auth: Auth | null = null
let _db: Firestore | null = null

if (isFirebaseConfigured) {
  try {
    app = initializeApp(cfg as Record<string, string>)
    _auth = getAuth(app)
    _db = getFirestore(app)
  } catch (err) {
    console.error('[Firebase] başlatılamadı, DEMO MOD’a geçiliyor:', err)
    app = null
    _auth = null
    _db = null
  }
}

export const firebaseApp = app
export const firebaseAuth = _auth
export const firestore = _db

export const TEACHER_CODE = import.meta.env.VITE_TEACHER_CODE || 'gazi2026'

/** Konsola tek seferlik bilgi notu */
if (typeof window !== 'undefined') {
  const style = 'background:#4f46e5;color:#fff;padding:2px 8px;border-radius:6px;font-weight:600'
  if (isFirebaseConfigured && firestore) {
    console.log('%c HATAYI YAKALA ', style, '→ Firebase CANLI mod aktif.')
  } else {
    console.log(
      '%c HATAYI YAKALA ', style,
      '→ DEMO MOD (localStorage). Firebase için .env.example dosyasını .env olarak kopyala.',
    )
  }
}
