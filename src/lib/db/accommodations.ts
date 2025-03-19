import { createClient } from '@/lib/supabase/client'
import { supabaseServer } from '@/lib/supabase/server'
import type { AccommodationSource } from '@/lib/utils/url'

export type Accommodation = {
  id: string
  source: AccommodationSource
  external_id: string
  url: string
  name: string
  image_url: string
  price: number
  location: {
    lat: number
    lng: number
  }
  safety_score: number
  last_updated: string
  created_at: string
}

export const findAccommodationBySourceAndExternalId = async (
  source: AccommodationSource,
  externalId: string,
  useServer = false
): Promise<Accommodation | null> => {
  const supabase = useServer ? supabaseServer : createClient()

  const { data, error } = await supabase
    .from('accommodations')
    .select('*')
    .eq('source', source)
    .eq('external_id', externalId)
    .single()

  if (error || !data) {
    console.error('Error fetching accommodation:', error)
    return null
  }

  return data as Accommodation
} 