import { createClient } from '@/lib/supabase/client'
import { supabaseServer } from '@/lib/supabase/server'
import type { AccommodationSource } from '@/lib/utils/url'

// Type definition aligned with the actual 'accommodations' table schema
export type Accommodation = {
  id: string;
  source: AccommodationSource; // Assuming AccommodationSource aligns with the 'source' column type
  external_id: string;
  url: string | null; // Allow null based on schema possibility
  name: string | null; // Allow null based on schema possibility
  image_url: string | null; // Allow null based on schema possibility
  price_per_night: number | null; // Matches schema column name and type (numeric can be null)
  latitude: number | null; // Matches schema column name
  longitude: number | null; // Matches schema column name
  overall_safety_score: number | null; // Matches schema column name (integer can be null)
  updated_at: string; // Matches schema column name (timestamp with time zone -> string)
  created_at: string; // Matches schema column name
  // Add other relevant fields from schema if needed by the function's consumers
  description?: string | null;
  property_type?: string | null;
  room_type?: string | null; // Assuming 'USER-DEFINED' maps to string
  rating?: number | null;
  total_reviews?: number | null;
  city_id?: number | null; // bigint maps to number or string depending on size, number is common
  // location?: any; // The 'location' column is USER-DEFINED (likely PostGIS geometry), handle appropriately if needed
};

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