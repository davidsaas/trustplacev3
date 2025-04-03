// src/app/safety-report/[id]/components/OverviewSection.tsx
import React, { Suspense, lazy } from 'react'; // Import React
import { Info, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SimilarAccommodation, SafetyMetric, Location, AccommodationData } from '@/types/safety-report';
import { SaferAlternativesSection } from './SaferAlternativesSection';
// REMOVED: import { MapLoadingPlaceholder } from '../page'; // This was causing the error

// Lazily import MapView
const LazyMapView = lazy(() => import('../../components/MapView').then(module => ({ default: module.MapView })));

// --- ADDED MapLoadingPlaceholder Definition ---
// Simple placeholder for map loading - defined locally now
const MapLoadingPlaceholder = () => (
  <div className="h-full bg-gray-100 flex items-center justify-center rounded-xl">
    <div className="text-center">
      <svg className="animate-spin h-8 w-8 text-gray-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="text-sm text-gray-500">Loading map...</p>
    </div>
  </div>
);
// --- End ADDED MapLoadingPlaceholder Definition ---


type OverviewSectionProps = {
  takeaways: string[] | null;
  alternatives: SimilarAccommodation[] | null | undefined;
  currentAccommodation: Pick<AccommodationData, 'id' | 'name' | 'overall_score' | 'hasCompleteData'>;
  currentMetrics: SafetyMetric[] | null | undefined;
  currentScore: number | null | undefined;
  allNearbyAccommodations: SimilarAccommodation[];
  location: Location | null;
  loadingNearbyMapData: boolean;
}

// Helper to determine icon based on takeaway text (copied from PropertyHeader)
// Note: This helper is defined but not currently used in the OverviewSection JSX below.
// It might be intended for the takeaway items, but they currently have a dark background.
const getTakeawayIcon = (text: string) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('safe') || lowerText.includes('good') || lowerText.includes('quiet') || lowerText.includes('well-lit') || lowerText.includes('positive')) {
        return <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />;
    }
    if (lowerText.includes('watch out') || lowerText.includes('risk') || lowerText.includes('avoid') || lowerText.includes('noise') || lowerText.includes('concern') || lowerText.includes('harassment')) {
        return <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />;
    }
    return <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />; // Default icon
};

export const OverviewSection = ({
  takeaways,
  alternatives,
  currentAccommodation,
  currentMetrics,
  currentScore,
  allNearbyAccommodations,
  location,
  loadingNearbyMapData,
}: OverviewSectionProps) => {
  const hasTakeaways = takeaways && takeaways.length > 0;

  return (
    <div>

      {/* Safer Alternatives Section (Horizontally Scrollable) */}
      <div className="mb-6">
          <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Safer Nearby Alternatives</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Similar properties nearby with significantly better safety scores.
                  </p>
                </div>
              </div>
            </div>
            {/* SaferAlternativesSection likely needs internal handling for layout/scrolling */}
            <div className="bg-gray-50 p-4 sm:p-6 rounded-b-xl shadow-sm">
                <SaferAlternativesSection
                  alternatives={alternatives}
                  currentScore={currentScore}
                  currentMetrics={currentMetrics}
                />
            </div>
      </div>

      {/* Map Section */}
      <div className="mb-6">
        <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
          <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
            <div className="ml-4 mt-4">
              <h3 className="text-base font-semibold text-gray-900">Map</h3>
              <p className="mt-1 text-sm text-gray-500">
                Property location and nearby accommodations.
              </p>
            </div>
          </div>
        </div>
        <div
          className="h-[500px] bg-white rounded-b-xl shadow-sm overflow-hidden relative"
          // Removed inline style for height as className="h-[500px]" achieves the same
        >
          {/* Loading Overlay - This handles the loadingNearbyMapData state */}
          {loadingNearbyMapData && (
             <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm">
                <div className="text-center">
                    <svg className="animate-spin h-8 w-8 text-gray-500 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Loading map data...</p>
                </div>
             </div>
          )}

          {/* Map Rendering Logic */}
          {/* Show map or fallback message based on location */}
          {!loadingNearbyMapData && location ? ( // Check location is available *and* map data is not loading
              <Suspense fallback={<MapLoadingPlaceholder />}>
                <LazyMapView
                  // Pass necessary props to your MapView component
                  location={location}
                  currentAccommodation={currentAccommodation}
                  similarAccommodations={allNearbyAccommodations}
                  // Add any other props your MapView needs e.g., zoom level
                />
              </Suspense>
          ) : !loadingNearbyMapData && !location ? ( // If not loading, but location is missing
             <div className="h-full bg-gray-100 flex items-center justify-center">
                <p className="text-gray-500">Location coordinates not available for map.</p>
             </div>
          ) : null /* Don't show location error if still loading map data */ }
        </div>
      </div>

    </div>
  );
};