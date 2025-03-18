import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ROUTES } from '@/lib/constants'

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If there's no session and the user is trying to access a protected route
  if (!session && request.nextUrl.pathname.startsWith(ROUTES.REPORT)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = ROUTES.SIGN_IN
    redirectUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If there's a session and the user is trying to access auth pages
  if (
    session && 
    (request.nextUrl.pathname.startsWith(ROUTES.SIGN_IN) || 
     request.nextUrl.pathname.startsWith(ROUTES.SIGN_UP))
  ) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = ROUTES.HOME
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/report/:path*', '/auth/sign-in', '/auth/sign-up'],
} 