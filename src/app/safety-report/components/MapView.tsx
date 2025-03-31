'use client'

import * as React from 'react'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { SimilarAccommodation } from '@/types/safety-report'
import { getRiskLevel } from '../utils' // Assuming this path is correct

// Initialize Mapbox access token
const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

// --- Helper Functions ---

const colorToRgba = (color: string, alpha: number): string => {
    if (!color) return `rgba(156, 163, 175, ${alpha})`;

    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (color.startsWith('rgb')) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (match) {
        return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
        }
    }
    console.warn("Unexpected color format for rgba conversion:", color);
    return `rgba(156, 163, 175, ${alpha})`;
};

const createCustomMarker = (score: number, isCurrent: boolean = false, hasCompleteData: boolean = true) => {
    const el = document.createElement('div')
    el.className = 'custom-marker' // Root element given to Mapbox

    let markerColor = '#3b82f6'; // Default blue
    let haloColor = colorToRgba(markerColor, 0.3);
    const scoreSize = isCurrent ? '26px' : '24px'; // Slightly larger current score circle
    const fontSize = isCurrent ? '13px' : '12px';
    const haloSize = isCurrent ? '38px' : '36px';
    const zIndex = isCurrent ? 10 : 3; // Ensure current marker is definitely on top
    const borderStyle = isCurrent ? '3px solid white' : '2px solid white'; // Thicker border for current
    const boxShadow = isCurrent ? '0 2px 5px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0, 0, 0, 0.3)'; // Stronger shadow for current

    if (!hasCompleteData) {
        markerColor = '#9ca3af'; // Grey for incomplete
        haloColor = colorToRgba(markerColor, 0.3);
    } else if (score > 0) { // Apply score color logic to current marker too
        const riskLevel = getRiskLevel(score / 10);
        markerColor = riskLevel.fill || '#3b82f6';
        haloColor = colorToRgba(markerColor, 0.3);
    }

    el.style.zIndex = zIndex.toString();

    // Label only shown if NOT current (to avoid clutter)
    // const labelHtml = !isCurrent ? '<div class="marker-label">Alternative</div>' : '';
    // Let's remove the label for now to simplify

    // Structure: Root -> Visual Wrapper -> (Halo, Inner -> (Score, Pulse))
    el.innerHTML = `
        <div class="marker-visual-content">
          <div class="marker-halo" style="background-color: ${haloColor}; width: ${haloSize}; height: ${haloSize};"></div>
          <div class="marker-inner ${isCurrent ? 'current' : ''} ${!hasCompleteData ? 'incomplete-data' : ''}">
            <div class="marker-score" style="background-color: ${markerColor}; width: ${scoreSize}; height: ${scoreSize}; font-size: ${fontSize}; border: ${borderStyle}; box-shadow: ${boxShadow};">
              ${score}
            </div>
            <div class="marker-pulse" style="background-color: ${colorToRgba(markerColor, 0.2)};"></div>
          </div>
        </div>
    `;
    return el;
};

const isValidCoordinate = (coord: number) => {
    return typeof coord === 'number' && !isNaN(coord) && coord >= -180 && coord <= 180;
};

// --- Types ---
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

