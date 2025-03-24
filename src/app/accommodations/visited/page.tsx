'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAccommodationsVisited } from '@/hooks/use-accommodations-visited'
import { formatDistanceToNow } from 'date-fns'

export default function VisitedAccommodationsPage() {
  const { visited } = useAccommodationsVisited()
  const [isLoading, setIsLoading] = useState(true)
  
  // Simulate loading state just for better UX
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 mb-4" />
          <h1 className="text-xl font-medium text-gray-800">
            Loading your recently visited accommodations...
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
            <h1 className="text-2xl font-bold text-gray-900">Recently Visited</h1>
          </div>
          <div className="text-sm text-gray-500">
            Accommodations you've viewed recently
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {visited.length === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No visited accommodations yet</h2>
            <p className="text-gray-600 mb-6">
              When you view accommodation safety reports, they will appear here for easy access.
            </p>
            <Button asChild>
              <Link href="/safety-reports">Browse Safety Reports</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visited.map((accommodation) => (
              <Link 
                key={`${accommodation.id}-${accommodation.visitedAt}`} 
                href={accommodation.url || `/safety-report/${accommodation.id}`}
              >
                <Card className="h-full overflow-hidden hover:shadow-md transition-shadow duration-200">
                  <div className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-50 text-blue-500 rounded-full">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 mb-1">{accommodation.name}</h3>
                        <div className="text-sm text-gray-500 space-y-1">
                          <p>
                            {accommodation.source === 'airbnb' ? 'Airbnb' : 
                             accommodation.source === 'booking' ? 'Booking.com' : 
                             accommodation.source === 'vrbo' ? 'VRBO' : accommodation.source}
                          </p>
                          <p>Visited {formatDistanceToNow(new Date(accommodation.visitedAt), { addSuffix: true })}</p>
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