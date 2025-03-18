'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { signInWithEmail, signUpWithEmail, signOut, signInWithGoogle } from '@/lib/supabase/auth'

export const useAuth = () => {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const result = await signInWithEmail(email, password)
    setLoading(false)
    
    if (!result.error && result.data) {
      router.push('/dashboard')
    }
    
    return result
  }, [router])

  const handleSignUp = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const result = await signUpWithEmail(email, password)
    setLoading(false)
    
    if (!result.error && result.data) {
      router.push('/auth/verify')
    }
    
    return result
  }, [router])

  const handleSignOut = useCallback(async () => {
    setLoading(true)
    const result = await signOut()
    setLoading(false)
    
    if (!result.error) {
      router.push('/')
    }
    
    return result
  }, [router])

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true)
    const result = await signInWithGoogle()
    setLoading(false)
    return result
  }, [])

  return {
    user,
    loading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGoogle: handleGoogleSignIn,
  }
} 