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

export const MOCK_SAFETY_REPORT = {
  id: 'mock-id-123',
  url: 'https://www.airbnb.com/rooms/123456',
  platform: 'airbnb',
  location: {
    lat: 34.0522,
    lng: -118.2437
  },
  safety_score: 8.5,
  nighttime_safety: 7.8,
  car_parking_safety: 8.2,
  kids_safety: 9.0,
  transportation_safety: 8.7,
  womens_safety: 8.4,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}

export const MOCK_COMMUNITY_OPINIONS = [
  {
    id: '1',
    user_id: 'user1',
    content: 'Very safe neighborhood, well lit streets at night.',
    created_at: '2024-03-10T10:00:00Z',
    user: {
      name: 'John Doe'
    }
  },
  {
    id: '2',
    user_id: 'user2',
    content: 'Close to public transportation and safe parking available.',
    created_at: '2024-03-09T15:30:00Z',
    user: {
      name: 'Jane Smith'
    }
  }
]

export const MOCK_LOCATION = {
  lat: 34.0522,
  lng: -118.2437,
  address: "123 Downtown Street, Los Angeles, CA 90012",
  neighborhood: "Downtown LA"
} as const 