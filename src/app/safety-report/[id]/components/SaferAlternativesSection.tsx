import { create_file } from '/Users/davidpelan/trustplacev3/src/app/safety-report/[id]/components/SaferAlternativesSection.tsx';
import { edit_file } from '/Users/davidpelan/trustplacev3/src/app/safety-report/[id]/components/SaferAlternativesSection.tsx';

// Create the file src/app/safety-report/[id]/components/SaferAlternativesSection.tsx
// Then, add the following content:
// src/app/safety-report/[id]/components/SaferAlternativesSection.tsx
'use client'

import React from 'react';
import { ImageOff } from 'lucide-react';
import type { SimilarAccommodation } from '@/types/safety-report';
import Link from 'next/link';

interface SaferAlternativesSectionProps {
  alternatives: SimilarAccommodation[] | null | undefined; // Allow null/undefined
  currentScore: number | null | undefined; // Allow null/undefined
}

export const SaferAlternativesSection = ({ alternatives, currentScore }: SaferAlternativesSectionProps) => {
  // Handle null or empty alternatives array
  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
        <p className="text-gray-500">No significantly safer alternatives found nearby matching the criteria.</p>
      </div>
    );
  }

  // Ensure currentScore is a number for comparison, default to 0 if null/undefined
  const safeCurrentScore = currentScore ?? 0;

  return (
    <div className="space-y-4">
      {alternatives.map((alt) => (
        <div key={alt.id} className="bg-white p-4 shadow-sm rounded-lg flex items-start space-x-4">
          {/* Thumbnail */}
          {alt.image_url ? (
            <img src={alt.image_url} alt={alt.name} className="w-20 h-20 object-cover rounded-md flex-shrink-0 bg-gray-100" />
          ) : (
            <div className="w-20 h-20 rounded-md flex-shrink-0 bg-gray-100 flex items-center justify-center" aria-label="Placeholder image">
              <ImageOff className="size-8 text-gray-300" aria-hidden="true" />
            </div>
          )}
          <div className="flex-grow min-w-0">
            <h4 className="font-semibold text-gray-800 truncate">{alt.name}</h4>
            <div className="text-sm text-gray-500 mt-1 flex items-center flex-wrap gap-x-3">
               {/* Score Difference - Ensure alt.overall_score is also valid */}
               {alt.overall_score != null && alt.overall_score > safeCurrentScore && (
                  <span className="font-medium text-green-600">
                    +{alt.overall_score - safeCurrentScore} pts safer
                  </span>
               )}
               {/* Distance */}
               <span>{(alt.distance ?? 0).toFixed(1)} km away</span>
               {/* Price */}
               {alt.price_per_night != null && <span>${alt.price_per_night}/night</span>}
               {/* Reliability */}
               {!alt.hasCompleteData && <span className="text-orange-600 text-xs">(Partial Data)</span>}
            </div>
          </div>
          {/* Use Link wrapping an anchor tag for external-like behavior (new tab) with Next.js routing benefits if needed later */}
          <Link
            href={`/safety-report/${alt.id}`}
            passHref
            legacyBehavior
          >
             <a
                target="_blank" // Open in new tab
                rel="noopener noreferrer" // Security for target="_blank"
                className="ml-auto flex-shrink-0 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                aria-label={`View safety report for ${alt.name}`} // Accessibility
             >
               View
             </a>
          </Link>
        </div>
      ))}
    </div>
  );
};

// Export the component
export default SaferAlternativesSection;
