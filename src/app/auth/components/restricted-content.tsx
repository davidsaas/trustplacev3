'use client'

import Link from 'next/link'
import { useSupabase } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'

interface RestrictedContentProps {
  children: React.ReactNode
}

export const RestrictedContent = ({ children }: RestrictedContentProps) => {
  const { user, loading } = useSupabase()
  const pathname = usePathname()
  
  // If still loading authentication state, show a simplified version
  // to avoid content flashing between states
  if (loading) {
    return (
      <div className="relative">
        <div className="filter blur-md pointer-events-none opacity-50">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/80 p-4 rounded-lg text-center">
            <p className="text-gray-500">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  // If user is authenticated, show the content normally
  if (user) {
    return <>{children}</>
  }

  // Otherwise show the restricted version with sign-in prompt
  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="filter blur-md pointer-events-none">
        {children}
      </div>

      {/* Overlay with CTA */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md mx-4">
          <h3 className="text-xl font-semibold mb-2">
            Sign up to view safety metrics
          </h3>
          <p className="text-gray-600 mb-4">
            Get access to detailed safety insights and community opinions
          </p>
          <div className="space-x-4">
            <Link href={`/auth/sign-up?next=${encodeURIComponent(pathname)}`} passHref>
              <Button>Sign Up</Button>
            </Link>
            <Link href={`/auth/sign-in?next=${encodeURIComponent(pathname)}`} passHref>
              <Button className="bg-white text-gray-900 border border-gray-300 hover:bg-gray-50">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
} 