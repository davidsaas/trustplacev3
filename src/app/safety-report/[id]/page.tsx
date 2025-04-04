// src/app/safety-report/[id]/page.tsx
'use client'

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { notFound } from 'next/navigation'
import { SafetyMetrics } from '../components/SafetyMetrics'
import { CommunityOpinions } from './components/CommunityOpinions'
// Removed: import { supabaseServer } from '@/lib/supabase/server'
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, SAFETY_RADIUS } from '../constants' // Keep needed constants
import { isValidCoordinates } from '../utils' // Keep needed utils
import Loading from './loading'
import { AppNavbar } from '@/app/components/navbar'
import { OverviewSection } from './components/OverviewSection'
import type { ReportSection, ExtendedReportSection } from './components/ReportNavMenu'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { OSMInsights } from '../components/OSMInsights'
import type { OSMInsightsResponse } from '@/app/api/osm-insights/route'
import { ImageOff, MessageSquare } from 'lucide-react'
import { SaferAlternativesSection } from './components/SaferAlternativesSection';
import PaidContentGuard from '@/app/components/billing/PaidContentGuard';
import { Button } from '@/components/ui/button'; // Import Button for Load More

// Import Server Actions
import {
  getReportDataAction,
  findSimilarAccommodationsAction,
  fetchAllNearbyAccommodationsAction,
  getCommunityOpinionsAction,
  getCommunityOpinionsCountAction
} from '../actions';

// Import Types (ensure CommunityOpinion is correctly typed or imported if needed locally)
import type {
  SafetyReportProps,
  SafetyMetric,
  Location,
  AccommodationData, // This will be the type returned by getReportDataAction
  SimilarAccommodation,
  // CommunityOpinion type is defined in its component, actions.ts imports it from there
} from '@/types/safety-report'
import type { CommunityOpinion } from './components/CommunityOpinions'; // Explicit import

// Type returned by getReportDataAction (excluding similar_accommodations)
type AccommodationReportCoreData = Omit<AccommodationData, 'similar_accommodations'>;


// Lazily import MapView
const LazyMapView = lazy(() => import('../components/MapView').then(module => ({ default: module.MapView })));

// --- Helper Function for Background Gradient (Keep as is) ---
const getGradientBackgroundStyle = (score: number): React.CSSProperties => {
  const normalizedScore = Math.max(0, Math.min(100, score)) / 100;
  let hue: number, saturation: number, lightness: number, startOpacity: number = 0.25, midOpacity: number = 0.08;
  if (normalizedScore < 0.4) { hue = 0; saturation = 90; lightness = 50; startOpacity = 0.40; midOpacity = 0.0; }
  else if (normalizedScore < 0.7) { hue = 35; saturation = 95; lightness = 50; startOpacity = 0.40; midOpacity = 0.00; }
  else { hue = 120; saturation = 70; lightness = 40; startOpacity = 0.40; midOpacity = 0.0; }
  const startColor = `hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${startOpacity})`;
  const midColor = `hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${midOpacity})`;
  const endColor = 'transparent';
  return { backgroundImage: `linear-gradient(to bottom, ${startColor} 0%, ${midColor} 50%, ${endColor} 100%)`, backgroundAttachment: 'fixed', backgroundRepeat: 'no-repeat' };
};
// ----------------------------------------------

