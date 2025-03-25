'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverButton,
  PopoverBackdrop,
  PopoverPanel,
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
  const { user, signOut } = useAuth()
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    // Fetch user profile if logged in
    const fetchUserProfile = async () => {
      if (!user) return
      
      const supabase = createClient()
      const { data, error } = await supabase
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
    await signOut(ROUTES.HOME)
    setShowUserDropdown(false)
  }

  return (
    <header>
      <nav>
        <Container className="relative z-50 flex justify-between py-8">
          <div className="relative z-10 flex items-center gap-16">
            <Link href="/" aria-label="Home">
              <Logo className="h-10 w-auto" />
            </Link>
            <div className="hidden lg:flex lg:gap-10">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Popover className="lg:hidden">
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
                          className="absolute inset-x-0 top-0 z-0 origin-top rounded-b-2xl bg-gray-50 px-6 pt-32 pb-6 shadow-2xl shadow-gray-900/20"
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
                          {user ? (
                            <div className="mt-8 flex flex-col gap-4">
                              <Link href="/profile" className="text-base/7 tracking-tight text-gray-700">
                                Profile
                              </Link>
                              <Link href="/saved" className="text-base/7 tracking-tight text-gray-700">
                                Saved Properties
                              </Link>
                              <Button className="bg-primary hover:bg-primary/90 text-white" onClick={handleSignOut}>
                                Sign out
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-8 flex flex-col gap-4">
                              <Button className="bg-white border-primary text-primary hover:bg-gray-50" outline>
                                <Link href="/auth/sign-in">Sign in</Link>
                              </Button>
                              <Button className="bg-primary hover:bg-primary/90 text-white">
                                <Link href="/auth/sign-up">Sign up</Link>
                              </Button>
                            </div>
                          )}
                        </PopoverPanel>
                      </>
                    )}
                  </AnimatePresence>
                </>
              )}
            </Popover>
            
            {/* Desktop Nav Buttons */}
            <div className="max-lg:hidden">
              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 overflow-hidden"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                  >
                    {avatar ? (
                      <img src={avatar} alt="Profile" className="h-8 w-8 object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="sr-only">Open user menu</span>
                  </button>
                  
                  {showUserDropdown && (
                    <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                        {user.email}
                      </div>
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <User className="h-4 w-4" />
                        Profile
                      </Link>
                      <Link
                        href="/saved"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowUserDropdown(false)}
                      >
                        <BookmarkIcon className="h-4 w-4" />
                        Saved Properties
                      </Link>
                      <button
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                        onClick={handleSignOut}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <Button className="bg-white border-primary text-primary hover:bg-gray-50" outline>
                    <Link href="/auth/sign-in">Sign in</Link>
                  </Button>
                  <Button className="bg-primary hover:bg-primary/90 text-white">
                    <Link href="/auth/sign-up">Sign up</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Container>
      </nav>
    </header>
  )
} 