'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type VisitedAccommodation = {
  id: string // This is a unique ID for the visit
  accommodation_id: string // Reference to the accommodation
  name: string
  source: string
  visitedAt: string
  url?: string
}

const MAX_VISITED_ITEMS = 10
const STORAGE_KEY = 'accommodations-visited'

export const useAccommodationsVisited = (accommodationId?: string, accommodationName?: string, source?: string) => {
  const [visited, setVisited] = useState<VisitedAccommodation[]>([])
  const pathname = usePathname()

  // Load visited accommodations on first render
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        // Handle potential legacy format where accommodation_id might not exist
        const parsedData = JSON.parse(stored);
        const migratedData = parsedData.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          accommodation_id: item.accommodation_id || item.id, // Use accommodation_id if available, fallback to id
          name: item.name,
          source: item.source,
          visitedAt: item.visitedAt,
          url: item.url
        }));
        setVisited(migratedData);
      }
    } catch (error) {
      console.error('Error loading visited accommodations:', error)
    }
  }, [])

  // Track current accommodation visit
  useEffect(() => {
    if (!accommodationId || !accommodationName || !source) return

    const newVisit: VisitedAccommodation = {
      id: crypto.randomUUID(), // Generate a unique ID for this visit
      accommodation_id: accommodationId,
      name: accommodationName,
      source,
      visitedAt: new Date().toISOString(),
      url: pathname
    }

    setVisited(prevVisited => {
      // Remove any existing entry for this accommodation
      const filtered = prevVisited.filter(item => item.accommodation_id !== accommodationId)
      
      // Add the new visit at the beginning
      const updated = [newVisit, ...filtered].slice(0, MAX_VISITED_ITEMS)
      
      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch (error) {
        console.error('Error saving visited accommodations:', error)
      }
      
      return updated
    })
  }, [accommodationId, accommodationName, pathname, source])

  return { visited }
} 