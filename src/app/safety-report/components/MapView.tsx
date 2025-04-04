'use client'

import * as React from 'react'
import { useEffect, useRef, useCallback, useMemo } from 'react' // Import useMemo for debouncing
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { SimilarAccommodation } from '@/types/safety-report'
import { getRiskLevel } from '../utils' // Assuming this path is correct

// --- Configuration ---
const mapTilerApiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || ''
const mapTilerMapId = 'streets-v2'; // Or choose another style like 'basic-v2', 'outdoor-v2', 'hybrid' etc.

// --- Constants ---
const MIN_MARKER_OPACITY = 0.20; // Minimum opacity for the lowest score markers (0-1 range)
const MAX_SCORE_FOR_OPACITY = 100; // Assume score ranges up to 100 for opacity calculation
const INITIAL_ZOOM = 19; // Increased initial zoom
const FIT_BOUNDS_MAX_ZOOM = 19; // Also increase max zoom for consistency
const FLY_TO_ZOOM = 19; // Also increase fly to zoom

// --- Helper Functions ---

const colorToRgba = (color: string, alpha: number): string => {
    if (!color) return `rgba(156, 163, 175, ${alpha})`; // gray-400 fallback

    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 3) { // Expand shorthand hex
           const r = parseInt(hex[0] + hex[0], 16);
           const g = parseInt(hex[1] + hex[1], 16);
           const b = parseInt(hex[2] + hex[2], 16);
           return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else if (hex.length === 6) {
           const bigint = parseInt(hex, 16);
           const r = (bigint >> 16) & 255;
           const g = (bigint >> 8) & 255;
           const b = bigint & 255;
           return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    } else if (color.startsWith('rgb')) {
        // Handle rgb() and rgba()
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (match) {
            return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
        }
    }
    console.warn("Unexpected color format for rgba conversion:", color);
    // Fallback if parsing fails
    return `rgba(156, 163, 175, ${alpha})`; // gray-400
};

// Helper: Calculate Opacity based on Score
const getOpacityFromScore = (score: number, isCurrent: boolean, hasCompleteData: boolean): number => {
    if (isCurrent) {
        return 1.0; // Current marker always full opacity
    }
    if (!hasCompleteData || typeof score !== 'number' || isNaN(score)) {
         // Markers with incomplete data or invalid scores get minimum opacity
        return MIN_MARKER_OPACITY;
    }
    // Clamp score between 0 and MAX_SCORE_FOR_OPACITY
    const clampedScore = Math.max(0, Math.min(score, MAX_SCORE_FOR_OPACITY));
    // Linear interpolation: score 0 -> MIN_MARKER_OPACITY, score MAX -> 1.0
    const opacity = MIN_MARKER_OPACITY + (clampedScore / MAX_SCORE_FOR_OPACITY) * (1.0 - MIN_MARKER_OPACITY);
    return opacity;
};


