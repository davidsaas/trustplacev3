'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Card } from '@/components/ui/card'

// Initialize Mapbox access token
const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

// Create a custom marker element with score
const createCustomMarker = (score: number, isCurrent: boolean = false) => {
  const el = document.createElement('div')
  el.className = 'custom-marker'
  el.innerHTML = `
    <div class="marker-inner ${isCurrent ? 'current' : ''}">
      <div class="marker-score">${score}</div>
      <div class="marker-pulse"></div>
    </div>
  `
  return el
}

// Validate coordinates
const isValidCoordinate = (coord: number) => {
  return typeof coord === 'number' && !isNaN(coord) && coord !== 0
}

interface Accommodation {
  id: string
  name: string
  overall_score: number
}

interface SimilarAccommodation extends Accommodation {
  latitude: number
  longitude: number
  price_per_night: number
  source: string
}

type MapViewProps = {
  location: {
    lat: number
    lng: number
  }
  currentAccommodation: Accommodation
  similarAccommodations: SimilarAccommodation[]
}

export const MapView = ({ location, currentAccommodation, similarAccommodations }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const router = useRouter()

  // Validate coordinates
  const isValidLocation = isValidCoordinate(location.lat) && isValidCoordinate(location.lng)

  // Function to handle marker click
  const handleMarkerClick = useCallback((accommodationId: string) => {
    router.push(`/safety-report/${accommodationId}`)
  }, [router])

  // Function to create popup content
  const createPopupContent = (accommodation: Accommodation | SimilarAccommodation) => {
    const isCurrentAccommodation = accommodation.id === currentAccommodation.id
    const isSimilar = !isCurrentAccommodation && 'price_per_night' in accommodation

    const content = document.createElement('div')
    content.className = 'p-2 min-w-[200px]'
    content.innerHTML = `
      <h3 class="font-semibold mb-1">${accommodation.name}</h3>
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm font-medium">Safety Score: ${accommodation.overall_score}</span>
        ${isSimilar ? `<span class="text-sm text-gray-500">$${(accommodation as SimilarAccommodation).price_per_night}/night</span>` : ''}
      </div>
      ${isCurrentAccommodation ? 
        '<span class="text-sm text-blue-600">Current Selection</span>' : 
        '<button class="text-sm text-blue-600 hover:underline cursor-pointer">View Details →</button>'
      }
    `

    if (!isCurrentAccommodation) {
      const button = content.querySelector('button')
      if (button) {
        button.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          handleMarkerClick(accommodation.id)
        })
      }
    }

    return content
  }

  useEffect(() => {
    // Early returns for invalid conditions
    if (!token || !isValidLocation || !mapContainer.current || map.current) {
      return
    }

    try {
      // Set access token
      mapboxgl.accessToken = token

      // Initialize map with custom style
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [location.lng, location.lat],
        zoom: 13,
        antialias: true
      })

      map.current = mapInstance

      // Add navigation controls
      mapInstance.addControl(
        new mapboxgl.NavigationControl({
          showCompass: false,
          visualizePitch: false
        }),
        'top-right'
      )

      // Add current accommodation marker
      const currentMarker = new mapboxgl.Marker({
        element: createCustomMarker(currentAccommodation.overall_score, true),
        anchor: 'bottom'
      })
        .setLngLat([location.lng, location.lat])
        .setPopup(
          new mapboxgl.Popup({ 
            offset: 25,
            closeButton: false,
            closeOnClick: false
          })
            .setDOMContent(createPopupContent(currentAccommodation))
        )
        .addTo(mapInstance)

      markers.current.push(currentMarker)

      // Add similar accommodations markers
      similarAccommodations.forEach((acc) => {
        const marker = new mapboxgl.Marker({
          element: createCustomMarker(acc.overall_score),
          anchor: 'bottom'
        })
          .setLngLat([acc.longitude, acc.latitude])
          .setPopup(
            new mapboxgl.Popup({ 
              offset: 25,
              closeButton: false
            })
              .setDOMContent(createPopupContent(acc))
          )
          .addTo(mapInstance)

        // Add click handler to marker element
        const markerElement = marker.getElement()
        markerElement.addEventListener('click', () => {
          handleMarkerClick(acc.id)
        })

        markers.current.push(marker)
      })

      // Fit bounds to include all markers
      if (similarAccommodations.length > 0) {
        const bounds = new mapboxgl.LngLatBounds()
        bounds.extend([location.lng, location.lat])
        similarAccommodations.forEach(acc => {
          bounds.extend([acc.longitude, acc.latitude])
        })
        mapInstance.fitBounds(bounds, { padding: 50 })
      }

      // Cleanup function
      return () => {
        markers.current.forEach(marker => marker.remove())
        markers.current = []
        mapInstance.remove()
        map.current = null
      }
    } catch (err) {
      console.error('Map initialization error:', err)
      return
    }
  }, [location.lat, location.lng, isValidLocation, currentAccommodation, similarAccommodations, router, handleMarkerClick])

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
      <h2 className="text-2xl font-semibold mb-4">Location & Similar Properties</h2>
      <div className="h-[400px] rounded-lg overflow-hidden shadow-lg">
        <style jsx global>{`
          .custom-marker {
            width: 34px;
            height: 34px;
            cursor: pointer;
          }
          
          .marker-inner {
            width: 34px;
            height: 34px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .marker-score {
            width: 24px;
            height: 24px;
            background-color: #3b82f6;
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            z-index: 2;
            box-shadow: 0 0 10px rgba(0, 122, 255, 0.5);
          }
          
          .marker-inner.current .marker-score {
            background-color: #10b981;
            width: 28px;
            height: 28px;
            font-size: 14px;
          }
          
          .marker-pulse {
            position: absolute;
            width: 100%;
            height: 100%;
            background-color: rgba(59, 130, 246, 0.2);
            border-radius: 50%;
            z-index: 1;
            animation: pulse 2s infinite;
          }

          .marker-inner.current .marker-pulse {
            background-color: rgba(16, 185, 129, 0.2);
          }
          
          @keyframes pulse {
            0% {
              transform: scale(0.5);
              opacity: 1;
            }
            100% {
              transform: scale(2);
              opacity: 0;
            }
          }

          .mapboxgl-popup-content {
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 0;
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
          aria-label={`Map showing location at latitude ${location.lat} and longitude ${location.lng} with similar properties`}
        />
      </div>
    </Card>
  )
}