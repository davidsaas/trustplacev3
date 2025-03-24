export const LOCATION_RADIUS = 0.15 // ~16.5km - Reasonable distance for finding similar accommodations
export const SAFETY_RADIUS = 0.05 // ~5.5km - Used for finding safety metrics near a location
export const EARTH_RADIUS = 6371 // km
export const PRICE_RANGE = {
  MIN: 0.6, // -40%
  MAX: 1.5  // +50%
} as const

export const IMAGE_CONFIG = {
  QUALITY: 75,
  SIZES: '(max-width: 768px) 100vw, 50vw'
} as const

export const COORDINATE_LIMITS = {
  MAX_LATITUDE: 90,
  MAX_LONGITUDE: 180
} as const 