// --- Component ---
export const MapView = ({ location, currentAccommodation, similarAccommodations }: MapViewProps) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map());
    const router = useRouter();
    const isInitialized = useRef(false);
    const isValidLocation = isValidCoordinate(location.lat) && isValidCoordinate(location.lng);

    // --- Callbacks ---
    const handleMarkerClick = useCallback((accommodationId: string) => {
        // Open the report page in a new tab
        window.open(`/safety-report/${accommodationId}`, '_blank', 'noopener,noreferrer');
    }, []);

    // Function to close ALL currently open popups
    const closeAllPopups = useCallback(() => {
        popupsRef.current.forEach((popup) => {
            if (popup.isOpen()) {
                popup.remove();
            }
        });
        popupsRef.current.clear(); // Clear the map after closing
    }, []);

    const createPopupContent = useCallback((accommodation: Accommodation | SimilarAccommodation) => {
        const isCurrent = accommodation.id === currentAccommodation.id;
        const name = accommodation.name;
        const hasCompleteData = accommodation.hasCompleteData ?? true;
        const price = 'price_per_night' in accommodation ? (accommodation as SimilarAccommodation).price_per_night : null;

        const content = document.createElement('div');
        content.className = 'p-2 min-w-[180px]'; // Adjusted padding and min-width

        let detailsHtml = '';
        if (price !== null) {
            detailsHtml += `<span class="text-sm text-gray-600">$${price}/night</span>`;
        }
        if (!hasCompleteData) {
            // Add spacing if price is also shown
            const spacing = price !== null ? ' ml-2' : '';
            detailsHtml += `<span class="text-xs text-orange-600 font-medium${spacing}">(Partial Data)</span>`;
        }

        content.innerHTML = `
            <h3 class="font-semibold mb-1 text-base truncate" title="${name}">${name}</h3>
            ${detailsHtml ? `<div class="flex items-center flex-wrap gap-x-2">${detailsHtml}</div>` : ''}
            ${isCurrent ? '<span class="text-xs text-emerald-600 font-medium mt-1 block">Current Selection</span>' : ''}
        `;

        // No button needed anymore as marker click handles navigation

        return content;
    }, [currentAccommodation.id]);

    // --- REVISED Marker Update Logic --- (Simpler: no internal filtering)
    const updateMarkers = useCallback(() => {
        if (!map.current || !map.current.isStyleLoaded() || !map.current.getContainer()) { return; }
        console.log(`UpdateMarkers: Starting. Received ${similarAccommodations.length} filtered alternatives.`);

        // 1. Cleanup previous state (unchanged)
        closeAllPopups();
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];
        popupsRef.current.clear();
        console.log("UpdateMarkers: Cleared old markers and popups.");

        // 2. Combine current prop + PRE-FILTERED similar props
        // The similarAccommodations prop now contains ONLY the ones to display
        const accommodationsToDisplay = [
            { ...currentAccommodation, isCurrent: true, lat: location.lat, lng: location.lng },
            ...similarAccommodations.map(acc => ({ ...acc, isCurrent: false, lat: acc.latitude, lng: acc.longitude }))
        ];
        console.log(`UpdateMarkers: Preparing to display ${accommodationsToDisplay.length} total markers.`);

        // 3. Create and add markers/popups (Loop is the same, uses correct hasCompleteData)
        let addedMarkersCount = 0;
        accommodationsToDisplay.forEach(acc => {
            if (!isValidCoordinate(acc.lat) || !isValidCoordinate(acc.lng)) { return; }
            // Use the hasCompleteData passed in props (which is now reliability-based)
            const hasCompleteData = acc.hasCompleteData !== undefined ? acc.hasCompleteData : true;

            try {
                // createCustomMarker correctly uses the reliability-based hasCompleteData flag
                const markerElement = createCustomMarker(acc.overall_score, acc.isCurrent, hasCompleteData);
                const marker = new mapboxgl.Marker({ element: markerElement }).setLngLat([acc.lng, acc.lat]);

                const popup = new mapboxgl.Popup({
                    offset: 25, closeButton: false, className: 'custom-popup', maxWidth: '280px'
                }).setDOMContent(createPopupContent(acc));

                popupsRef.current.set(acc.id, popup);

                let closePopupTimeout: NodeJS.Timeout | null = null;
                markerElement.addEventListener('mouseenter', () => {
                    if (closePopupTimeout) clearTimeout(closePopupTimeout); // Cancel scheduled close
                    closeAllPopups(); // Close others before opening new one
                    marker.setPopup(popup);
                    popup.addTo(map.current!);
                    // No need to manage popupsRef here explicitly on open, handled by closeAllPopups
                });

                markerElement.addEventListener('mouseleave', () => {
                    // Schedule closing the popup shortly after leaving the marker
                    closePopupTimeout = setTimeout(() => {
                         if (popup.isOpen()) {
                              popup.remove();
                         }
                    }, 200); // 200ms delay
                });

                // --- CLICK LOGIC ---
                markerElement.addEventListener('click', (e) => {
                    e.stopPropagation(); // Keep this to prevent map click events if needed
                    console.log(`Marker clicked: ${acc.name}, Is Current: ${acc.isCurrent}`); // Add log

                    if (acc.isCurrent) {
                        // Fly to current marker's location
                        map.current?.flyTo({ center: [acc.lng, acc.lat] });
                    } else {
                        // Open similar accommodation in new tab
                        handleMarkerClick(acc.id);
                        // Optional: Fly to the clicked marker as well
                        map.current?.flyTo({ center: [acc.lng, acc.lat], zoom: Math.max(map.current.getZoom() || 14.5, 14.5) });
                    }
                });
                // --- END CLICK LOGIC ---

                marker.addTo(map.current!);
                markersRef.current.push(marker);
                addedMarkersCount++;

            } catch (error) { console.error("Error creating marker or popup for:", acc.name, error); }
        });
        console.log(`UpdateMarkers: Added ${addedMarkersCount} markers.`);

    // Dependencies updated: remove showOnlyBetter
    }, [location, currentAccommodation, similarAccommodations, createPopupContent, handleMarkerClick, closeAllPopups]);


    // --- Effects ---

    // Effect for Map Initialization (Unchanged)
    useEffect(() => {
        // ... (Initialization logic is unchanged) ...
        console.log("Map Init Effect: Checking conditions...");
        if (!token || !mapContainer.current || isInitialized.current) { return; }
        // Use the corrected .some() check here for the initial error state
        if (!isValidLocation && !similarAccommodations?.some(acc => isValidCoordinate(acc.latitude) && isValidCoordinate(acc.longitude))) {
            console.log("Map Init Effect: Skipping due to invalid initial location and no valid similar accommodations.");
            return; // Exit early if no valid locations at all
        }
        console.log("Map Init Effect: Initializing map...");
        let mapInstance: mapboxgl.Map | null = null;
        try {
            mapboxgl.accessToken = token;
            mapInstance = new mapboxgl.Map({ /* ... map options ... */
                container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12',
                center: isValidLocation ? [location.lng, location.lat] : undefined, zoom: isValidLocation ? 13 : 5, antialias: true
            });
            map.current = mapInstance;
            mapInstance.addControl( new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right' );
            isInitialized.current = true;
            console.log("Map Init Effect: Map initialized successfully.");
            mapInstance.once('load', () => { console.log("Mapbox 'load' event fired."); });
        } catch (err) { console.error('Map initialization error:', err); if (mapInstance) mapInstance.remove(); map.current = null; isInitialized.current = false; }
        return () => { if (mapInstance) { mapInstance.remove(); } isInitialized.current = false; };
    }, []); // Correct empty dependency array

    // REVISED Effect for Updating Markers and Fitting Bounds
    useEffect(() => {
        console.log(`Marker/Bounds Effect: Running.`);
        if (!map.current || !isInitialized.current) {
            console.log("Marker/Bounds Effect: Skipping (Map not ready).");
            return;
        }

        const runUpdatesAndFitBounds = () => {
            if (!map.current || !map.current.getContainer()) { return; }
            console.log("Marker/Bounds Effect: Running updates and fitting bounds...");

            // 1. Update markers FIRST (uses pre-filtered similarAccommodations)
            updateMarkers();

            // 2. Determine accommodations for bounds (uses pre-filtered list)
            const accommodationsForBounds = similarAccommodations; // Use the already filtered list
            console.log(`Marker/Bounds Effect: Using ${accommodationsForBounds.length} similar accommodations for bounds calculation.`);

            // 3. Fit bounds logic (unchanged, uses accommodationsForBounds)
            const allCoords: mapboxgl.LngLatLike[] = [];
            if (isValidLocation) { allCoords.push([location.lng, location.lat]); }
            accommodationsForBounds.forEach(acc => {
                if (isValidCoordinate(acc.latitude) && isValidCoordinate(acc.longitude)) {
                    allCoords.push([acc.longitude, acc.latitude]);
                }
            });
            if (allCoords.length > 0) {
                try {
                    const bounds = allCoords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]));
                    if (!bounds.isEmpty()) {
                        console.log("Marker/Bounds Effect: Fitting bounds:", bounds.toArray());
                        // Add a slight delay or ensure map is idle if issues persist
                        map.current?.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
                    }
                } catch (e) { console.error("Error fitting bounds:", e); }
            } else {
                console.log("Marker/Bounds Effect: No valid coordinates to fit bounds.");
                // Maybe zoom to current location if no others are shown?
                if (isValidLocation && map.current) {
                    map.current.flyTo({ center: [location.lng, location.lat], zoom: 13 });
                }
            }
        }

        // --- Trigger update (unchanged) ---
        if (map.current.isStyleLoaded()) {
            runUpdatesAndFitBounds();
        } else {
            map.current.once('load', () => {
                if(map.current) runUpdatesAndFitBounds();
            });
        }

        // --- Cleanup (unchanged) ---
        return () => {
            console.log(`Marker/Bounds Effect: Cleanup starting.`);
            // No need to call closeAllPopups/remove markers here,
            // as the *next* run of updateMarkers will handle cleanup.
            // If you see duplicate markers, uncomment the cleanup below.
            // closeAllPopups();
            // const markersToRemove = markersRef.current;
            // if (map.current && map.current.getContainer()) {
            //      markersToRemove.forEach(marker => marker.remove());
            // }
            // markersRef.current = [];
            // popupsRef.current.clear();
        };

    // Dependencies updated: remove showOnlyBetter, closeAllPopups
    }, [location, currentAccommodation, similarAccommodations, updateMarkers, isValidLocation]);


    // --- Render Logic ---

    if (!token) {
        return ( <div className="h-full flex items-center justify-center rounded-xl bg-gray-100 p-4 text-center"> <p className="text-red-600 font-medium">Map configuration error: Missing API token.</p> </div> )
    }
    // Corrected .some() usage here
    if (!isValidLocation && !similarAccommodations?.some(acc => isValidCoordinate(acc.latitude) && isValidCoordinate(acc.longitude))) {
        return ( <div className="h-full flex items-center justify-center rounded-xl bg-gray-100 p-4 text-center"> <p className="text-gray-500">No valid locations to display on the map.</p> </div> )
    }

    return (
        <div className="h-full relative"> {/* Parent needs position relative for overlay */}
            {/* Map Container */}
            <div
                ref={mapContainer}
                className="map-view-container w-full h-full rounded-2xl overflow-hidden shadow-lg bg-gray-200"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                aria-label={`Map showing safety scores...`}
            />

            {/* Styles */}
            <style jsx global>{`
                /* Map container style */
                .map-view-container .mapboxgl-canvas {
                   border-radius: 16px;
                }

                /* --- Marker Styles --- */
                .custom-marker {
                    /* NO position: relative */
                    height: 60px; /* Accommodate label */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: auto; /* Allow width to adjust slightly for label */
                    min-width: 40px;
                    cursor: pointer;
                    pointer-events: none; /* Root passes events through */
                    /* z-index set dynamically inline */
                }

                .marker-visual-content {
                    position: relative; /* CONTEXT for halo/pulse */
                    width: 40px; height: 40px;
                    display: flex; align-items: center; justify-content: center;
                    pointer-events: auto; /* INTERACTIVE part */
                }

                .marker-halo {
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    border-radius: 50%;
                    z-index: 0;
                    pointer-events: none; /* Visual only */
                    transition: background-color 0.3s ease;
                }

                .marker-inner {
                    position: relative; /* Context for pulse (if needed, though pulse is absolute now) */
                    width: 34px; height: 34px;
                    display: flex; align-items: center; justify-content: center;
                    z-index: 1;
                    /* pointer-events: auto; Inherited from visual-content */
                }
                .marker-inner.current { width: 38px; height: 38px; }

                .marker-score {
                    position: relative; /* Not absolute */
                    /* border: 2px solid #FFFFFF; */ /* Border set dynamically */
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-weight: bold; z-index: 2; /* Above pulse */
                    /* box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); */ /* Shadow set dynamically */
                    text-shadow: 0 1px 1px rgba(0,0,0,0.4);
                    line-height: 1;
                    transition: background-color 0.3s ease, width 0.3s ease, height 0.3s ease, border 0.3s ease, box-shadow 0.3s ease;
                    /* pointer-events: auto; Inherited from visual-content */
                }

                .marker-pulse {
                    position: absolute;
                    top: 50%; left: 50%; /* Center relative to visual-content */
                    width: 100%; height: 100%;
                    transform: translate(-50%, -50%);
                    border-radius: 50%; z-index: 1; /* Behind score */
                    animation: pulse 2s infinite ease-out;
                    pointer-events: none; /* Visual only */
                    transition: background-color 0.3s ease;
                }

                /* Remove marker-label styles if label is removed */
                /* .marker-label { ... } */

                @keyframes pulse {
                    0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0.6; }
                    70% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
                    100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
                }

                /* --- Mapbox Overrides --- */
                /* Correct comment syntax */
                .mapboxgl-popup-content {
                     border-radius: 10px !important; box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important;
                     padding: 0 !important; font-family: inherit !important; background-color: white !important;
                }
                .mapboxgl-popup-close-button { display: none; }
                .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: white !important; }
                .mapboxgl-popup-anchor-top .mapboxgl-popup-tip { border-bottom-color: white !important; }
                .mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: white !important; }
                .mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: white !important; }

                .mapboxgl-ctrl-group {
                    border: none !important; box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
                    border-radius: 8px !important; overflow: hidden;
                }
                .mapboxgl-ctrl-group button { /* ... */ }
                .mapboxgl-ctrl-group button:hover { /* ... */ }
                .mapboxgl-ctrl-group button:disabled { /* ... */ }
                .mapboxgl-ctrl-group button span { /* ... */ }

                .mapboxgl-canvas-container.mapboxgl-interactive { cursor: grab; }
                .mapboxgl-canvas-container.mapboxgl-interactive.mapboxgl-track-pointer { cursor: grabbing; }

                .custom-popup { z-index: 10; }

            `}</style>
        </div>
    )
}