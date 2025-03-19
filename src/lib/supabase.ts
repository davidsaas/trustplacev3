import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
          source: 'airbnb' | 'booking'
          external_id: string
          url: string
          name: string
          image_url?: string
          image?: string
          price: number
          price_per_night?: number
          latitude?: string
          longitude?: string
          location?: {
            lat: number
            lng: number
          }
          rating?: number
          total_reviews?: number
          property_type?: string
          type?: string
          neighborhood?: string
          address?: {
            full: string
          }
          safety_score: number
          last_updated: string
          created_at: string
        }
        Insert: {
          id?: string
          source: 'airbnb' | 'booking'
          external_id: string
          url: string
          name: string
          image_url?: string
          image?: string
          price: number
          price_per_night?: number
          latitude?: string
          longitude?: string
          location?: {
            lat: number
            lng: number
          }
          rating?: number
          total_reviews?: number
          property_type?: string
          type?: string
          neighborhood?: string
          address?: {
            full: string
          }
          safety_score?: number
          last_updated?: string
          created_at?: string
        }
        Update: {
          id?: string
          source?: 'airbnb' | 'booking'
          external_id?: string
          url?: string
          name?: string
          image_url?: string
          image?: string
          price?: number
          price_per_night?: number
          latitude?: string
          longitude?: string
          location?: {
            lat: number
            lng: number
          }
          rating?: number
          total_reviews?: number
          property_type?: string
          type?: string
          neighborhood?: string
          address?: {
            full: string
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