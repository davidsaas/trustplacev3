'use client'

import { useCallback, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSupabase } from '@/components/shared/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'

type SavedAccommodation = {
  id: string // Saved accommodation record ID
  accommodation_id: string // Actual accommodation ID
  name: string
  source: string
  savedAt: string
  url: string
  imageUrl?: string
}

export const useAccommodationsSaved = () => {
  const [saved, setSaved] = useState<SavedAccommodation[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useSupabase()
  const router = useRouter()
  const pathname = usePathname()

  const fetchSavedAccommodations = useCallback(async () => {
    if (loading || !user) return;

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: savedData, error: savedError } = await supabase
        .from('saved_accommodations')
        .select('id, accommodation_id, name, source, saved_at, url')
        .eq('user_id', user.id)
        .order('saved_at', { ascending: false })

      if (savedError) throw savedError
      if (!savedData || savedData.length === 0) {
        setSaved([])
        setLoading(false);
        return;
      }

      const accommodationIds = savedData.map(item => item.accommodation_id)

      const { data: detailsData, error: detailsError } = await supabase
        .from('accommodations')
        .select('id, image_url')
        .in('id', accommodationIds)

      if (detailsError) {
        console.warn('Could not fetch accommodation details (images):', detailsError)
      }

      const detailsMap = new Map(
        detailsData?.map(item => [item.id, { imageUrl: item.image_url }]) || []
      )

      const combinedData = savedData.map(item => ({
        id: item.id,
        accommodation_id: item.accommodation_id,
        name: item.name,
        source: item.source,
        savedAt: item.saved_at,
        url: item.url,
        imageUrl: detailsMap.get(item.accommodation_id)?.imageUrl,
      }))

      console.log("Combined Data with Images:", combinedData);
      setSaved(combinedData)

    } catch (error) {
      console.error('Error loading saved accommodations:', error)
      setSaved([])
    } finally {
      setLoading(false)
    }
  }, [user, loading])

  const handleSaveAccommodation = useCallback(async (
    accommodationId: string,
    accommodationName: string,
    source: string
  ) => {
    try {
      setLoading(true)
      
      if (!user) {
        router.push(`/auth/sign-in?next=${pathname}`)
        return { success: false, error: 'Please sign in to save accommodations' }
      }
      
      const supabase = createClient()
      const { data: existing } = await supabase
        .from('saved_accommodations')
        .select('id')
        .eq('user_id', user.id)
        .eq('accommodation_id', accommodationId)
        .maybeSingle()
      
      if (existing) {
        const { error } = await supabase
          .from('saved_accommodations')
          .delete()
          .eq('id', existing.id)
        
        if (error) throw error
        
        setSaved(prev => prev.filter(item => item.accommodation_id !== accommodationId))
        return { success: true, saved: false }
      } else {
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
          .select('id, accommodation_id, name, source, saved_at, url')
          .single()
        
        if (error) throw error
        
        if (data) {
          setSaved(prev => [
            {
              id: data.id,
              accommodation_id: data.accommodation_id,
              name: data.name,
              source: data.source,
              savedAt: data.saved_at,
              url: data.url,
            },
            ...prev
          ].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()))
        }
        return { success: true, saved: true }
      }
    } catch (error) {
      console.error('Error saving accommodation:', error)
      return { success: false, error: 'Failed to save accommodation' }
    } finally {
      setLoading(false)
    }
  }, [user, pathname, router, fetchSavedAccommodations])

  const isAccommodationSaved = useCallback((accommodationId: string) => {
    return saved.some(item => item.accommodation_id === accommodationId)
  }, [saved])

  return {
    saved,
    loading,
    fetchSavedAccommodations,
    saveAccommodation: handleSaveAccommodation,
    isAccommodationSaved
  }
} 