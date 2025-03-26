'use client'

import * as React from 'react'
import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { SimilarAccommodation } from '@/types/safety-report'

// Initialize Mapbox access token
const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

// Create a custom marker element with score
const createCustomMarker = (score: number, isCurrent: boolean = false, hasCompleteData: boolean = true) => {
  const el = document.createElement('div')
  el.className = 'custom-marker'
  
  // Choose background color based on data completeness
  const backgroundColorClass = !hasCompleteData ? 'incomplete-data' : isCurrent ? 'current' : ''
  
  el.innerHTML = `
    <div class="marker-inner ${backgroundColorClass}">
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
  hasCompleteData?: boolean
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

  // Debug logging
  console.log('MapView received similarAccommodations:', similarAccommodations);
  console.log('MapView current accommodation:', currentAccommodation);

  // Validate coordinates
  const isValidLocation = isValidCoordinate(location.lat) && isValidCoordinate(location.lng)

  // Function to handle marker click
  const handleMarkerClick = useCallback((accommodationId: string) => {
    router.push(`/safety-report/${accommodationId}`)
  }, [router])

  // Function to create popup content
  const createPopupContent = useCallback((accommodation: Accommodation | SimilarAccommodation) => {
    const isCurrentAccommodation = accommodation.id === currentAccommodation.id
    const isSimilar = !isCurrentAccommodation && 'price_per_night' in accommodation
    const hasCompleteData = 'hasCompleteData' in accommodation ? accommodation.hasCompleteData : true

    const content = document.createElement('div')
    content.className = 'p-2 min-w-[200px]'
    content.innerHTML = `
      <h3 class="font-semibold mb-1">${accommodation.name}</h3>
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm font-medium">Safety Score: ${accommodation.overall_score}</span>
        ${isSimilar ? `<span class="text-sm text-gray-500">$${(accommodation as SimilarAccommodation).price_per_night}/night</span>` : ''}
        ${!hasCompleteData ? '<span class="text-xs text-gray-500">(incomplete data)</span>' : ''}
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
  }, [currentAccommodation.id, handleMarkerClick])

  // Function to update markers - simplified without clustering
  const updateMarkers = useCallback(() => {
    if (!map.current) return
    
    // Clear existing markers
    markers.current.forEach(marker => marker.remove())
    markers.current = []
    
    // Add individual markers for similar accommodations
    similarAccommodations.forEach(acc => {
      // Skip accommodations with invalid coordinates
      if (!isValidCoordinate(acc.latitude) || !isValidCoordinate(acc.longitude)) {
        return
      }
      
      // Check if accommodation has complete data
      const hasCompleteData = acc.hasCompleteData !== undefined ? acc.hasCompleteData : true
      
      // Create popup but don't attach it yet
      const popup = new mapboxgl.Popup({ 
        offset: 25,
        closeButton: false,
        className: 'custom-popup'
      }).setDOMContent(createPopupContent({...acc, hasCompleteData}))
      
      // Create marker
      const marker = new mapboxgl.Marker({
        element: createCustomMarker(acc.overall_score, false, hasCompleteData)
      })
        .setLngLat([acc.longitude, acc.latitude])
        .addTo(map.current!)
      
      // Add hover events to show/hide popup
      const markerElement = marker.getElement()
      markerElement.addEventListener('mouseenter', () => {
        marker.setPopup(popup)
        popup.addTo(map.current!)
      })
      markerElement.addEventListener('mouseleave', () => {
        popup.remove()
      })
      
      // Add click handler for individual markers
      markerElement.addEventListener('click', () => {
        handleMarkerClick(acc.id)
      })
      
      markers.current.push(marker)
    })
    
    // Always add current accommodation marker
    const hasCompleteData = currentAccommodation.hasCompleteData !== undefined ? 
      currentAccommodation.hasCompleteData : true
      
    const currentPopup = new mapboxgl.Popup({ 
      offset: 25,
      closeButton: false,
      className: 'custom-popup'
    }).setDOMContent(createPopupContent(currentAccommodation))
    
    const currentMarker = new mapboxgl.Marker({
      element: createCustomMarker(currentAccommodation.overall_score, true, hasCompleteData)
    })
      .setLngLat([location.lng, location.lat])
      .addTo(map.current)
    
    // Add hover events to show/hide popup for current accommodation
    const currentMarkerElement = currentMarker.getElement()
    currentMarkerElement.addEventListener('mouseenter', () => {
      currentMarker.setPopup(currentPopup)
      currentPopup.addTo(map.current!)
    })
    currentMarkerElement.addEventListener('mouseleave', () => {
      currentPopup.remove()
    })
    
    markers.current.push(currentMarker)
    
  }, [location, currentAccommodation, createPopupContent, similarAccommodations, handleMarkerClick])

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
        style: 'mapbox://styles/mapbox/streets-v12',
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
      
      // Initialize markers once map loads
      mapInstance.on('load', () => {
        updateMarkers()
      })
      
      // Update markers when map moves or zooms
      mapInstance.on('moveend', updateMarkers)
      mapInstance.on('zoomend', updateMarkers)

      // Fit bounds to include all markers
      if (similarAccommodations.length > 0) {
        const bounds = new mapboxgl.LngLatBounds()
        bounds.extend([location.lng, location.lat])
        similarAccommodations.forEach(acc => {
          if (isValidCoordinate(acc.latitude) && isValidCoordinate(acc.longitude)) {
            bounds.extend([acc.longitude, acc.latitude])
          }
        })
        mapInstance.fitBounds(bounds, { padding: 50 })
      }

      // Cleanup function
      return () => {
        markers.current.forEach(marker => marker.remove())
        markers.current = []
        mapInstance.off('moveend', updateMarkers)
        mapInstance.off('zoomend', updateMarkers)
        mapInstance.remove()
        map.current = null
      }
    } catch (err) {
      console.error('Map initialization error:', err)
      return
    }
  }, [location, similarAccommodations, updateMarkers, isValidLocation])

  if (!token) {
    return (
      <div className="h-full">
        <div className="h-full rounded-xl bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Map configuration error: Missing API token</p>
        </div>
      </div>
    )
  }

  if (!isValidLocation) {
    return (
      <div className="h-full">
        <div className="h-full rounded-xl bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Invalid location coordinates</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
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
        
        .marker-inner.incomplete-data .marker-score {
          background-color: #9ca3af;
          color: #f3f4f6;
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
        
        .marker-inner.incomplete-data .marker-pulse {
          background-color: rgba(156, 163, 175, 0.2);
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
          border-radius: 8px;
        }

        .custom-popup {
          transition: opacity 0.2s ease-in-out;
        }

        .custom-popup .mapboxgl-popup-content {
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
      `}</style>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-2xl overflow-hidden shadow-md"
        style={{ position: 'relative' }}
        aria-label={`Map showing location at latitude ${location.lat} and longitude ${location.lng} with similar properties`}
      />
    </div>
  )
}