// SIMPLIFIED: Creates HTML string for Leaflet's DivIcon (hover logic removed)
const createCustomMarkerHTML = (
    score: number,
    isCurrent: boolean = false,
    hasCompleteData: boolean = true
    // isHovered parameter removed
): string => {
    let markerColor = '#3b82f6'; // Default blue-500
    let haloColor = colorToRgba(markerColor, 0.3);
    const scoreSize = isCurrent ? '26px' : '24px'; // Removed hover size increase
    const fontSize = isCurrent ? '13px' : '12px'; // Removed hover font size increase
    const haloSize = isCurrent ? '38px' : '36px'; // Removed hover halo increase
    const currentHaloClass = isCurrent ? 'current-halo-animation' : '';
    const borderStyle = isCurrent ? '3px solid white' : '2px solid white'; // Removed hover border increase
    const boxShadow = isCurrent ? '0 2px 5px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0, 0, 0, 0.3)'; // Removed hover shadow increase
    const scoreText = hasCompleteData ? score.toFixed(0) : '?'; // Ensure score is rounded
    const zIndex = isCurrent ? 10 : 1; // Removed hover z-index increase
    const scale = 'scale(1)'; // Removed hover scale

    if (!hasCompleteData) {
        markerColor = '#9ca3af'; // Grey-400 for incomplete
        haloColor = colorToRgba(markerColor, 0.3);
    } else if (score >= 0) {
        const riskLevel = getRiskLevel(score / 10); // Adjust score scale if needed
        markerColor = riskLevel?.fill || '#3b82f6';
        haloColor = colorToRgba(markerColor, 0.3);
    }

    const markerOpacity = getOpacityFromScore(score, isCurrent, hasCompleteData);

    // Removed hover-related inline styles (transform, z-index) and transitions from the elements
    return `
        <div class="marker-visual-content" style="opacity: ${markerOpacity};">
          <div class="marker-halo ${currentHaloClass}" style="background-color: ${haloColor}; width: ${haloSize}; height: ${haloSize};"></div>
          <div class="marker-inner ${isCurrent ? 'current' : ''} ${!hasCompleteData ? 'incomplete-data' : ''}">
            <div class="marker-score" style="background-color: ${markerColor}; width: ${scoreSize}; height: ${scoreSize}; font-size: ${fontSize}; border: ${borderStyle}; box-shadow: ${boxShadow};">
              ${scoreText}
            </div>
            ${hasCompleteData ? `<div class="marker-pulse" style="background-color: ${colorToRgba(markerColor, 0.2)};"></div>` : ''}
          </div>
        </div>
    `;
};

// Use Leaflet's stricter coordinate validation needs
const isValidCoordinate = (coord: number, type: 'lat' | 'lng'): boolean => {
    if (typeof coord !== 'number' || isNaN(coord)) return false;
    if (type === 'lat') return coord >= -90 && coord <= 90;
    if (type === 'lng') return coord >= -180 && coord <= 180;
    return false;
};

// --- Types (Update MapViewProps - Remove hover) ---
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
    // hoveredAlternativeId: string | null; // REMOVED
    // onMarkerHover: (id: string | null) => void; // REMOVED
}

// --- Debounce Utility ---
// (Could also import from lodash.debounce if preferred)
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeoutId: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), waitFor);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
};

