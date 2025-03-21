export const LOCATION_RADIUS = 0.05 // ~5.5km
export const EARTH_RADIUS = 6371 // km
export const PRICE_RANGE = {
  MIN: 0.7, // -30%
  MAX: 1.3  // +30%
} as const

export const IMAGE_CONFIG = {
  QUALITY: 75,
  SIZES: '(max-width: 768px) 100vw, 50vw'
} as const

export const COORDINATE_LIMITS = {
  MAX_LATITUDE: 90,
  MAX_LONGITUDE: 180
} as const 