'use client'

import Link from 'next/link'
import { memo } from 'react'
import { Clock, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useAccommodationsVisited } from '@/hooks/use-accommodations-visited'
import { formatDistanceToNow } from 'date-fns'

interface VisitedAccommodationsProps {
  currentAccommodationId: string
}

export const VisitedAccommodations = memo(({ 
  currentAccommodationId 
}: VisitedAccommodationsProps) => {
  const { visited } = useAccommodationsVisited()
  
  // Filter out the current accommodation and limit to the most recent 5
  const recentlyVisited = visited
    .filter(item => item.accommodation_id !== currentAccommodationId)
    .slice(0, 5)
  
  if (recentlyVisited.length === 0) {
    return null
  }

  return (
    <Card className="p-6 rounded-xl shadow-md mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Recently Visited</h2>
      </div>
      
      <div className="space-y-3">
        {recentlyVisited.map((accommodation) => (
          <Link 
            key={accommodation.id} 
            href={accommodation.url || `/safety-report/${accommodation.accommodation_id}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            aria-label={`View safety report for ${accommodation.name}`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 rounded-full text-blue-500 group-hover:bg-blue-100 transition-colors">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{accommodation.name}</h3>
                <p className="text-xs text-gray-500">
                  {accommodation.source === 'airbnb' ? 'Airbnb' : 
                   accommodation.source === 'booking' ? 'Booking.com' : 
                   accommodation.source === 'vrbo' ? 'VRBO' : accommodation.source} · Visited {formatDistanceToNow(new Date(accommodation.visitedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </Link>
        ))}
      </div>
    </Card>
  )
})

VisitedAccommodations.displayName = 'VisitedAccommodations' 