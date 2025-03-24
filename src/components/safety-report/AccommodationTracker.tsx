'use client'

import { useEffect } from 'react'
import { useAccommodationsVisited } from '@/hooks/use-accommodations-visited'

interface AccommodationTrackerProps {
  accommodationId: string
  accommodationName: string
  source: string
}

export const AccommodationTracker = ({ 
  accommodationId,
  accommodationName,
  source
}: AccommodationTrackerProps) => {
  // This is just a tracker component, it doesn't render anything visible
  // It just uses the hook to track the visited accommodation
  useAccommodationsVisited(accommodationId, accommodationName, source)
  
  return null
} 