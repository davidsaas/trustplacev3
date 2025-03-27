import { createClient } from './client'
import { AUTH_REDIRECT_URLS } from '@/lib/constants'
import { AuthError, User, Provider } from '@supabase/supabase-js'
import { getBaseUrl } from '@/lib/utils'

type AuthResponse = {
  error: AuthError | null
  data?: {
    user?: User | null
    provider?: Provider
    url?: string
  } | null
}

export const signInWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    return { error: null, data }
  } catch (error) {
    return { error: error as AuthError, data: null }
  }
}

export const signUpWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error

    return { error: null, data }
  } catch (error) {
    return { error: error as AuthError, data: null }
  }
}

export const signOut = async (): Promise<AuthResponse> => {
  const supabase = createClient()
  
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    return { error: null, data: null }
  } catch (error) {
    return { error: error as AuthError, data: null }
  }
}

export const signInWithGoogle = async (): Promise<AuthResponse> => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${getBaseUrl()}${AUTH_REDIRECT_URLS.OAUTH_CALLBACK}`,
      },
    })

    if (error) throw error

    return { error: null, data }
  } catch (error) {
    return { error: error as AuthError, data: null }
  }
} 