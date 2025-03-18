import { createClient } from './client'

export type AuthError = {
  message: string
  status: number
}

export const signInWithEmail = async (email: string, password: string) => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    return { data, error: null }
  } catch (error: any) {
    return {
      data: null,
      error: {
        message: error.message || 'An error occurred during sign in',
        status: error.status || 500,
      } as AuthError,
    }
  }
}

export const signUpWithEmail = async (email: string, password: string) => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) throw error

    return { data, error: null }
  } catch (error: any) {
    return {
      data: null,
      error: {
        message: error.message || 'An error occurred during sign up',
        status: error.status || 500,
      } as AuthError,
    }
  }
}

export const signOut = async () => {
  const supabase = createClient()
  
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    return { error: null }
  } catch (error: any) {
    return {
      error: {
        message: error.message || 'An error occurred during sign out',
        status: error.status || 500,
      } as AuthError,
    }
  }
}

export const signInWithGoogle = async () => {
  const supabase = createClient()
  
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) throw error

    return { data, error: null }
  } catch (error: any) {
    return {
      data: null,
      error: {
        message: error.message || 'An error occurred during Google sign in',
        status: error.status || 500,
      } as AuthError,
    }
  }
} 