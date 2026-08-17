import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '@/lib/api'
import type { AppUser, Role } from '@/lib/types'

interface AuthValue {
  user: AppUser | null
  loading: boolean
  isTeacher: boolean
  signIn: (email: string, password: string) => Promise<AppUser>
  signUp: (name: string, email: string, password: string, role: Role) => Promise<AppUser>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = api.watchAuth((u) => {
      setUser(u)
      setLoading(false)
    })
    const t = setTimeout(() => setLoading(false), 4000) // güvenlik ağı
    return () => {
      clearTimeout(t)
      unsub()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isTeacher: user?.role === 'teacher',
      signIn: async (email, password) => {
        const u = await api.signIn(email, password)
        setUser(u)
        return u
      },
      signUp: async (name, email, password, role) => {
        const u = await api.signUp(name, email, password, role)
        setUser(u)
        return u
      },
      signOut: async () => {
        await api.signOutUser()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  return ctx
}
