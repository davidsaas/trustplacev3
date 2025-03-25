'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Heart, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAccommodationsSaved } from '@/hooks/use-accommodations-saved'
import { formatDistanceToNow } from 'date-fns'
import { useSupabase } from '@/components/shared/providers/auth-provider'

export default function SavedAccommodationsPage() {
  const { user } = useSupabase()
  const { saved, loading } = useAccommodationsSaved()
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Redirect to sign in if not logged in
  useEffect(() => {
    if (!user && !loading) {
      setIsRedirecting(true)
      window.location.href = '/auth/sign-in?next=/accommodations/saved'
    }
  }, [user, loading])

  if (loading || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 mb-4" />
          <h1 className="text-xl font-medium text-gray-800">
            {isRedirecting ? 'Redirecting to sign in...' : 'Loading your saved accommodations...'}
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center mb-1">
            <Link 
              href="/" 
              className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition-colors mr-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span>Back to Home</span>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Saved Accommodations</h1>
          </div>
          <div className="text-sm text-gray-500">
            Places you've saved for future reference
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {saved.length === 0 ? (
          <Card className="p-8 text-center">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No saved accommodations yet</h2>
            <p className="text-gray-500 mb-4">
              When you save an accommodation, it will appear here for easy access.
            </p>
            <Link href="/safety-reports">
              <Button>Browse Safety Reports</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {saved.map((accommodation) => (
              <Link 
                key={accommodation.id} 
                href={accommodation.url || `/safety-report/${accommodation.id}`}
              >
                <Card className="h-full overflow-hidden hover:shadow-md transition-shadow duration-200">
                  <div className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-50 text-red-500 rounded-full">
                        <Heart className="w-5 h-5 fill-red-500" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 mb-1">{accommodation.name}</h3>
                        <div className="text-sm text-gray-500 space-y-1">
                          <p>
                            {accommodation.source === 'airbnb' ? 'Airbnb' : 
                             accommodation.source === 'booking' ? 'Booking.com' : 
                             accommodation.source === 'vrbo' ? 'VRBO' : accommodation.source}
                          </p>
                          <p>Saved {formatDistanceToNow(new Date(accommodation.savedAt), { addSuffix: true })}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
} 