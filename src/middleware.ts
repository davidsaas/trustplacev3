import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ROUTES } from '@/lib/constants'
import { CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // If user is not signed in and the current path is protected, redirect to sign in
  if (!session && request.nextUrl.pathname.startsWith('/report')) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url))
  }

  // If there's a session and the user is trying to access auth pages
  if (
    session && 
    (request.nextUrl.pathname.startsWith(ROUTES.SIGN_IN) || 
     request.nextUrl.pathname.startsWith(ROUTES.SIGN_UP))
  ) {
    // If there's a next parameter, redirect there, otherwise go to home
    const next = request.nextUrl.searchParams.get('next') || ROUTES.HOME
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = next
    redirectUrl.searchParams.delete('next')
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ['/report/:path*', '/auth/sign-in', '/auth/sign-up'],
} 