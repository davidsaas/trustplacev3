import { createClient } from './client'

export type SignInCredentials = {
  email: string
  password: string
}

export type SignUpCredentials = SignInCredentials

export const auth = {
  signIn: async ({ email, password }: SignInCredentials) => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  signUp: async ({ email, password }: SignUpCredentials) => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  signInWithGoogle: async () => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
    return data
  },

  resetPassword: async (email: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) throw error
  },

  updatePassword: async (newPassword: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
  },
} 