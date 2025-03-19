'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Card } from '@/components/ui/card'

// Initialize Mapbox access token
const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

// Custom marker element
const createCustomMarker = () => {
  const el = document.createElement('div')
  el.className = 'custom-marker'
  el.innerHTML = `
    <div class="marker-inner">
      <div class="marker-pulse"></div>
    </div>
  `
  return el
}

// Validate coordinates
const isValidCoordinate = (coord: number) => {
  return typeof coord === 'number' && !isNaN(coord) && coord !== 0
}

type MapViewProps = {
  location: {
    lat: number
    lng: number
  }
}

export const MapView = ({ location }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const marker = useRef<mapboxgl.Marker | null>(null)

  // Validate coordinates
  const isValidLocation = isValidCoordinate(location.lat) && isValidCoordinate(location.lng)

  useEffect(() => {
    // Early returns for invalid conditions
    if (!token || !isValidLocation || !mapContainer.current || map.current) {
      return
    }

    try {
      // Set access token
      mapboxgl.accessToken = token

      // Initialize map with custom style
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12', // Using a light, minimal style
        center: [location.lng, location.lat],
        zoom: 12,
        antialias: true
      })

      // Add minimal navigation controls
      map.current.addControl(
        new mapboxgl.NavigationControl({
          showCompass: false,
          visualizePitch: false
        }),
        'top-right'
      )

      // Add custom marker
      marker.current = new mapboxgl.Marker({
        element: createCustomMarker(),
        anchor: 'bottom'
      })
        .setLngLat([location.lng, location.lat])
        .addTo(map.current)

      // Cleanup function
      return () => {
        if (marker.current) marker.current.remove()
        if (map.current) map.current.remove()
        map.current = null
        marker.current = null
      }
    } catch (err) {
      console.error('Map initialization error:', err)
      return
    }
  }, [location.lat, location.lng, isValidLocation])

  // Update marker and center when location changes
  useEffect(() => {
    if (!map.current || !marker.current || !isValidLocation) return

    marker.current.setLngLat([location.lng, location.lat])
    map.current.flyTo({
      center: [location.lng, location.lat],
      essential: true,
      duration: 1000,
      zoom: 11
    })
  }, [location.lat, location.lng, isValidLocation])

  if (!token) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Location</h2>
        <div className="h-[400px] rounded-lg bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Map configuration error: Missing API token</p>
        </div>
      </Card>
    )
  }

  if (!isValidLocation) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Location</h2>
        <div className="h-[400px] rounded-lg bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Invalid location coordinates</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Location</h2>
      <div className="h-[400px] rounded-lg overflow-hidden shadow-lg">
        <style jsx global>{`
          .custom-marker {
            width: 34px;
            height: 34px;
            cursor: pointer;
          }
          
          .marker-inner {
            width: 24px;
            height: 24px;
            position: relative;
          }
          
          .marker-inner::after {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            background-color: #007AFF;
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 10px rgba(0, 122, 255, 0.5);
          }
          
          .marker-pulse {
            position: absolute;
            width: 24px;
            height: 24px;
            background-color: rgba(0, 122, 255, 0.2);
            border-radius: 50%;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation: pulse 2s infinite;
          }
          
          @keyframes pulse {
            0% {
              transform: translate(-50%, -50%) scale(0.5);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(2);
              opacity: 0;
            }
          }

          .mapboxgl-ctrl-group {
            border: none !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
            border-radius: 8px !important;
            overflow: hidden;
          }

          .mapboxgl-ctrl-group button {
            width: 36px !important;
            height: 36px !important;
            background-color: rgba(255, 255, 255, 0.9) !important;
            backdrop-filter: blur(10px);
          }

          .mapboxgl-ctrl-group button:hover {
            background-color: rgba(255, 255, 255, 1) !important;
          }

          .mapboxgl-canvas {
            border-radius: 0.5rem;
          }
        `}</style>
        <div
          ref={mapContainer}
          className="w-full h-full"
          style={{ position: 'relative' }}
          aria-label={`Map showing location at latitude ${location.lat} and longitude ${location.lng}`}
        />
      </div>
    </Card>
  )
}