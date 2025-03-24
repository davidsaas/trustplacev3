'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSupabase } from '@/components/providers/supabase-provider'
import { createClient } from '@/lib/supabase/client'

type SavedAccommodation = {
  id: string // This is the internal id from the saved_accommodations table
  accommodation_id: string // This is the reference to the accommodation table
  name: string
  source: string
  savedAt: string
  url?: string
}

const STORAGE_KEY = 'accommodations-saved-temp'

export const useAccommodationsSaved = () => {
  const [saved, setSaved] = useState<SavedAccommodation[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useSupabase()
  const router = useRouter()
  const pathname = usePathname()

  // Load saved accommodations from database or localStorage
  useEffect(() => {
    const fetchSavedAccommodations = async () => {
      setLoading(true)
      try {
        if (user) {
          // If logged in, fetch from Supabase
          const supabase = createClient()
          const { data, error } = await supabase
            .from('saved_accommodations')
            .select('*')
            .order('saved_at', { ascending: false })
          
          if (error) throw error
          
          setSaved(data.map(item => ({
            id: item.id,
            accommodation_id: item.accommodation_id,
            name: item.name,
            source: item.source,
            savedAt: item.saved_at,
            url: item.url
          })))
          
          // Clear any temporary saved accommodations
          localStorage.removeItem(STORAGE_KEY)
        } else {
          // If not logged in, get from localStorage
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            setSaved(JSON.parse(stored))
          }
        }
      } catch (error) {
        console.error('Error loading saved accommodations:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSavedAccommodations()
  }, [user])

  const handleSaveAccommodation = useCallback(async (
    accommodationId: string,
    accommodationName: string,
    source: string
  ) => {
    try {
      setLoading(true)
      
      // If user is not logged in, redirect to sign in page
      if (!user) {
        // Store the current accommodation temporarily
        const tempSaved = {
          id: crypto.randomUUID(),
          accommodation_id: accommodationId,
          name: accommodationName,
          source,
          savedAt: new Date().toISOString(),
          url: pathname
        }
        
        const stored = localStorage.getItem(STORAGE_KEY)
        const existingItems = stored ? JSON.parse(stored) : []
        const updatedItems = [tempSaved, ...existingItems.filter((item: SavedAccommodation) => item.accommodation_id !== accommodationId)]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems))
        
        // Redirect to sign in page with return URL
        router.push(`/auth/sign-in?next=${pathname}`)
        return { success: false, error: 'Please sign in to save accommodations' }
      }
      
      // If logged in, save to Supabase
      const supabase = createClient()
      
      // Check if already saved
      const { data: existing } = await supabase
        .from('saved_accommodations')
        .select('*')
        .eq('user_id', user.id)
        .eq('accommodation_id', accommodationId)
        .maybeSingle()
      
      if (existing) {
        // Already saved, so delete (toggle functionality)
        const { error } = await supabase
          .from('saved_accommodations')
          .delete()
          .eq('user_id', user.id)
          .eq('accommodation_id', accommodationId)
        
        if (error) throw error
        
        // Update local state
        setSaved(prev => prev.filter(item => item.accommodation_id !== accommodationId))
        return { success: true, saved: false }
      } else {
        // Not saved yet, so save it
        const newSaved = {
          user_id: user.id,
          accommodation_id: accommodationId,
          name: accommodationName,
          source,
          saved_at: new Date().toISOString(),
          url: pathname
        }
        
        const { data, error } = await supabase
          .from('saved_accommodations')
          .insert(newSaved)
          .select()
        
        if (error) throw error
        
        // Update local state with the actual database record
        const savedRecord = data?.[0]
        if (savedRecord) {
          setSaved(prev => [
            {
              id: savedRecord.id,
              accommodation_id: savedRecord.accommodation_id,
              name: savedRecord.name,
              source: savedRecord.source,
              savedAt: savedRecord.saved_at,
              url: savedRecord.url
            },
            ...prev
          ])
        }
        
        return { success: true, saved: true }
      }
    } catch (error) {
      console.error('Error saving accommodation:', error)
      return { success: false, error: 'Failed to save accommodation' }
    } finally {
      setLoading(false)
    }
  }, [user, pathname, router])

  const isAccommodationSaved = useCallback((accommodationId: string) => {
    return saved.some(item => item.accommodation_id === accommodationId)
  }, [saved])

  return {
    saved,
    loading,
    saveAccommodation: handleSaveAccommodation,
    isAccommodationSaved
  }
} 