'use client'

import { Card } from '@/components/ui/card'

type MapViewProps = {
  location: {
    lat: number
    lng: number
  }
}

export const MapView = ({ location }: MapViewProps) => {
  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Location</h2>
      <div className="h-[400px] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Map view coming soon - Location: {location.lat}, {location.lng}</p>
      </div>
    </Card>
  )
}