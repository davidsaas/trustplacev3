'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type SupabaseContextType = {
  user: User | null
  loading: boolean
}

const SupabaseContext = createContext<SupabaseContextType>({
  user: null,
  loading: true,
})

export const useSupabase = () => {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}

export function SupabaseProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Check active sessions and sets the user
    const getAuthSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        setUser(session?.user ?? null)
        setLoading(false)
      } catch (error) {
        console.error('Error getting session:', error)
        // Don't set loading to false on error to avoid showing restricted content
        // But also don't block the UI from loading other content
        setTimeout(() => setLoading(false), 1000)
      }
    }

    getAuthSession()

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (session?.user) {
        setUser(session.user)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  const value = {
    user,
    loading,
  }

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  )
} 