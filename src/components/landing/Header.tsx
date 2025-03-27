'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverButton,
  PopoverBackdrop,
  PopoverPanel,
  Transition,
} from '@headlessui/react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/landing/Container'
import { Logo } from '@/components/landing/Logo'
import { NavLinks } from '@/components/landing/NavLinks'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { User, BookmarkIcon, LogOut } from 'lucide-react'
import { ROUTES } from '@/lib/constants'
import { usePathname } from 'next/navigation'

function MenuIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 6h14M5 18h14M5 12h14"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronUpIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M17 14l-5-5-5 5"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MobileNavLink(
  props: Omit<
    React.ComponentPropsWithoutRef<typeof PopoverButton<typeof Link>>,
    'as' | 'className'
  >,
) {
  return (
    <PopoverButton
      as={Link}
      className="block text-base/7 tracking-tight text-gray-700"
      {...props}
    />
  )
}

export function Header() {
  const { user, signOut, loading: isAuthLoading } = useAuth()
  const pathname = usePathname()
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    // Fetch user profile if logged in
    const fetchUserProfile = async () => {
      if (!user) return
      
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single()
      
      if (data?.avatar_url) {
        setAvatar(data.avatar_url)
      }
    }
    
    fetchUserProfile()
  }, [user])

  const handleSignOut = async () => {
    await signOut(pathname)
    setShowUserDropdown(false)
  }

  return (
    <header className="py-10">
      <Container>
        <nav className="relative z-50 flex justify-between">
          <div className="flex items-center md:gap-x-12">
            <Link href="/" aria-label="Home">
              <Logo className="h-10 w-auto" />
            </Link>
            <div className="hidden md:flex md:gap-x-6">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-x-5 md:gap-x-8">
            <div className="hidden md:block">
              {isAuthLoading ? (
                <div className="flex gap-x-4">
                  <div className="h-9 w-20 rounded-md bg-gray-100 animate-pulse"></div>
                  <div className="h-9 w-20 rounded-md bg-gray-100 animate-pulse"></div>
                </div>
              ) : user ? (
                <div className="flex items-center gap-x-4">
                  <Link href="/saved" className="text-sm font-medium text-gray-700 hover:text-primary">
                    Saved Properties
                  </Link>
                  <Button onClick={handleSignOut} variant="outline">
                    Sign out
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-x-4">
                  <Link href={`${ROUTES.SIGN_IN}?next=${encodeURIComponent(pathname)}`}>
                    <Button variant="outline">Sign in</Button>
                  </Link>
                  <Link href={`${ROUTES.SIGN_UP}?next=${encodeURIComponent(pathname)}`}>
                    <Button variant="default">Sign up</Button>
                  </Link>
                </div>
              )}
            </div>
            <Popover className="md:hidden">
              {({ open }) => (
                <>
                  <PopoverButton
                    className="relative z-10 -m-2 inline-flex items-center rounded-lg stroke-gray-900 p-2 hover:bg-gray-200/50 hover:stroke-gray-600 focus:not-data-focus:outline-hidden active:stroke-gray-900"
                    aria-label="Toggle site navigation"
                  >
                    {({ open }) =>
                      open ? (
                        <ChevronUpIcon className="h-6 w-6" />
                      ) : (
                        <MenuIcon className="h-6 w-6" />
                      )
                    }
                  </PopoverButton>
                  <AnimatePresence initial={false}>
                    {open && (
                      <>
                        <PopoverBackdrop
                          static
                          as={motion.div}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-0 bg-gray-300/60 backdrop-blur-sm"
                        />
                        <PopoverPanel
                          static
                          as={motion.div}
                          initial={{ opacity: 0, y: -32 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            y: -32,
                            transition: { duration: 0.2 },
                          }}
                          className="fixed inset-x-0 top-0 z-0 origin-top rounded-b-2xl bg-gray-50 px-6 pt-32 pb-6 shadow-2xl shadow-gray-900/20"
                        >
                          <div className="space-y-4">
                            <MobileNavLink href="/#features">
                              Features
                            </MobileNavLink>
                            <MobileNavLink href="/#reviews">
                              Reviews
                            </MobileNavLink>
                            <MobileNavLink href="/#pricing">
                              Pricing
                            </MobileNavLink>
                            <MobileNavLink href="/#faqs">FAQs</MobileNavLink>
                          </div>
                          <div className="mt-6">
                            {isAuthLoading ? (
                               <div className="space-y-4">
                                 <div className="h-9 w-full rounded-md bg-gray-100 animate-pulse"></div>
                                 <div className="h-9 w-full rounded-md bg-gray-100 animate-pulse"></div>
                               </div>
                            ) : user ? (
                              <div className="mt-8 flex flex-col gap-4">
                                <Link href="/saved" className="text-base/7 tracking-tight text-gray-700">
                                  Saved Properties
                                </Link>
                                <Button variant="outline" onClick={handleSignOut}>
                                  Sign out
                                </Button>
                              </div>
                            ) : (
                              <div className="mt-8 flex flex-col gap-4">
                                <Link href={`${ROUTES.SIGN_IN}?next=${encodeURIComponent(pathname)}`}>
                                  <Button variant="outline" className="w-full">Sign in</Button>
                                </Link>
                                <Link href={`${ROUTES.SIGN_UP}?next=${encodeURIComponent(pathname)}`}>
                                  <Button variant="default" className="w-full">Sign up</Button>
                                </Link>
                              </div>
                            )}
                          </div>
                        </PopoverPanel>
                      </>
                    )}
                  </AnimatePresence>
                </>
              )}
            </Popover>
          </div>
        </nav>
      </Container>
    </header>
  )
} 