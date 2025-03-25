'use client'

import Link from 'next/link'
import { useSupabase } from '@/components/shared/providers/supabase-provider'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'

interface RestrictedContentProps {
  children: React.ReactNode
}

export const RestrictedContent = ({ children }: RestrictedContentProps) => {
  const { user } = useSupabase()
  const pathname = usePathname()

  if (user) {
    return <>{children}</>
  }

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
            <Link href={`/auth/sign-up?next=${pathname}`}>
              <Button>Sign Up</Button>
            </Link>
            <Link href={`/auth/sign-in?next=${pathname}`}>
              <Button outline>Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
} 