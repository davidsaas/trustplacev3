export interface SafetyReportProps {
  params: { id: string }
}

export interface SafetyMetric {
  id: string
  latitude: number
  longitude: number
  metric_type: string
  score: number
  question: string
  description: string
  created_at: string
  expires_at: string
  total_population: number | null
  housing_units: number | null
  median_age: number | null
  incidents_per_1000: number | null
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
  rating: number | null
  total_reviews: number | null
  source: string
}

export interface AccommodationData {
  id: string
  url: string
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
} 