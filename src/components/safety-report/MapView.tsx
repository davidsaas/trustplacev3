 'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Card } from '@/components/ui/card'

// Los Angeles coordinates
const LA_LOCATION = {
  lng: -118.2437,
  lat: 34.0522
}

export const MapView = () => {
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize the map
    const map = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [LA_LOCATION.lng, LA_LOCATION.lat],
      zoom: 12,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    })

    // Add marker
    new mapboxgl.Marker()
      .setLngLat([LA_LOCATION.lng, LA_LOCATION.lat])
      .addTo(map)

    return () => map.remove()
  }, [])

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Location</h2>
      <div 
        ref={mapContainer} 
        className="h-[400px] w-full rounded-lg"
      />
    </Card>
  )
}