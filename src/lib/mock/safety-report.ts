export const MOCK_SAFETY_METRICS = {
  overallScore: 85,
  metrics: {
    nightSafety: {
      score: 82,
      label: "Nighttime Safety",
      description: "The area is generally safe at night with well-lit streets and regular police patrols."
    },
    carSafety: {
      score: 90,
      label: "Car Parking Safety",
      description: "Secure parking available with low vehicle-related crime rates."
    },
    kidsSafety: {
      score: 88,
      label: "Kids Safety",
      description: "Family-friendly neighborhood with nearby schools and parks."
    },
    transportSafety: {
      score: 85,
      label: "Transportation Safety",
      description: "Good public transport options with safe waiting areas."
    },
    womenSafety: {
      score: 80,
      label: "Women's Safety",
      description: "Well-populated area with active community watch programs."
    }
  }
}

export const MOCK_COMMUNITY_OPINIONS = [
  {
    id: '1',
    source: 'reddit',
    content: "I've lived in this area for 5 years and it's very safe. Great for families!",
    sentiment: 'positive',
    date: '2024-02-15'
  },
  {
    id: '2',
    source: 'local',
    content: "The neighborhood has improved a lot. Just be careful late at night as some streets are not well lit.",
    sentiment: 'neutral',
    date: '2024-03-01'
  },
  {
    id: '3',
    source: 'reddit',
    content: "Perfect location! Close to everything and very safe during day and night.",
    sentiment: 'positive',
    date: '2024-03-10'
  }
] as const

export const MOCK_LOCATION = {
  lat: 34.0522,
  lng: -118.2437,
  address: "123 Downtown Street, Los Angeles, CA 90012",
  neighborhood: "Downtown LA"
} as const 