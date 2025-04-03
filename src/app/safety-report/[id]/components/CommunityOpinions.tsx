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
  <svg className="size-10 rounded-full bg-gray-100 p-2" viewBox="0 0 20 20" fill="#FF4500">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
  </svg>
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

                  <div className="mt-4 text-sm/6 text-gray-500 whitespace-pre-wrap break-words">
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