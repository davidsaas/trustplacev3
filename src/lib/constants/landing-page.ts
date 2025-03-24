export const HERO_SECTION = {
  title: "Find Safe Places to Stay",
  description: "Get detailed safety reports for any Airbnb or Booking.com listing in Los Angeles. Make informed decisions with real data.",
  keywords: ["Safe", "Secure", "Trusted", "Verified"],
  backgroundImage: "/images/hero-background.jpg"
}

export const PARTNER_LOGOS = [
  {
    id: 1,
    name: "Airbnb",
    logo: "/images/partners/airbnb.svg",
    url: "https://airbnb.com"
  },
  {
    id: 2,
    name: "Booking.com",
    logo: "/images/partners/booking.svg",
    url: "https://booking.com"
  },
  {
    id: 3,
    name: "TripAdvisor",
    logo: "/images/partners/tripadvisor.svg",
    url: "https://tripadvisor.com"
  }
]

export const TESTIMONIALS = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Solo Traveler",
    content: "Trustplace helped me find a safe neighborhood for my first LA trip. The safety metrics were spot on!",
    avatar: "/images/testimonials/sarah.jpg"
  },
  {
    id: 2,
    name: "Michael Chen",
    role: "Family Traveler",
    content: "As a father of two, safety is my top priority. This tool gave me peace of mind for our family vacation.",
    avatar: "/images/testimonials/michael.jpg"
  },
  {
    id: 3,
    name: "Emma Davis",
    role: "Business Traveler",
    content: "The detailed safety reports helped me choose accommodations in the perfect location for my business trips.",
    avatar: "/images/testimonials/emma.jpg"
  }
]

export const FEATURES = [
  {
    id: 1,
    title: "Real Crime Data",
    description: "Access up-to-date crime statistics from official LA sources.",
    icon: "chart"
  },
  {
    id: 2,
    title: "Community Insights",
    description: "Get real opinions from locals and previous visitors.",
    icon: "users"
  },
  {
    id: 3,
    title: "Safety Metrics",
    description: "View detailed safety scores for different aspects of the location.",
    icon: "shield"
  },
  {
    id: 4,
    title: "AI Analysis",
    description: "Benefit from AI-powered insights and recommendations.",
    icon: "brain"
  }
]

export const NAVIGATION = {
  main: [
    {
      label: 'Home',
      href: '/',
    },
    {
      label: 'Safety Reports',
      href: '/safety-reports',
    },
    {
      label: 'How It Works',
      href: '/how-it-works',
    },
    {
      label: 'About',
      href: '/about',
    },
  ],
  auth: [
    {
      id: 'sign-in',
      label: 'Sign In',
      href: '/auth/sign-in',
      variant: 'outline',
    },
    {
      id: 'sign-up',
      label: 'Sign Up',
      href: '/auth/sign-up',
      variant: 'default',
    },
  ],
  user: [
    {
      label: 'Saved Accommodations',
      href: '/accommodations/saved',
      icon: 'heart',
    },
    {
      label: 'Recently Visited',
      href: '/accommodations/visited',
      icon: 'history',
    },
    {
      label: 'Profile',
      href: '/profile',
      icon: 'user',
    },
  ],
} as const 