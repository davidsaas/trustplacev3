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
          city_id: string
          block_group_id: string
          latitude: number
          longitude: number
          geom: string
          metric_type: string
          score: number
          question: string
          description: string
          direct_incidents: number
          weighted_incidents: number
          population_density: number
          incidents_per_1000: number
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          city_id: string
          block_group_id: string
          latitude: number
          longitude: number
          geom?: string
          metric_type: string
          score: number
          question: string
          description: string
          direct_incidents: number
          weighted_incidents: number
          population_density: number
          incidents_per_1000: number
          created_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          city_id?: string
          block_group_id?: string
          latitude?: number
          longitude?: number
          geom?: string
          metric_type?: string
          score?: number
          question?: string
          description?: string
          direct_incidents?: number
          weighted_incidents?: number
          population_density?: number
          incidents_per_1000?: number
          created_at?: string
          expires_at?: string
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