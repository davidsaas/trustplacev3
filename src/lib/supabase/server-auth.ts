import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { type CookieOptions } from '@supabase/ssr'
import { Database } from '../supabase'
import { redirect } from 'next/navigation'
import { ROUTES } from '@/lib/constants'

// Create a Supabase client for server components with proper cookie handling
export function createServerSupabaseClient() {
  const cookieStore = cookies()
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}

// Helper to get the current authenticated user in server components
export async function getUser() {
  const supabase = createServerSupabaseClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

// Helper to require authentication in server components
export async function requireAuth(redirectTo?: string) {
  const user = await getUser()
  
  if (!user) {
    redirect(redirectTo || ROUTES.SIGN_IN)
  }
  
  return user
} 