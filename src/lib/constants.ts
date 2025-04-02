import { ShieldCheck, Moon, Car, Baby, Train, PersonStanding } from 'lucide-react'

export const ROUTES = {
  HOME: '/',
  REPORT: '/report',
  SIGN_IN: '/auth/sign-in',
  SIGN_UP: '/auth/sign-up',
  VERIFY: '/auth/verify',
  AUTH_CALLBACK: '/auth/callback',
} as const

export const AUTH_REDIRECT_URLS = {
  AFTER_SIGN_IN: ROUTES.HOME,
  AFTER_SIGN_UP: ROUTES.VERIFY,
  AFTER_SIGN_OUT: ROUTES.HOME,
  OAUTH_CALLBACK: '/auth/callback',
} as const

export const SAFETY_METRIC_DETAILS: Record<string, { label: string; shortLabel?: string; Icon: React.ElementType }> = {
  night_safety: {
    label: 'Nighttime Safety',
    shortLabel: 'Night',
    Icon: Moon
  },
  parking_safety: {
    label: 'Car Parking Security',
    shortLabel: 'Parking',
    Icon: Car
  },
  kids_safety: {
    label: 'Child Safety',
    shortLabel: 'Kids',
    Icon: Baby
  },
  transport_safety: {
    label: 'Transportation Safety',
    shortLabel: 'Transport',
    Icon: Train
  },
  women_safety: {
    label: "Women's Safety",
    shortLabel: 'Women',
    Icon: PersonStanding
  },
  default: {
      label: 'Safety',
      Icon: ShieldCheck
  }
}; 