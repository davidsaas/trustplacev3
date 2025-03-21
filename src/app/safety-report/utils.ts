import { EARTH_RADIUS, COORDINATE_LIMITS } from './constants'
import type { Location } from './types'

export const isValidCoordinates = (lat: number, lng: number): boolean => {
  return !isNaN(lat) && 
         !isNaN(lng) && 
         lat !== 0 && 
         lng !== 0 && 
         Math.abs(lat) <= COORDINATE_LIMITS.MAX_LATITUDE && 
         Math.abs(lng) <= COORDINATE_LIMITS.MAX_LONGITUDE
}

export const calculateDistance = (point1: Location, point2: Location): number => {
  const dLat = (point2.lat - point1.lat) * Math.PI / 180
  const dLon = (point2.lng - point1.lng) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return EARTH_RADIUS * c // Distance in kilometers
}

export const formatPrice = (price: number | null): string => {
  if (!price) return 'Price not available'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price)
}

export const formatRating = (rating: number | null, source: string): string => {
  if (!rating) return ''
  return `${rating.toFixed(1)}${source === 'booking' ? '/10' : '/5'}`
}

export const formatReviewCount = (count: number | null): string => {
  if (!count) return ''
  return `(${count.toLocaleString()} reviews)`
}

export const getValidImageUrl = (url: string | null): string | null => {
  if (!url || !url.startsWith('http')) return null
  return url
} 