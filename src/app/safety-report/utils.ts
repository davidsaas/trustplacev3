import { EARTH_RADIUS, COORDINATE_LIMITS } from './constants'
import type { Location } from './types'
import { ShieldCheck, AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

interface RiskLevel {
  label: string
  color: string
  bgColor: string
  textColor: string
  lightBg: string
  border: string
  fill: string
  icon: LucideIcon
  description: string
}

export const getRiskLevel = (score: number): RiskLevel => {
  if (score >= 8) return { 
    label: 'Low Risk', 
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700', 
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-100',
    fill: '#10b981', // emerald-500 equivalent
    icon: ShieldCheck,
    description: 'Generally very safe area'
  }
  if (score >= 6) return { 
    label: 'Medium Risk', 
    color: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700', 
    lightBg: 'bg-amber-50',
    border: 'border-amber-100',
    fill: '#f59e0b', // amber-500 equivalent
    icon: AlertCircle,
    description: 'Exercise normal caution'
  }
  if (score >= 4) return { 
    label: 'High Risk', 
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700', 
    lightBg: 'bg-orange-50',
    border: 'border-orange-100',
    fill: '#f97316', // orange-500 equivalent
    icon: AlertTriangle,
    description: 'Exercise increased caution'
  }
  return { 
    label: 'Maximum Risk', 
    color: 'bg-rose-500',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700', 
    lightBg: 'bg-rose-50',
    border: 'border-rose-100',
    fill: '#f43f5e', // rose-500 equivalent
    icon: ShieldAlert,
    description: 'Extreme caution advised'
  }
}

export const getValidImageUrl = (url: string | null): boolean => {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
} 