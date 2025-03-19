'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { AUTH_REDIRECT_URLS } from '@/lib/constants'

export const useAuth = () => {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const supabase = createClient()
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      
      // Stay on the current page after sign in
      router.refresh()
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed' }
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleSignUp = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const supabase = createClient()
    
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}`,
        },
      })

      if (error) throw error

      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign up failed' }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    
    try {
      await supabase.auth.signOut()
      router.push(AUTH_REDIRECT_URLS.AFTER_SIGN_OUT)
    } catch (error) {
      console.error('Error signing out:', error)
      return { error: 'Error signing out' }
    }
  }, [router])

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}?next=${pathname}`,
        },
      })

      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Google sign in failed' }
    } finally {
      setLoading(false)
    }
  }, [pathname])

  return {
    user,
    loading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGoogle: handleGoogleSignIn,
  }
} 