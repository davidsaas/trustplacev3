'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NAVIGATION } from '@/lib/constants/landing-page'
import { useSupabase } from '@/components/providers/supabase-provider'
import { useAuth } from '@/hooks/use-auth'

export function MainNav() {
  const pathname = usePathname()
  const { user } = useSupabase()
  const { signOut } = useAuth()

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold">Trustplace</span>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-4">
          {user ? (
            <Button 
              variant="outline" 
              onClick={() => signOut()}
            >
              Sign Out
            </Button>
          ) : (
            <>
              {NAVIGATION.auth.map((item) => (
                <Button
                  key={item.id}
                  variant={item.variant}
                  asChild
                  className={cn(
                    "transition-colors",
                    pathname === item.href && "bg-accent text-accent-foreground"
                  )}
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </>
          )}
        </div>
      </div>
    </nav>
  )
} 