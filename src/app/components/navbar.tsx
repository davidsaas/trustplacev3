'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, Fragment } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { MagnifyingGlassIcon as Search } from '@heroicons/react/20/solid'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { User, BookmarkIcon, LogOut, Share2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { ROUTES } from '@/lib/constants'
import { parseAccommodationURL } from '@/lib/utils/url'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function AppNavbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut, supabase, loading } = useAuth()
  const [userInitials, setUserInitials] = useState<string | null>(null);

  const isReportPage = pathname.startsWith('/safety-report/')

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user || !supabase) {
        setAvatar(null)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single()

      if (data?.avatar_url) {
        setAvatar(data.avatar_url)
      } else {
        setAvatar(null)
      }
    }

    fetchUserProfile()
  }, [user, supabase])

  useEffect(() => {
    if (user) {
      const initials = user.user_metadata?.full_name
        ? user.user_metadata.full_name.split(' ').map((name: string) => name.charAt(0)).join('')
        : null;
      setUserInitials(initials);
    }
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery || isLoading) return

    setIsLoading(true)

    try {
      const parsedUrl = parseAccommodationURL(searchQuery)

      if (!parsedUrl) {
        toast.error('Invalid URL', {
          description: 'Please enter a valid Airbnb or Booking.com URL'
        })
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/process-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedUrl)
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to process URL', {
          description: response.status === 404
            ? 'We only have data for certain accommodations in Los Angeles at the moment.'
            : undefined
        })
        setIsLoading(false)
        return
      }

      router.push(`/safety-report/${data.reportId}`)
      setSearchQuery('')
    } catch (error) {
      console.error('Error processing URL:', error)
      toast.error('An unexpected error occurred while processing the URL.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(ROUTES.HOME)
    router.push('/')
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: document.title,
        text: `Check out this safety report:`,
        url: window.location.href,
      })
      .then(() => console.log('Successful share'))
      .catch((error) => console.log('Error sharing', error));
    } else {
      navigator.clipboard.writeText(window.location.href)
        .then(() => toast.success('Report URL copied to clipboard!'))
        .catch(() => toast.error('Failed to copy URL'));
    }
  }

  return (
    <>
      <Popover as="header" className="bg-white shadow-sm border-b border-gray-200 relative z-10">
        {({ open, close }) => (
          <>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="relative flex justify-between h-16">
                <div className="flex items-center">
                  <Link href="https://trustplace.app" className="flex shrink-0 items-center">
                    <img
                      alt="TrustPlace"
                      src="/logo.svg"
                      className="h-8 w-auto"
                    />
                  </Link>
                </div>

                <div className="min-w-0 flex-1 flex items-center justify-center px-4 lg:px-0">
                  <div className="w-full max-w-md">
                    <form onSubmit={handleSearch} className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                      </div>
                      <input
                        type="text"
                        name="search"
                        id="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full rounded-md border-0 bg-gray-50 py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                        placeholder="Paste Airbnb or Booking.com URL here"
                        disabled={isLoading}
                      />
                      {isLoading && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                           <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                        </div>
                      )}
                    </form>
                  </div>
                </div>

                <div className="flex items-center lg:hidden">
                  <PopoverButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
                    <span className="absolute -inset-0.5" />
                    <span className="sr-only">Open menu</span>
                    <Bars3Icon aria-hidden="true" className="block size-6 group-data-open:hidden" />
                    <XMarkIcon aria-hidden="true" className="hidden size-6 group-data-open:block" />
                  </PopoverButton>
                </div>

                <div className="hidden lg:flex lg:items-center lg:justify-end">
                  {isReportPage && (
                    <Button
                      outline
                      onClick={handleShare}
                      className="ml-4"
                    >
                      <Share2 className="mr-2 h-4 w-4" data-slot="icon" />
                      Share Report
                    </Button>
                  )}

                  <div className="relative ml-5 shrink-0">
                    {loading ? (
                      <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse"></div>
                    ) : user ? (
                      <Popover className="relative">
                        {({ open }) => (
                          <>
                            <PopoverButton className="flex items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                              <span className="sr-only">Open user menu</span>
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={avatar ?? undefined} />
                                <AvatarFallback>{userInitials || 'U'}</AvatarFallback>
                              </Avatar>
                              <ChevronDown className={`ml-1 h-4 w-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                            </PopoverButton>

                            <Transition
                              as={Fragment}
                              enter="transition ease-out duration-100"
                              enterFrom="transform opacity-0 scale-95"
                              enterTo="transform opacity-100 scale-100"
                              leave="transition ease-in duration-75"
                              leaveFrom="transform opacity-100 scale-100"
                              leaveTo="transform opacity-0 scale-95"
                            >
                              <PopoverPanel className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                <Link
                                  href="/profile"
                                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  Your Profile
                                </Link>
                                <button
                                  onClick={handleSignOut}
                                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  Sign out
                                </button>
                              </PopoverPanel>
                            </Transition>
                          </>
                        )}
                      </Popover>
                    ) : (
                      <Link href={`${ROUTES.SIGN_IN}?next=${encodeURIComponent(pathname)}`}>
                        <Button>
                          Sign In
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <PopoverPanel as="nav" aria-label="Global" className="lg:hidden border-t border-gray-200">
              <div className="space-y-1 px-4 pt-4 pb-3">
                <form onSubmit={(e) => { handleSearch(e); close(); }} className="relative mb-4">
                   <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                     <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                   </div>
                   <input
                     type="text"
                     name="mobile-search"
                     id="mobile-search"
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="block w-full rounded-md border-0 bg-gray-50 py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                     placeholder="Paste Airbnb or Booking.com URL"
                     disabled={isLoading}
                   />
                 </form>

                {isReportPage && (
                  <Button
                    outline
                    onClick={() => { handleShare(); close(); }}
                    className="w-full justify-center mb-3"
                  >
                    <Share2 className="mr-2 h-4 w-4" data-slot="icon" />
                    Share Report
                  </Button>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4 pb-3">
                {loading ? (
                   <div className="px-4 space-y-3 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gray-200"></div>
                        <div className="h-4 w-32 bg-gray-200 rounded"></div>
                      </div>
                      <div className="h-8 w-full bg-gray-200 rounded"></div>
                      <div className="h-8 w-full bg-gray-200 rounded"></div>
                   </div>
                ) : user ? (
                  <>
                    <div className="flex items-center px-4 mb-3">
                      <div className="shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={avatar ?? undefined} />
                          <AvatarFallback>{userInitials || 'U'}</AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className="truncate text-base font-medium text-gray-800">{user.user_metadata?.full_name ?? 'User'}</div>
                        <div className="truncate text-sm font-medium text-gray-500">{user.email}</div>
                      </div>
                    </div>
                    <div className="space-y-1 px-2">
                      <Link
                        href="/profile"
                        onClick={() => close()}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        <User className="h-5 w-5" /> Profile
                      </Link>
                      <button
                        onClick={() => { handleSignOut(); close(); }}
                        className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 text-left"
                      >
                        <LogOut className="h-5 w-5" /> Sign Out
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 px-2">
                    <Link
                      href={`${ROUTES.SIGN_IN}?next=${encodeURIComponent(pathname)}`}
                      onClick={() => close()}
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign In
                    </Link>
                     <Link
                      href={`${ROUTES.SIGN_UP}?next=${encodeURIComponent(pathname)}`}
                      onClick={() => close()}
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign Up
                    </Link>
                  </div>
                )}
              </div>
            </PopoverPanel>
          </>
        )}
      </Popover>
    </>
  )
} 