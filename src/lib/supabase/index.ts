import { createBrowserClient } from '@supabase/ssr'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accommodations: {
        Row: {
          id: string
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
        Insert: {
          id?: string
          url: string
          name: string
          image_url: string
          price: number
          location: {
            lat: number
            lng: number
          }
          safety_score?: number
          last_updated?: string
          created_at?: string
        }
        Update: {
          id?: string
          url?: string
          name?: string
          image_url?: string
          price?: number
          location?: {
            lat: number
            lng: number
          }
          safety_score?: number
          last_updated?: string
          created_at?: string
        }
      }
      safety_metrics: {
        Row: {
          id: string
          accommodation_id: string
          nighttime_safety: number
          car_parking_safety: number
          kids_safety: number
          transportation_safety: number
          womens_safety: number
          created_at: string
        }
        Insert: {
          id?: string
          accommodation_id: string
          nighttime_safety: number
          car_parking_safety: number
          kids_safety: number
          transportation_safety: number
          womens_safety: number
          created_at?: string
        }
        Update: {
          id?: string
          accommodation_id?: string
          nighttime_safety?: number
          car_parking_safety?: number
          kids_safety?: number
          transportation_safety?: number
          womens_safety?: number
          created_at?: string
        }
      }
      community_opinions: {
        Row: {
          id: string
          accommodation_id: string
          source: 'reddit' | 'youtube'
          content: string
          sentiment: 'positive' | 'negative' | 'neutral'
          created_at: string
        }
        Insert: {
          id?: string
          accommodation_id: string
          source: 'reddit' | 'youtube'
          content: string
          sentiment: 'positive' | 'negative' | 'neutral'
          created_at?: string
        }
        Update: {
          id?: string
          accommodation_id?: string
          source?: 'reddit' | 'youtube'
          content?: string
          sentiment?: 'positive' | 'negative' | 'neutral'
          created_at?: string
        }
      }
    }
  }
}

export const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
} 