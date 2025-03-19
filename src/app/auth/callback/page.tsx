'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const handleAuthCallback = async () => {
      const { searchParams } = new URL(window.location.href)
      const code = searchParams.get('code')
      const next = searchParams.get('next')

      if (code) {
        await supabase.auth.exchangeCodeForSession(code)
      }

      // If no next parameter or it's an auth page, redirect to home
      if (!next || next.startsWith('/auth/')) {
        router.push('/')
        return
      }

      // Ensure we're using the full URL for the redirect
      const redirectUrl = next.startsWith('http') ? next : `${window.location.origin}${next}`
      router.push(redirectUrl)
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-4">Redirecting...</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    </div>
  )
} 