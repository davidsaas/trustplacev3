// src/app/safety-report/[id]/components/CommunityOpinions.tsx
'use client'

import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquare, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { StarIcon } from '@heroicons/react/20/solid';
// --- Types ---
export interface CommunityOpinion {
  id: string;
  external_id: string | null;
  url: string | null;
  username: string | null;
  body: string;
  source_created_at: string | null;
}

interface CommunityOpinionsProps {
  opinions: CommunityOpinion[] | null;
  isLoading: boolean;
  error: string | null;
}

// --- Loading / Empty / Auth States ---
const OpinionsLoadingSkeleton = () => (
    <div className="space-y-3 p-1">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-18 w-full rounded-lg" />
    </div>
);

// Add Reddit logo SVG component
const RedditLogo = () => (
  <div className="size-12 rounded-full p-2">
    <img src="/reddit.svg" alt="Reddit Logo" className="w-full h-full" />
  </div>
);

// --- Main Component ---
export const CommunityOpinions = ({
    opinions,
    isLoading,
    error
}: CommunityOpinionsProps) => {

  const hasOpinions = opinions && opinions.length > 0;
  const noDataFound = !isLoading && !error && !hasOpinions;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
       <h3 className="text-lg font-semibold text-gray-900 mb-4">Raw Community Comments</h3>

        {isLoading && <OpinionsLoadingSkeleton />}

        {error && !isLoading && (
           <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-center">
             <p className="text-sm text-rose-700 font-medium">Could not load comments</p>
             <p className="text-xs text-rose-600 mt-1">{error}</p>
           </div>
        )}

        {noDataFound && (
             <div className="text-center py-6 px-4 bg-gray-50 rounded-lg border border-gray-100">
                <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">No safety-related comments found</p>
                <p className="text-xs text-gray-500 mt-1">No recent safety-related comments were found for this specific area.</p>
             </div>
        )}


            {!isLoading && !error && hasOpinions && (
              <div className="-my-10">
                {opinions?.map((opinion, index) => (
                  <div key={opinion.id || `opinion-${index}`} className="flex space-x-4 text-sm text-gray-500">
                    <div className="flex-none py-10">
                      <RedditLogo />
                    </div>
                    <div className={`flex-1 py-10 ${index !== 0 ? 'border-t border-gray-200' : ''}`}>
                      <h3 className="font-medium text-gray-900">
                        {opinion.username || 'Anonymous Redditor'}
                      </h3>
                      <p>
                        <time dateTime={opinion.source_created_at || ''}>
                          {opinion.source_created_at
                            ? formatDistanceToNow(new Date(opinion.source_created_at), { addSuffix: true })
                            : 'Recently'}
                        </time>
                      </p>

                      <p className="sr-only">Community feedback</p>

                      <div className="mt-4 text-base text-gray-500 whitespace-pre-wrap break-words">
                        {opinion.body}
                      </div>

                      {opinion.url && (
                        <a
                          href={opinion.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                          aria-label={`View original comment by ${opinion.username || 'anonymous'}`}
                        >
                          View on Reddit <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
  );
};