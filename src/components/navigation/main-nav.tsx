'use client'

import Link from 'next/link'
import { Heart, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSupabase } from '@/components/providers/supabase-provider'
import { useAuth } from '@/hooks/use-auth'

export function MainNav() {
  const { user } = useSupabase()
  const { signOut } = useAuth()

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold">Trustplace</span>
        </Link>

        {/* Simple right-side navigation */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Button 
                variant="ghost" 
                size="sm"
                asChild
                className="flex items-center gap-1"
              >
                <Link href="/accommodations/saved">
                  <Heart className="w-4 h-4 mr-1" />
                  <span>Saved</span>
                </Link>
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => signOut()}
                className="flex items-center gap-1"
              >
                <LogOut className="w-4 h-4 mr-1" />
                <span>Sign Out</span>
              </Button>
            </>
          ) : (
            <Button variant="outline" asChild size="sm">
              <Link href="/auth/sign-in">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
} 