// --- Component ---
const MapViewComponent = ({ // Rename original component
    location,
    currentAccommodation,
    similarAccommodations,
    // hoveredAlternativeId, // REMOVED
    // onMarkerHover // REMOVED
}: MapViewProps): React.ReactNode => { // Ensure component returns ReactNode
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());
    const popupsRef = useRef<Map<string, L.Popup>>(new Map());
    const markerHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialized = useRef(false);
    const isValidCurrentLocation = isValidCoordinate(location.lat, 'lat') && isValidCoordinate(location.lng, 'lng');

    // --- Callbacks ---
    const handleMarkerClick = useCallback((accommodationId: string) => {
        // Open the report page in a new tab (same as before)
        window.open(`/safety-report/${accommodationId}`, '_blank', 'noopener,noreferrer');
    }, []);

    // Function to close ALL currently open popups
    const closeAllPopups = useCallback(() => {
        if (!map.current) return;
        // Iterate through the tracked popups and close them
        popupsRef.current.forEach((popup) => {
            if (map.current?.hasLayer(popup)) {
                 map.current.closePopup(popup);
            }
        });
        // Don't clear popupsRef here, they remain bound to markers
    }, []);

    // Creates DOM element for Leaflet popup .setContent()
    const createPopupContent = useCallback((accommodation: Accommodation | SimilarAccommodation): HTMLElement => {
        const isCurrent = accommodation.id === currentAccommodation.id;
        const name = accommodation.name;
        // Ensure hasCompleteData check works for both types
        const hasCompleteData = 'hasCompleteData' in accommodation ? accommodation.hasCompleteData : (currentAccommodation.id === accommodation.id ? currentAccommodation.hasCompleteData ?? true : true);
        const price = 'price_per_night' in accommodation ? (accommodation as SimilarAccommodation).price_per_night : null;

        const content = document.createElement('div');
        content.className = 'p-2 min-w-[180px]'; // Reuse existing Tailwind classes

        let detailsHtml = '';
        if (price !== null && price > 0) { // Only show price if it exists and is > 0
            detailsHtml += `<span class="text-sm text-gray-600">$${price}/night</span>`;
        }
        if (!hasCompleteData) {
            const spacing = detailsHtml ? ' ml-2' : ''; // Add space if price is also shown
            detailsHtml += `<span class="text-xs text-orange-600 font-medium${spacing}">(Partial Data)</span>`;
        }

        content.innerHTML = `
            <h3 class="font-semibold mb-1 text-base truncate" title="${name}">${name}</h3>
            ${detailsHtml ? `<div class="flex items-center flex-wrap gap-x-2">${detailsHtml}</div>` : ''}
            ${isCurrent ? '<span class="text-xs text-emerald-600 font-medium mt-1 block">Current Selection</span>' : ''}
        `;

        return content;
    }, [currentAccommodation.id, currentAccommodation.hasCompleteData]);


    // --- REVISED Marker Update Logic (Optimized) ---
    const updateMarkers = useCallback(() => {
        if (!map.current || !mapContainer.current) return;
        // console.log("MapView: Running optimized updateMarkers");

        const newMarkersData = new Map<string, any>(); // Use Map for efficient lookup
        const currentMarkerIds = new Set(markersRef.current.keys());
        const neededMarkerIds = new Set<string>();

        // 1. Combine and prepare new data
        const currentWithCoords = {
             ...currentAccommodation,
             isCurrent: true,
             lat: location.lat,
             lng: location.lng,
             hasCompleteData: currentAccommodation.hasCompleteData ?? true
        };
        if (isValidCurrentLocation) {
            newMarkersData.set(currentWithCoords.id, currentWithCoords);
        }
        similarAccommodations
            .filter(acc =>
                isValidCoordinate(acc.latitude, 'lat') &&
                isValidCoordinate(acc.longitude, 'lng') &&
                typeof acc.overall_score === 'number' && !isNaN(acc.overall_score) && acc.overall_score >= 0
            )
            .forEach(acc => {
                if (!newMarkersData.has(acc.id)) { // Avoid overwriting current if it's also in similar
                    newMarkersData.set(acc.id, {
                        ...acc,
                        isCurrent: false,
                        lat: acc.latitude,
                        lng: acc.longitude,
                        hasCompleteData: acc.hasCompleteData ?? true
                    });
                }
            });

        // 2. Add or Update Markers
        newMarkersData.forEach((acc, id) => {
            neededMarkerIds.add(id); // Mark this ID as needed

            // Coordinates are validated in the filter step
            if (!isValidCoordinate(acc.lat, 'lat') || !isValidCoordinate(acc.lng, 'lng')) return;

            const hasCompleteData = acc.hasCompleteData;
            const isCurrent = acc.isCurrent;
            const overallScore = typeof acc.overall_score === 'number' ? acc.overall_score : 0;
            let marker = markersRef.current.get(id);
            let popup = popupsRef.current.get(id);

            // --- Create Marker and Popup if they don't exist ---
            if (!marker) {
                // console.log(`MapView: Creating marker for ${id}`);
                try {
                    const iconHtml = createCustomMarkerHTML(overallScore, isCurrent, hasCompleteData);
                    const icon = L.divIcon({
                        html: iconHtml,
                        className: 'custom-leaflet-icon',
                        iconSize: [40, 40],
                        iconAnchor: [20, 40],
                        popupAnchor: [0, -35]
                    });

                    marker = L.marker([acc.lat, acc.lng], {
                        icon: icon,
                        zIndexOffset: isCurrent ? 1000 : 500,
                        riseOnHover: true // Leaflet handles hover visual cue
                    });

                    // Create and bind popup
                    const popupContent = createPopupContent(acc);
                    popup = L.popup({
                        offset: L.point(0, -5),
                        closeButton: false,
                        className: 'custom-leaflet-popup',
                        maxWidth: 280,
                    }).setContent(popupContent);
                    marker.bindPopup(popup);

                    // --- Add Event Listeners ---
                    marker.on('mouseover', (e) => {
                        if (markerHoverTimeoutRef.current) clearTimeout(markerHoverTimeoutRef.current);
                        closeAllPopups();
                        marker?.openPopup(); // Use optional chaining
                    });
                    marker.on('mouseout', (e) => {
                        markerHoverTimeoutRef.current = setTimeout(() => {
                            marker?.closePopup(); // Use optional chaining
                            markerHoverTimeoutRef.current = null;
                        }, 200);
                    });
                    popup.on('add', () => { // Popup hover logic
                        const popupElement = popup?.getElement(); // Use optional chaining
                        if (popupElement) {
                            popupElement.addEventListener('mouseenter', () => {
                                if (markerHoverTimeoutRef.current) {
                                    clearTimeout(markerHoverTimeoutRef.current);
                                    markerHoverTimeoutRef.current = null;
                                }
                            });
                            popupElement.addEventListener('mouseleave', () => {
                                markerHoverTimeoutRef.current = setTimeout(() => {
                                    if (map.current) marker?.closePopup(); // Use optional chaining
                                    markerHoverTimeoutRef.current = null;
                                }, 200);
                            });
                        }
                    });
                    marker.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        if (isCurrent) {
                            if (map.current) map.current.flyTo([acc.lat, acc.lng], map.current.getZoom());
                        } else {
                            handleMarkerClick(acc.id);
                            if (map.current) map.current.flyTo([acc.lat, acc.lng], FLY_TO_ZOOM);
                        }
                    });
                    // --- End Event Listeners ---

                    marker.addTo(map.current!);
                    markersRef.current.set(id, marker);
                    popupsRef.current.set(id, popup);

                } catch (error) { console.error("Error creating Leaflet marker/popup:", acc.name, error); }
            }
            // --- Optional: Update existing marker if needed (e.g., icon change) ---
            // else {
            //    // console.log(`MapView: Marker exists for ${id}, potentially update`);
            //    // Example: Update icon if score changed significantly (though less likely here)
            //    // const newIconHtml = createCustomMarkerHTML(overallScore, isCurrent, hasCompleteData);
            //    // const newIcon = L.divIcon({...});
            //    // marker.setIcon(newIcon);
            //
            //    // Update popup content if necessary
            //    // const newPopupContent = createPopupContent(acc);
            //    // popup?.setContent(newPopupContent); // Use optional chaining
            // }
        });

        // 3. Remove Obsolete Markers
        currentMarkerIds.forEach(id => {
            if (!neededMarkerIds.has(id)) {
                // console.log(`MapView: Removing obsolete marker for ${id}`);
                const markerToRemove = markersRef.current.get(id);
                const popupToRemove = popupsRef.current.get(id);
                if (markerToRemove) {
                    markerToRemove.off('mouseover mouseout click'); // Unbind events
                    if (popupToRemove && map.current?.hasLayer(popupToRemove)) {
                         map.current.closePopup(popupToRemove);
                    }
                    map.current?.removeLayer(markerToRemove);
                    markersRef.current.delete(id);
                    popupsRef.current.delete(id);
                }
            }
        });

        // console.log(`MapView: updateMarkers complete. Current markers: ${markersRef.current.size}`);

    }, [
        location,
        currentAccommodation,
        similarAccommodations,
        createPopupContent,
        handleMarkerClick,
        closeAllPopups,
        isValidCurrentLocation // Include this derived state
    ]);
    // --- END REVISED Marker Update Logic ---


    // --- Effect for Map Initialization ---
    useEffect(() => {
        // console.log("Map Init Effect (Leaflet): Checking conditions...");
        if (!mapTilerApiKey) {
            console.error("Map configuration error: Missing NEXT_PUBLIC_MAPTILER_API_KEY.");
            return;
        }
        if (!mapContainer.current) {
             // console.log("Map Init Effect (Leaflet): Skipping, container ref not set.");
             return;
        }
        if (isInitialized.current) {
             // console.log("Map Init Effect (Leaflet): Skipping, already initialized.");
             return;
        }

        const hasAnyValidLocation = isValidCurrentLocation || similarAccommodations?.some(acc => isValidCoordinate(acc.latitude, 'lat') && isValidCoordinate(acc.longitude, 'lng'));
        if (!hasAnyValidLocation) {
            // console.log("Map Init Effect (Leaflet): Skipping due to no valid initial locations.");
            return;
        }

        // console.log("Map Init Effect (Leaflet): Initializing map...");
        let mapInstance: L.Map | null = null;
        try {
            // Ensure Leaflet only initializes once even with StrictMode double render
             if (mapContainer.current.querySelector('.leaflet-container')) {
                 // console.log("Map Init Effect (Leaflet): Skipping, Leaflet container already exists.");
                 return;
             }

            mapInstance = L.map(mapContainer.current, {
                 // zoomControl: false, // REMOVED: Allow default zoom control
                 attributionControl: false,
            });

            const tileUrl = `https://api.maptiler.com/maps/${mapTilerMapId}/{z}/{x}/{y}.png?key=${mapTilerApiKey}`;
            const attribution = '© <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';

            L.tileLayer(tileUrl, {
                tileSize: 512,
                zoomOffset: -1,
                minZoom: 1,
                attribution: attribution,
                crossOrigin: true,
                // detectRetina: true
            }).addTo(mapInstance);

            L.control.attribution({ position: 'bottomright', prefix: false }).addTo(mapInstance);
            L.control.zoom({ position: 'topright' }).addTo(mapInstance);

            // Set initial view with updated zoom
            if (isValidCurrentLocation) {
                mapInstance.setView([location.lat, location.lng], INITIAL_ZOOM); // Use constant
            } else {
                 const firstValidSimilar = similarAccommodations?.find(acc => isValidCoordinate(acc.latitude, 'lat') && isValidCoordinate(acc.longitude, 'lng'));
                 if (firstValidSimilar) {
                      mapInstance.setView([firstValidSimilar.latitude, firstValidSimilar.longitude], INITIAL_ZOOM); // Use constant
                 } else {
                      mapInstance.setView([0, 0], 2);
                 }
            }

            map.current = mapInstance;
            isInitialized.current = true;
            // console.log("Map Init Effect (Leaflet): Map initialized successfully.");

            // --- REMOVED: Delayed invalidateSize ---
            // Rely on ResizeObserver for size invalidation

            const resizeObserver = new ResizeObserver(() => {
                 mapInstance?.invalidateSize();
                 // Using setTimeout as a workaround for debouncing since debounceTime is not a valid option
                 setTimeout(() => mapInstance?.invalidateSize(), 100);
             });
             resizeObserver.observe(mapContainer.current!);

             return () => {
                 // console.log("Map Init Effect (Leaflet): Cleaning up map instance.");
                 // clearTimeout(timer); // No timer to clear anymore
                 resizeObserver.disconnect();
                 if (markerHoverTimeoutRef.current) clearTimeout(markerHoverTimeoutRef.current);
                 if (map.current) {
                      map.current.remove();
                 }
                 map.current = null;
                 isInitialized.current = false;
                 markersRef.current.clear();
                 popupsRef.current.clear();
             };

        } catch (err) {
             console.error('Leaflet map initialization error:', err);
             if (mapInstance) mapInstance.remove();
             map.current = null;
             isInitialized.current = false;
        }
    }, []); // IMPORTANT: Empty dependency array

    // --- REVISED Effect for Updating Markers & Bounds ---
    // --- Debounced Effect for Updating Markers & Bounds ---
    // Memoize the debounced function itself to prevent recreation on every render
    const debouncedMapUpdates = useMemo(() => {
        const performMapUpdates = () => {
            if (!map.current || !mapContainer.current) {
                // console.log("MapView: Skipping debounced update (map not ready)");
                return;
            }
            // console.log("MapView: Performing debounced map updates...");

            // 1. Update markers FIRST (using the optimized function)
            updateMarkers(); // updateMarkers is already memoized with useCallback

            // 2. Determine valid locations for bounds calculation
            const locationsForBounds: L.LatLngExpression[] = [];
            if (isValidCurrentLocation) {
                locationsForBounds.push([location.lat, location.lng]);
            }
            similarAccommodations.forEach(acc => {
                if (isValidCoordinate(acc.latitude, 'lat') && isValidCoordinate(acc.longitude, 'lng')) {
                    locationsForBounds.push([acc.latitude, acc.longitude]);
                }
            });

            // 3. Fit bounds logic (Leaflet)
            if (locationsForBounds.length > 0) {
                 const bounds = L.latLngBounds(locationsForBounds);
                 if (bounds.isValid()) {
                      if (map.current) {
                           map.current.flyToBounds(bounds, {
                                padding: [60, 60],
                                maxZoom: FIT_BOUNDS_MAX_ZOOM,
                                duration: 0.8,
                                // Consider adding noMoveStart: true if flyToBounds triggers unwanted move events
                           });
                      }
                 } else {
                      if (locationsForBounds.length === 1 && map.current) {
                           map.current.flyTo(locationsForBounds[0], FLY_TO_ZOOM, { duration: 0.8 });
                      }
                 }
            }
        };
        // Debounce the actual map operations
        return debounce(performMapUpdates, 300); // 300ms debounce interval
    }, [location, currentAccommodation, similarAccommodations, updateMarkers, isValidCurrentLocation]); // Dependencies for recreating the debounced function

    useEffect(() => {
        if (!map.current || !isInitialized.current) {
            return;
        }

        // Call the debounced function when dependencies change
        map.current.whenReady(() => {
            debouncedMapUpdates();
        });

        // Cleanup function to cancel any pending debounced call
        return () => {
            debouncedMapUpdates.cancel();
        };
    }, [debouncedMapUpdates]); // Effect runs when the debounced function itself changes (due to its dependencies)


    // --- Render Logic ---

    if (!mapTilerApiKey) {
        return ( <div className="h-full flex items-center justify-center rounded-xl bg-gray-100 p-4 text-center"> <p className="text-red-600 font-medium">Map configuration error: Missing MapTiler API Key.</p> </div> )
    }

    const hasAnyValidData = isValidCurrentLocation || similarAccommodations?.some(acc => isValidCoordinate(acc.latitude, 'lat') && isValidCoordinate(acc.longitude, 'lng'));
    if (!hasAnyValidData) {
        return ( <div className="h-full flex items-center justify-center rounded-xl bg-gray-100 p-4 text-center"> <p className="text-gray-500">No valid locations to display on the map.</p> </div> )
    }

    // Ensure the component returns JSX
    return (
        <div className="h-full relative">
            {/* Map Container */}
            <div
                ref={mapContainer}
                className="map-view-container w-full h-full rounded-2xl overflow-hidden shadow-lg bg-gray-200"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                aria-label={`Map showing accommodation safety scores`}
            />

            {/* Styles - Removed hover-related transitions */}
            <style jsx global>{`
                /* Base Leaflet Container Style */
                .leaflet-container {
                    border-radius: 16px; /* Match parent's rounded corners */
                    font-family: inherit; /* Inherit font from parent */
                    cursor: grab;
                }
                .leaflet-container.leaflet-grab { cursor: grab; }
                .leaflet-container.leaflet-dragging { cursor: grabbing; }

                /* --- Custom Leaflet Icon Base --- */
                .custom-leaflet-icon {
                    background: none; border: none; display: flex; justify-content: center; align-items: flex-end; pointer-events: none;
                }

                /* --- Marker Visual Structure Styles (Removed transitions) --- */
                .marker-visual-content {
                    position: relative; width: 40px; height: 40px;
                    display: flex; align-items: center; justify-content: center;
                    pointer-events: auto; cursor: pointer;
                    /* Opacity set inline */
                }

                .marker-halo {
                    position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%); border-radius: 50%; z-index: 0; pointer-events: none;
                    /* width, height, background-color set inline */
                }
                 /* --- Animation for Current Marker's Halo --- */
                .marker-halo.current-halo-animation {
                    animation: halo-pulse-current 2.5s infinite ease-in-out;
                }

                .marker-inner {
                    position: relative; width: 34px; height: 34px; /* Base size */
                    display: flex; align-items: center; justify-content: center; z-index: 1; /* Above halo */
                }
                .marker-inner.current { width: 38px; height: 38px; } /* Size for current */

                .marker-score {
                    position: relative; /* Within inner */
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-weight: bold;
                    z-index: 2; /* Above pulse */
                    text-shadow: 0 1px 1px rgba(0,0,0,0.4);
                    line-height: 1; /* Ensure text fits vertically */
                     /* Dynamic styles applied inline */
                }

                .marker-pulse {
                    position: absolute; top: 50%; left: 50%;
                    width: 100%; height: 100%; /* Pulse relative to inner */
                    transform: translate(-50%, -50%);
                    border-radius: 50%;
                    z-index: 1; /* Behind score */
                    animation: pulse 2s infinite ease-out;
                    pointer-events: none; /* Visual only */
                    /* Inline style for background-color */
                }

                /* --- Keyframe Animations --- */

                /* Existing pulse for score background (unchanged) */
                @keyframes pulse {
                    0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0.6; }
                    70% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
                    100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
                }

                /* NEW pulse specifically for the current marker's halo */
                @keyframes halo-pulse-current {
                    0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
                    50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.1; } /* Expands further */
                    100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
                }

                 /* --- Custom Leaflet Popup Styles --- */
                .custom-leaflet-popup .leaflet-popup-content-wrapper {
                     background-color: white;
                     border-radius: 10px !important; /* Use important if needed */
                     box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important;
                     padding: 0 !important; /* Remove default padding */
                }
                .custom-leaflet-popup .leaflet-popup-content {
                     margin: 0 !important; /* Remove default margin */
                     font-family: inherit !important; /* Use app font */
                     min-width: 180px; /* Ensure minimum width */
                }
                .custom-leaflet-popup .leaflet-popup-tip {
                     background: white !important; /* Match content background */
                     border-top-color: white !important;
                     box-shadow: none !important;
                }
                 .leaflet-popup-close-button { display: none; }


                /* --- Leaflet Control Styles (Zoom/Attribution) --- */
                .leaflet-control-zoom a,
                .leaflet-control-attribution a {
                     color: #0078A8;
                }
                .leaflet-control-zoom,
                .leaflet-control-attribution {
                     border: none !important;
                     box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
                     border-radius: 8px !important;
                     background-clip: padding-box;
                }
                .leaflet-control-zoom {
                     overflow: hidden;
                }
                .leaflet-control-zoom a {
                    background-color: white;
                    color: #333;
                    transition: background-color 0.2s ease, color 0.2s ease;
                }
                 .leaflet-control-zoom a:hover {
                     background-color: #f4f4f4;
                     color: #000;
                 }
                 .leaflet-control-zoom-in {
                     border-bottom: 1px solid #ddd !important;
                 }
                .leaflet-control-attribution {
                     background-color: rgba(255, 255, 255, 0.8) !important;
                     padding: 2px 6px !important;
                     font-size: 11px;
                }

            `}</style>
        </div>
    )
};

// Export the memoized version
export const MapView = React.memo(MapViewComponent);