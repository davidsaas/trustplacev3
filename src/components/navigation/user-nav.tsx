'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useSupabase } from '@/components/providers/supabase-provider'
import { Heart, History, LogOut, User as UserIcon } from 'lucide-react'

export function UserNav() {
  const { user } = useSupabase()
  const { signOut } = useAuth()
  
  // Use the first letter of the user's email as avatar fallback
  const userInitial = user?.email ? user.email[0].toUpperCase() : 'U'
  
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" asChild size="sm">
          <Link href="/auth/sign-in">Sign In</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/auth/sign-up">Sign Up</Link>
        </Button>
      </div>
    )
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">My Account</p>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/accommodations/saved" className="cursor-pointer flex items-center">
            <Heart className="mr-2 h-4 w-4" />
            <span>Saved Accommodations</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/accommodations/visited" className="cursor-pointer flex items-center">
            <History className="mr-2 h-4 w-4" />
            <span>Recently Visited</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer flex items-center">
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer flex items-center text-red-600"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 