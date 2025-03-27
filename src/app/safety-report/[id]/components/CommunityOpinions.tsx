// src/app/safety-report/[id]/components/CommunityOpinions.tsx
'use client'

import React, { useState, useEffect } from 'react';
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import Link from 'next/link';

// --- Types ---
interface TakeawaysData {
  positive_takeaway: string | null;
  negative_takeaway: string | null;
}

interface CommunityOpinionsProps {
  reportId: string;
  isAuthenticated: boolean;
}

// --- Styled Components ---
const Tabs = TabsPrimitive.Root;
const TabsList = TabsPrimitive.List;
const TabsTrigger = TabsPrimitive.Trigger;
const TabsContent = TabsPrimitive.Content;

// --- Helpers ---
const preprocessTakeaway = (text: string | null | undefined): string[] => {
    if (!text) return [];
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0 && line !== '✓' && line !== '⚠️');
};

const stripPrefix = (line: string): string => {
    return line.replace(/^✓\s*/, '').replace(/^⚠️\s*/, '').trim();
};

// --- Loading / Empty / Auth States ---
const TakeawaysLoadingSkeleton = () => (
    <div className="space-y-4 p-1">
        <Skeleton className="h-10 w-full rounded-md" /> {/* Simulate TabsList */}
        <Skeleton className="h-16 w-full rounded-lg mt-4" />
        <Skeleton className="h-16 w-full rounded-lg" />
    </div>
);

const SignUpPrompt = () => (
     <div className="relative bg-white rounded-xl p-6 shadow-sm overflow-hidden border border-gray-200">
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 to-gray-100/90 backdrop-blur-md z-10 flex items-center justify-center p-4">
            <div className="text-center p-6 bg-white rounded-lg shadow-xl border border-gray-200 max-w-md">
                 <MessageSquare className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                 <h3 className="text-lg font-semibold text-gray-800 mb-2">Unlock Community Insights</h3>
                 <p className="text-sm text-gray-600 mb-4">Sign up or log in to see AI-powered safety takeaways from local discussions and experiences.</p>
                 {/* --- Link to your Login/Signup page --- */}
                 <Link href="/auth/login" passHref>
                     <Button className="w-full py-2">
                        Sign Up / Log In
                     </Button>
                 </Link>
            </div>
        </div>
        {/* Blurred background content (Placeholder UI) */}
        <div className="blur-sm pointer-events-none select-none opacity-60">
             <h3 className="text-lg font-semibold text-gray-500 mb-4">Community Safety Takeaways</h3>
             <div className="rounded-lg bg-gray-50 p-0.5">
                 <div className="h-10 w-full bg-gray-200 rounded-md mb-4"></div> {/* TabsList placeholder */}
                 <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-emerald-50/50 rounded-lg">
                         <CheckCircle className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                         <div className="space-y-1">
                            <div className="h-3 w-3/4 bg-gray-300 rounded"></div>
                            <div className="h-3 w-1/2 bg-gray-300 rounded"></div>
                         </div>
                    </div>
                     <div className="flex items-start gap-3 p-3 bg-rose-50/50 rounded-lg">
                         <AlertTriangle className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <div className="h-3 w-3/4 bg-gray-300 rounded"></div>
                         </div>
                    </div>
                 </div>
            </div>
        </div>
    </div>
);


