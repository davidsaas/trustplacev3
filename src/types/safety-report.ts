export interface SafetyReportProps {
  params: { id: string }
}

export interface SafetyMetric {
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

export interface SafetyMetricWithDistance extends SafetyMetric {
  distance: number
}

export interface SimilarAccommodation {
  id: string
  name: string
  price_per_night: number
  latitude: number
  longitude: number
  overall_score: number
  source: string
  hasCompleteData?: boolean
}

export interface Location {
  lat: number
  lng: number
}

export interface PropertyHeaderProps {
  name: string
  price_per_night: number | null
  rating: number | null
  total_reviews: number | null
  source: string
}

export interface PropertyMetricsProps {
  price_per_night: number | null
  source: string
}

export interface AccommodationTakeaway {
  id: string;
  accommodation_id: string;
  takeaways: string[] | null;
  generation_model?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccommodationData {
  id: string
  url?: string | null
  name: string
  image_url: string | null
  price_per_night: number | null
  rating: number | null
  total_reviews: number | null
  property_type: string | null
  neighborhood: string | null
  source: string
  location: Location | null
  safety_metrics: SafetyMetric[] | null
  overall_score: number
  similar_accommodations: SimilarAccommodation[]
  hasCompleteData: boolean
  accommodation_takeaways: string[] | null
} 