export default function SafetyReportPage({ params }: SafetyReportProps) {
  const { id: accommodationId } = params;
  const { user, loadingAuth } = useAuth(); // Get user for potential conditional logic

  // --- State Variables ---
  const [reportData, setReportData] = useState<AccommodationReportCoreData | null>(null);
  const [similarAccommodations, setSimilarAccommodations] = useState<SimilarAccommodation[]>([]);
  const [nearbyAccommodations, setNearbyAccommodations] = useState<SimilarAccommodation[]>([]); // For map markers
  const [communityOpinions, setCommunityOpinions] = useState<CommunityOpinion[]>([]);
  const [totalOpinions, setTotalOpinions] = useState<number>(0);
  const [opinionsPage, setOpinionsPage] = useState<number>(1);
  const [osmInsights, setOsmInsights] = useState<OSMInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ExtendedReportSection>('overview');
  const [isLoadingOpinions, setIsLoadingOpinions] = useState(false);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [isLoadingOsm, setIsLoadingOsm] = useState(false);

  // --- Data Fetching Effect ---
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setReportData(null); // Reset data on ID change
    setSimilarAccommodations([]);
    setNearbyAccommodations([]);
    setCommunityOpinions([]);
    setTotalOpinions(0);
    setOpinionsPage(1);
    setOsmInsights(null);

    const loadInitialData = async () => {
      try {
        console.log(`[PageEffect] Fetching initial report data for ${accommodationId}...`);
        const data = await getReportDataAction(accommodationId);

        if (!isMounted) return;

        if (!data) {
          console.warn(`[PageEffect] No report data found for ${accommodationId}.`);
          setError('Accommodation data not found.');
          notFound(); // Or handle as an error state
          return;
        }

        console.log(`[PageEffect] Received initial report data for ${accommodationId}.`);
        setReportData(data);

        // Trigger secondary fetches *after* initial data is set
        // These are now handled by separate effects below triggered by reportData change

      } catch (err) {
        if (isMounted) {
          console.error('[PageEffect] Error loading initial report data:', err);
          setError(err instanceof Error ? err.message : 'Failed to load report data.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false); // Initial loading complete (even if secondary fetches start)
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
      console.log(`[PageEffect] Unmounting or ID changed from ${accommodationId}.`);
    };
  }, [accommodationId]); // Only re-run when the ID changes

  // --- Effect for Secondary Data Fetches (Triggered by reportData) ---
  useEffect(() => {
    if (!reportData || !reportData.location) {
      // Don't fetch secondary data if primary data or location is missing
      return;
    }

    let isMounted = true;
    const location = reportData.location; // Use validated location from reportData

    // Fetch OSM Insights
    const fetchOsm = async () => {
      setIsLoadingOsm(true);
      try {
        console.log(`[PageEffect Secondary] Fetching OSM insights for ${reportData.id}...`);
        const res = await fetch(`/api/osm-insights?lat=${location.lat}&lng=${location.lng}`);
        if (!res.ok) throw new Error(`OSM Insights fetch failed: ${res.statusText}`);
        const osmData: OSMInsightsResponse = await res.json();
        if (isMounted) setOsmInsights(osmData);
        console.log(`[PageEffect Secondary] Received OSM insights for ${reportData.id}.`);
      } catch (err) {
        console.error('[PageEffect Secondary] Error fetching OSM Insights:', err);
        if (isMounted) setOsmInsights(null); // Set to null on error
      } finally {
        if (isMounted) setIsLoadingOsm(false);
      }
    };

    // Fetch Nearby Accommodations (for map)
    const fetchNearby = async () => {
      setIsLoadingNearby(true);
      try {
        console.log(`[PageEffect Secondary] Fetching nearby accommodations for map for ${reportData.id}...`);
        const nearbyData = await fetchAllNearbyAccommodationsAction(location, reportData.id);
        if (isMounted) setNearbyAccommodations(nearbyData);
        console.log(`[PageEffect Secondary] Received ${nearbyData.length} nearby accommodations for ${reportData.id}.`);
      } catch (err) {
        console.error('[PageEffect Secondary] Error fetching nearby accommodations:', err);
        if (isMounted) setNearbyAccommodations([]);
      } finally {
        if (isMounted) setIsLoadingNearby(false);
      }
    };

    // Fetch Similar Accommodations (Safer Alternatives)
    const fetchSimilar = async () => {
        // Only fetch if score is valid
        if (reportData.overall_score > 0) {
            setIsLoadingSimilar(true);
            try {
                console.log(`[PageEffect Secondary] Fetching similar accommodations for ${reportData.id}...`);
                const similarData = await findSimilarAccommodationsAction({
                    id: reportData.id,
                    location: location,
                    price_per_night: reportData.price_per_night,
                    overall_score: reportData.overall_score,
                    property_type: reportData.property_type,
                    room_type: reportData.room_type,
                });
                if (isMounted) setSimilarAccommodations(similarData);
                console.log(`[PageEffect Secondary] Received ${similarData.length} similar accommodations for ${reportData.id}.`);
            } catch (err) {
                console.error('[PageEffect Secondary] Error fetching similar accommodations:', err);
                if (isMounted) setSimilarAccommodations([]);
            } finally {
                if (isMounted) setIsLoadingSimilar(false);
            }
        } else {
             console.log(`[PageEffect Secondary] Skipping similar accommodations fetch for ${reportData.id} due to zero score.`);
             if (isMounted) setSimilarAccommodations([]); // Ensure it's empty if skipped
        }
    };

    // Fetch Initial Community Opinions & Count
    const fetchOpinions = async () => {
      setIsLoadingOpinions(true);
      try {
        console.log(`[PageEffect Secondary] Fetching initial opinions and count for ${reportData.id}...`);
        const [opinionsData, countData] = await Promise.all([
          getCommunityOpinionsAction(reportData.id, 1, 5), // Fetch page 1
          getCommunityOpinionsCountAction(reportData.id)
        ]);
        if (isMounted) {
          setCommunityOpinions(opinionsData);
          setTotalOpinions(countData);
          setOpinionsPage(1); // Reset page number
        }
        console.log(`[PageEffect Secondary] Received ${opinionsData.length} opinions (total ${countData}) for ${reportData.id}.`);
      } catch (err) {
        console.error('[PageEffect Secondary] Error fetching community opinions:', err);
        if (isMounted) {
          setCommunityOpinions([]);
          setTotalOpinions(0);
        }
      } finally {
        if (isMounted) setIsLoadingOpinions(false);
      }
    };

    // Run fetches in parallel
    Promise.allSettled([
        fetchOsm(),
        fetchNearby(),
        fetchSimilar(),
        fetchOpinions()
    ]).then(results => {
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[PageEffect Secondary] Fetch ${index} failed:`, result.reason);
            }
        });
    });


    return () => {
      isMounted = false;
      console.log(`[PageEffect Secondary] Unmounting or reportData changed for ${reportData.id}.`);
    };
  }, [reportData]); // Re-run when reportData is loaded/changed

  // --- Handlers ---
  const handleSectionChange = useCallback((section: ExtendedReportSection) => {
    setActiveSection(section);
    // Optional: Scroll to section logic here
  }, []);

  const loadMoreOpinions = async () => {
    if (!reportData || isLoadingOpinions || communityOpinions.length >= totalOpinions) return;

    setIsLoadingOpinions(true);
    const nextPage = opinionsPage + 1;
    try {
      console.log(`[Page LoadMore] Fetching opinions page ${nextPage} for ${reportData.id}...`);
      const moreOpinions = await getCommunityOpinionsAction(reportData.id, nextPage, 5);
      setCommunityOpinions(prev => [...prev, ...moreOpinions]);
      setOpinionsPage(nextPage);
      console.log(`[Page LoadMore] Added ${moreOpinions.length} opinions for ${reportData.id}.`);
    } catch (err) {
      console.error('[Page LoadMore] Error fetching more opinions:', err);
      // Optionally show an error message to the user
    } finally {
      setIsLoadingOpinions(false);
    }
  };

  // --- Render Logic ---
  if (isLoading && !reportData) {
    // Show main loading state only during initial data fetch
    return <Loading />;
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppNavbar />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="text-center p-6 bg-red-50 border border-red-200 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Report</h2>
            <p className="text-red-600">{error}</p>
            {/* Optionally add a retry button */}
          </div>
        </div>
      </div>
    );
  }

  if (!reportData) {
     // Should be handled by loading or error state, but as a fallback
     return (
        <div className="flex flex-col min-h-screen">
          <AppNavbar />
          <div className="flex-grow flex items-center justify-center p-4">
            <p>Report data could not be loaded.</p>
          </div>
        </div>
      );
  }

  // Determine background style based on score
  const backgroundStyle = getGradientBackgroundStyle(reportData.overall_score);

  // --- Section Content Rendering ---
  const renderSectionContent = () => {
    // Ensure reportData is available before rendering sections that depend on it
    if (!reportData) return null;

    switch (activeSection) {
      case 'overview':
          return (
            <div key="overview" className="space-y-6">
              {/* Pass correct props to OverviewSection */}
              <OverviewSection
                takeaways={reportData.accommodation_takeaways}
                alternatives={similarAccommodations} // Pass similar for the alternatives part within overview
                currentAccommodation={{ // Pass minimal current accommodation info
                    id: reportData.id,
                    name: reportData.name,
                    overall_score: reportData.overall_score,
                    hasCompleteData: reportData.hasCompleteData
                }}
                currentMetrics={reportData.safety_metrics} // Pass current metrics
                currentScore={reportData.overall_score} // Pass current score
                currentPrice={reportData.price_per_night} // Pass current price
                allNearbyAccommodations={nearbyAccommodations} // Pass nearby for map markers
                location={reportData.location}
                loadingNearbyMapData={isLoadingNearby} // Pass correct loading prop name
              />
            </div>
          );
      case 'safety':
        return (
          <div key="safety">
            {/* Pass correct prop 'data' to SafetyMetrics */}
            <SafetyMetrics
              data={reportData.safety_metrics}
            />
          </div>
        );
      case 'neighborhood':
         return (
            <div key="neighborhood">
              <OSMInsights
                data={osmInsights}
                isLoading={isLoadingOsm}
              />
            </div>
          );
      case 'comments':
          return (
            <div key="comments">
              {/* Wrap CommunityOpinions with PaidContentGuard */}
              <PaidContentGuard>
                <CommunityOpinions
                  opinions={communityOpinions}
                  isLoading={isLoadingOpinions}
                  error={null} // Error handling can be refined
                />
                {/* Load More Button */}
                {communityOpinions.length < totalOpinions && !isLoadingOpinions && (
                  <div className="mt-4 text-center">
                    <Button onClick={loadMoreOpinions}>Load More Comments</Button>
                  </div>
                )}
              </PaidContentGuard>
            </div>
          );
      case 'activities':
        // Placeholder for Activities/POI section
        return (
          <div key="activities" className="p-4 bg-gray-100 rounded-lg text-center">
            <p className="text-gray-600">Points of Interest & Activities section coming soon.</p>
          </div>
        );
      case 'alternatives':
          return (
             <div className="bg-white rounded-b-xl shadow-sm p-4 sm:p-6">
                 {/* Wrap SaferAlternativesSection with PaidContentGuard */}
                 <PaidContentGuard>
                    {/* Pass correct props to SaferAlternativesSection */}
                    <SaferAlternativesSection
                        alternatives={similarAccommodations}
                        currentScore={reportData.overall_score}
                        currentMetrics={reportData.safety_metrics}
                        currentPrice={reportData.price_per_night}
                    />
                 </PaidContentGuard>
             </div>
          );
      default:
        return null;
    }
  };

  // --- Main Return ---
  return (
    <div style={backgroundStyle} className="flex flex-col min-h-screen">
      <AppNavbar />
      {/* Main content area */}
      <div className="pt-6 sm:pt-8">
        {/* Property Header */}
        <div className="mx-auto max-w-5xl">
                  <PropertyHeader
                    name={reportData.name}
                    price_per_night={reportData.price_per_night}
                    rating={reportData.rating}
                    total_reviews={reportData.total_reviews}
                    source={reportData.source}
                    image_url={reportData.image_url}
                    url={reportData.url ?? null} {/* Ensure url is not undefined */}
                    overall_score={reportData.overall_score}
                    property_type={reportData.property_type}
                    neighborhood={reportData.neighborhood}
                    location={reportData.location}
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    hasCompleteData={reportData.hasCompleteData}
                  />
        </div>

        {/* Section Content */}
        <div className="mx-auto max-w-5xl mt-6 sm:mt-8 pb-12">
          {renderSectionContent()}
        </div>
      </div>
    </div>
  );
}