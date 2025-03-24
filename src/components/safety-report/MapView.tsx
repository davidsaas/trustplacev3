'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import Supercluster from 'supercluster'
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

// Create a cluster marker with count
const createClusterMarker = (count: number) => {
  const el = document.createElement('div')
  el.className = 'cluster-marker'
  el.innerHTML = `
    <div class="cluster-marker-inner">
      <div class="cluster-count">${count}</div>
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

// GeoJSON feature for clustering
interface AccommodationFeature {
  type: 'Feature'
  properties: Accommodation | SimilarAccommodation
  geometry: {
    type: 'Point'
    coordinates: [number, number] // [longitude, latitude]
  }
}

// For type safety with Supercluster
type ClusterProperties = {
  cluster: boolean
  cluster_id: number
  point_count: number
  point_count_abbreviated: string
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
  const supercluster = useRef<Supercluster | null>(null)
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
  }, [currentAccommodation.id, handleMarkerClick])

  // Function to create cluster popup content
  const createClusterPopupContent = useCallback((count: number, accommodations: (Accommodation | SimilarAccommodation)[]) => {
    const content = document.createElement('div')
    content.className = 'p-2 min-w-[200px] max-h-[300px] overflow-y-auto'
    
    let html = `
      <h3 class="font-semibold mb-3">${count} Accommodations</h3>
      <div class="space-y-3">
    `
    
    // Add top 5 accommodations to popup
    const topAccommodations = [...accommodations]
      .sort((a, b) => b.overall_score - a.overall_score)
      .slice(0, 5)
    
    topAccommodations.forEach(acc => {
      const isSimilar = 'price_per_night' in acc
      html += `
        <div class="border-b pb-2 last:border-0">
          <div class="font-medium text-sm">${acc.name}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Score: ${acc.overall_score}</span>
            ${isSimilar ? `<span class="text-xs text-gray-500">$${(acc as SimilarAccommodation).price_per_night}/night</span>` : ''}
          </div>
          <button class="text-xs text-blue-600 hover:underline cursor-pointer mt-1" data-id="${acc.id}">View Details</button>
        </div>
      `
    })
    
    if (accommodations.length > 5) {
      html += `<div class="text-xs text-gray-500 mt-2">Zoom in to see more accommodations</div>`
    }
    
    html += `</div>`
    content.innerHTML = html
    
    // Add click handlers for buttons
    content.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const id = button.getAttribute('data-id')
        if (id) handleMarkerClick(id)
      })
    })
    
    return content
  }, [handleMarkerClick])

  // Function to update markers based on cluster data
  const updateMarkers = useCallback(() => {
    if (!map.current || !supercluster.current) return
    
    // Clear existing markers
    markers.current.forEach(marker => marker.remove())
    markers.current = []
    
    const mapBounds = map.current.getBounds()
    if (!mapBounds) return

    const zoom = Math.floor(map.current.getZoom())
    
    // Get clusters for current bounds and zoom level
    const bbox: [number, number, number, number] = [
      mapBounds.getWest(),
      mapBounds.getSouth(),
      mapBounds.getEast(),
      mapBounds.getNorth()
    ]
    
    const clusters = supercluster.current.getClusters(bbox, zoom)
    
    // Add cluster or individual markers
    clusters.forEach(cluster => {
      const [longitude, latitude] = cluster.geometry.coordinates
      
      // Check if it's a cluster
      if (cluster.properties.cluster) {
        const count = cluster.properties.point_count
        const clusterId = cluster.properties.cluster_id
        
        // Create cluster marker
        const marker = new mapboxgl.Marker({
          element: createClusterMarker(count)
        })
          .setLngLat([longitude, latitude])
          .addTo(map.current!)
        
        // Get cluster children for popup
        const clusterPoints = supercluster.current!.getLeaves(clusterId, 100)
        const clusterAccommodations = clusterPoints.map(point => point.properties as Accommodation | SimilarAccommodation)
        
        // Create popup but don't attach it yet
        const popup = new mapboxgl.Popup({ 
          offset: 25,
          closeButton: false,
          maxWidth: '300px',
          className: 'custom-popup'
        }).setDOMContent(createClusterPopupContent(count, clusterAccommodations))
        
        // Add hover events to show/hide popup
        const markerElement = marker.getElement()
        markerElement.addEventListener('mouseenter', () => {
          marker.setPopup(popup)
          popup.addTo(map.current!)
        })
        markerElement.addEventListener('mouseleave', () => {
          popup.remove()
        })
        
        // Handle click to zoom in
        markerElement.addEventListener('click', () => {
          // Get cluster expansion zoom level
          const expansionZoom = Math.min(supercluster.current!.getClusterExpansionZoom(clusterId), 20)
          
          map.current!.easeTo({
            center: [longitude, latitude],
            zoom: expansionZoom
          })
        })
        
        markers.current.push(marker)
      } else {
        // Individual accommodation marker
        const accommodation = cluster.properties as Accommodation | SimilarAccommodation
        
        // Skip markers with invalid coordinates
        if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
          return
        }
        
        // Create popup but don't attach it yet
        const popup = new mapboxgl.Popup({ 
          offset: 25,
          closeButton: false,
          className: 'custom-popup'
        }).setDOMContent(createPopupContent(accommodation))
        
        // Create regular marker
        const marker = new mapboxgl.Marker({
          element: createCustomMarker(accommodation.overall_score, accommodation.id === currentAccommodation.id)
        })
          .setLngLat([longitude, latitude])
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
        if (accommodation.id !== currentAccommodation.id) {
          markerElement.addEventListener('click', () => {
            handleMarkerClick(accommodation.id)
          })
        }
        
        markers.current.push(marker)
      }
    })
    
    // Always add current accommodation marker (outside of clustering)
    // Create popup for current accommodation but don't attach it yet
    const currentPopup = new mapboxgl.Popup({ 
      offset: 25,
      closeButton: false,
      className: 'custom-popup'
    }).setDOMContent(createPopupContent(currentAccommodation))
    
    const currentMarker = new mapboxgl.Marker({
      element: createCustomMarker(currentAccommodation.overall_score, true)
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
    
  }, [location, currentAccommodation, createPopupContent, createClusterPopupContent, handleMarkerClick])

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

      // Prepare GeoJSON features for clustering
      const features: AccommodationFeature[] = []
      
      // Add similar accommodations
      similarAccommodations.forEach(acc => {
        // Skip accommodations with invalid coordinates
        if (!isValidCoordinate(acc.latitude) || !isValidCoordinate(acc.longitude)) {
          console.warn('Invalid coordinates for accommodation:', acc);
          return;
        }
        
        features.push({
          type: 'Feature',
          properties: acc,
          geometry: {
            type: 'Point',
            coordinates: [acc.longitude, acc.latitude]
          }
        })
      })
      
      // Create supercluster instance
      const cluster = new Supercluster({
        radius: 40,
        maxZoom: 16, // Max zoom to cluster points
        minPoints: 3 // Min points to form a cluster
      })
      
      // Load GeoJSON features
      cluster.load(features)
      supercluster.current = cluster
      
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
        supercluster.current = null
      }
    } catch (err) {
      console.error('Map initialization error:', err)
      return
    }
  }, [location, similarAccommodations, updateMarkers, isValidLocation])

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
          
          /* Cluster marker styles */
          .cluster-marker {
            width: 50px;
            height: 50px;
            cursor: pointer;
          }
          
          .cluster-marker-inner {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .cluster-count {
            width: 40px;
            height: 40px;
            background-color: #f97316;
            border: 3px solid #FFFFFF;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 0 10px rgba(249, 115, 22, 0.5);
            animation: pulse-cluster 2s ease-out infinite;
          }
          
          @keyframes pulse-cluster {
            0% {
              box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
            }
            70% {
              box-shadow: 0 0 0 15px rgba(249, 115, 22, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
            }
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

          .custom-popup {
            transition: opacity 0.2s ease-in-out;
          }

          .custom-popup .mapboxgl-popup-content {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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