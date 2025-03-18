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
  OAUTH_CALLBACK: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
} as const 