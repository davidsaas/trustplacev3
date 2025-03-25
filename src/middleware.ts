import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SerializeOptions } from 'cookie'
import { ROUTES } from '@/lib/constants'

export async function middleware(request: NextRequest) {
  // Create a response object to modify
  const response = NextResponse.next()
  
  // Create a Supabase client for the middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: SerializeOptions = {}) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: SerializeOptions = {}) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  try {
    // Get the session - this is the only auth check we need
    const { data: { session } } = await supabase.auth.getSession()
    const pathname = request.nextUrl.pathname
    
    // For protected routes, redirect to login if no session
    if (!session && pathname.startsWith('/report')) {
      const redirectUrl = new URL(ROUTES.SIGN_IN, request.url)
      // Pass the originally requested URL as 'next' parameter
      redirectUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Redirect away from auth pages if already signed in
    if (session && pathname.startsWith('/auth/')) {
      // Skip the callback route since it needs to process auth
      if (pathname === '/auth/callback') {
        return response
      }
      // Redirect to home or to the next parameter if provided
      const next = request.nextUrl.searchParams.get('next') || ROUTES.HOME
      return NextResponse.redirect(new URL(next, request.url))
    }

    return response
  } catch (error) {
    console.error('Middleware error:', error)
    return response
  }
}

export const config = {
  matcher: ['/report/:path*', '/auth/:path*'],
} 