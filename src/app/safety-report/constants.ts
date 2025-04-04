export const LOCATION_RADIUS = 0.2 // ~11km - Used for finding similar accommodations
export const SAFETY_RADIUS = 0.01 // ~1.1km - Used for finding safety metrics near a location
export const EARTH_RADIUS = 6371 // km
export const OPINION_PROXIMITY_RADIUS = 0.005 // Approx 500m in degrees (adjust as needed)

export const IMAGE_CONFIG = {
  QUALITY: 75,
  SIZES: '(max-width: 768px) 100vw, 50vw'
} as const

export const COORDINATE_LIMITS = {
  MAX_LATITUDE: 90,
  MAX_LONGITUDE: 180
} as const 