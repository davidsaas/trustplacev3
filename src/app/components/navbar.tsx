'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { User, Search, BookmarkIcon, LogOut } from 'lucide-react'
import { Menu, X } from 'lucide-react'
import { Navbar, NavbarSection, NavbarItem, NavbarSpacer, NavbarLabel } from '@/components/ui/navbar-search'
import { parseAccommodationURL } from '@/lib/utils/url'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { ROUTES } from '@/lib/constants'

const navigationItems = [
  { name: 'Home', href: '/' },
  { name: 'Safety Reports', href: '/safety-reports' },
  { name: 'Locations', href: '/locations' },
]

export function AppNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()
  
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery) return
    
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parsedUrl)
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 404) {
          toast.error(data.error, {
            description: 'We only have data for certain accommodations in Los Angeles at the moment.'
          })
        } else {
          toast.error('Failed to process URL')
        }
        setIsLoading(false)
        return
      }

      router.push(`/safety-report/${data.reportId}`)
    } catch (error) {
      console.error('Error processing URL:', error)
      toast.error('Failed to process URL')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(ROUTES.HOME)
    setShowUserDropdown(false)
  }

  return (
    <>
      {/* Desktop navigation */}
      <Navbar className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex h-16 w-full items-center gap-x-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <img
              alt="TrustPlace"
              src="/logo.svg"
              className="h-8 w-auto"
            />
          </Link>
          

          
          <div className="relative mx-auto max-w-md flex-1 hidden lg:block">
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
            </form>
          </div>
          
          <div className="relative">
            {user ? (
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
            ) : (
              <Link href={ROUTES.SIGN_IN}>
                <Button className="text-sm py-1 px-3">Sign In</Button>
              </Link>
            )}
            
            {showUserDropdown && user && (
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
        </div>
      </Navbar>

      {/* Mobile menu button */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-sm lg:hidden">
        <button
          type="button"
          className="-m-2.5 p-2.5 text-gray-700"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="size-6" aria-hidden="true" />
        </button>
        <div className="flex-1 text-center">
          <img
            alt="TrustPlace"
            src="/logo.svg"
            className="h-8 w-auto mx-auto"
          />
        </div>
        {user ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 overflow-hidden"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
          >
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-8 w-8 object-cover" />
            ) : (
              <User className="h-4 w-4 text-gray-500" />
            )}
            <span className="sr-only">Open user menu</span>
          </button>
        ) : (
          <Link href={ROUTES.SIGN_IN}>
            <Button className="text-sm py-1 px-3">Sign In</Button>
          </Link>
        )}

        {showUserDropdown && user && (
          <div className="absolute right-4 top-12 z-10 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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

      {/* Mobile menu, show/hide based on mobile menu state */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-gray-900/80" aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 flex w-full max-w-xs flex-col overflow-y-auto bg-white py-4 pb-12">
            <div className="flex items-center justify-between px-6">
              <img
                alt="TrustPlace"
                src="/logo.svg"
                className="h-8 w-auto"
              />
              <button
                type="button"
                className="-m-2.5 p-2.5 text-gray-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <X className="size-6" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 px-4">
              {/* Mobile search */}
              <form onSubmit={handleSearch} className="relative mb-6">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  name="search"
                  id="mobile-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-md border-0 bg-gray-50 py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                  placeholder="Paste Airbnb or Booking.com URL"
                  disabled={isLoading}
                />
              </form>

              <ul className="space-y-2">
                {navigationItems.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                        pathname === item.href
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
                {!user && (
                  <li>
                    <Link
                      href={ROUTES.SIGN_UP}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign Up
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
} 