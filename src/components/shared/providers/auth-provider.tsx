'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { AUTH_REDIRECT_URLS } from '@/lib/constants'
import { getBaseUrl } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'

type AuthContextType = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error?: string, success?: boolean }>
  signOut: (returnUrl?: string) => Promise<void>
  signInWithGoogle: () => Promise<{ error: string | null }>
  sendPasswordResetEmail: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Initialize session and listen for auth changes
  useEffect(() => {
    // Check active session and set the user
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  // Sign in with email and password
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' }
    } finally {
      setLoading(false)
    }
  }, [supabase.auth])

  // Sign up with email and password
  const signUp = useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getBaseUrl()}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}?next=${pathname}`,
        },
      })

      if (error) throw error
      
      router.push(AUTH_REDIRECT_URLS.AFTER_SIGN_UP)
      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' }
    } finally {
      setLoading(false)
    }
  }, [router, pathname, supabase.auth])

  // Sign out
  const signOut = useCallback(async (returnUrl?: string) => {
    try {
      await supabase.auth.signOut()
      if (returnUrl) {
        router.push(returnUrl)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }, [router, supabase.auth])

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getBaseUrl()}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}?next=${pathname}`,
        },
      })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Google sign in failed' }
    } finally {
      setLoading(false)
    }
  }, [pathname, supabase.auth])

  // Send Password Reset Email
  const sendPasswordResetEmail = useCallback(async (email: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getBaseUrl()}/auth/update-password`,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to send password reset email' }
    } finally {
      setLoading(false)
    }
  }, [supabase.auth])

  // Update User Password
  const updatePassword = useCallback(async (password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to update password' }
    } finally {
      setLoading(false)
    }
  }, [supabase.auth])

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    sendPasswordResetEmail,
    updatePassword,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Export useSupabase as alias for useAuth to maintain compatibility with existing code
export const useSupabase = useAuth; 