// --- Main Component ---
export const CommunityOpinions = ({ reportId, isAuthenticated }: CommunityOpinionsProps) => {
  const [takeaways, setTakeaways] = useState<TakeawaysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'cache' | 'generated' | null>(null); // Track if from cache

  useEffect(() => {
    // If not authenticated, show prompt immediately, don't fetch.
    if (!isAuthenticated) {
      setLoading(false);
      setError(null);
      setTakeaways(null);
      return;
    }
    // If no reportId, don't fetch.
    if (!reportId) {
        setLoading(false);
        setError("Cannot load insights without a report ID.");
        setTakeaways(null);
        return;
    }

    const fetchTakeaways = async () => {
      setLoading(true);
      setError(null);
      setTakeaways(null);
      setSource(null);

      try {
        console.log(`Component: Fetching takeaways for reportId: ${reportId}`);
        const response = await fetch(`/api/reports/${reportId}/community-takeaways`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          console.error("Component: API fetch failed:", data.error || response.statusText);
          throw new Error(data.error || 'Failed to fetch community takeaways');
        }

        console.log(`Component: Received takeaways (Source: ${data.source})`);
        setTakeaways(data.takeaways);
        setSource(data.source);

      } catch (err: any) {
        console.error('Component: Error fetching takeaways:', err);
        setError(err.message || 'Could not load community insights.');
      } finally {
        setLoading(false);
      }
    };

    fetchTakeaways();
    // Dependency array: re-fetch if reportId changes OR user logs in/out
  }, [reportId, isAuthenticated]);

  // --- Render Logic ---

  if (!isAuthenticated) {
      return <SignUpPrompt />;
  }

  const positivePoints = preprocessTakeaway(takeaways?.positive_takeaway);
  const negativePoints = preprocessTakeaway(takeaways?.negative_takeaway);
  const hasPositive = positivePoints.length > 0;
  const hasNegative = negativePoints.length > 0;
  const noTakeawaysFound = !loading && !error && takeaways && !hasPositive && !hasNegative;
  // Default to positive tab if available, otherwise negative if available, otherwise positive
  const defaultTab = hasPositive ? "positive" : (hasNegative ? "negative" : "positive");

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
       <h3 className="text-lg font-semibold text-gray-900 mb-4">Community Safety Takeaways</h3>

        {loading && <TakeawaysLoadingSkeleton />}

        {error && !loading && (
           <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-center">
             <p className="text-sm text-rose-700 font-medium">Could not load insights</p>
             <p className="text-xs text-rose-600 mt-1">{error}</p>
             {/* Optional: Add a retry button */}
           </div>
        )}

        {noTakeawaysFound && (
             <div className="text-center py-6 px-4 bg-gray-50 rounded-lg border border-gray-100">
                <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">No specific safety themes found</p>
                <p className="text-xs text-gray-500 mt-1">AI analysis of recent community discussions for this area didn't identify recurring safety points.</p>
             </div>
        )}

        {!loading && !error && takeaways && (hasPositive || hasNegative) && (
            <div className="rounded-lg bg-gray-100/60 p-1"> {/* Lighter background for Tabs */}
                 <Tabs defaultValue={defaultTab} className="w-full">
                     <TabsList className="w-full grid grid-cols-2 bg-gray-200/70 rounded-md p-1 h-auto">
                         <TabsTrigger
                             value="positive"
                             disabled={!hasPositive}
                             className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-[5px] data-[disabled]:opacity-50 data-[disabled]:pointer-events-none transition-colors"
                         >
                             <CheckCircle className={`h-4 w-4 flex-shrink-0 ${hasPositive ? 'text-emerald-600' : 'text-gray-400'}`} />
                             <span>What's Good</span>
                             {hasPositive && <span className="text-gray-500 text-xs">({positivePoints.length})</span>}
                         </TabsTrigger>
                         <TabsTrigger
                             value="negative"
                             disabled={!hasNegative}
                             className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-[5px] data-[disabled]:opacity-50 data-[disabled]:pointer-events-none transition-colors"
                         >
                             <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${hasNegative ? 'text-rose-600' : 'text-gray-400'}`} />
                             <span>Watch Out For</span>
                              {hasNegative && <span className="text-gray-500 text-xs">({negativePoints.length})</span>}
                         </TabsTrigger>
                     </TabsList>

                     {/* Positive Content */}
                     <TabsContent value="positive" className="mt-4 px-0.5 sm:px-1">
                         {hasPositive ? (
                            <div className="space-y-2.5">
                                {positivePoints.map((point, index) => (
                                    <div key={`pos-${index}`} className="flex items-start gap-2.5 p-3 bg-emerald-50/80 rounded-lg border border-emerald-100/80 shadow-sm">
                                        <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                                        <p className="text-sm text-emerald-800 leading-relaxed">{stripPrefix(point)}</p>
                                    </div>
                                ))}
                            </div>
                         ) : (
                            <p className="text-sm text-gray-500 italic text-center py-6 px-3">No positive safety takeaways identified from recent community discussions in this area.</p>
                         )}
                     </TabsContent>

                     {/* Negative Content */}
                     <TabsContent value="negative" className="mt-4 px-0.5 sm:px-1">
                          {hasNegative ? (
                            <div className="space-y-2.5">
                                {negativePoints.map((point, index) => (
                                    <div key={`neg-${index}`} className="flex items-start gap-2.5 p-3 bg-rose-50/80 rounded-lg border border-rose-100/80 shadow-sm">
                                        <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                                        <p className="text-sm text-rose-800 leading-relaxed">{stripPrefix(point)}</p>
                                    </div>
                                ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 italic text-center py-6 px-3">No specific safety concerns identified from recent community discussions in this area.</p>
                          )}
                     </TabsContent>
                 </Tabs>
            </div>
        )}
         {/* Optional: Display source and timestamp */}
         {/* {source && <p className="text-xs text-gray-400 text-right mt-2">Source: {source}</p>} */}
    </div>
  );
};