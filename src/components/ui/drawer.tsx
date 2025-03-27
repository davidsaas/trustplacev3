'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useEffect, useState } from 'react'
// Import the type directly from the hook's file if possible, or ensure definitions match
// Assuming we can't import, let's redefine it accurately here.
// import { type SavedAccommodation } from '@/hooks/use-accommodations-saved'; // Ideal if possible
import { useAccommodationsSaved } from '@/hooks/use-accommodations-saved'
import { SavedButton } from '@/app/safety-report/components/SavedButton'
import { Loader2, ImageIcon } from 'lucide-react' // Removed ShieldCheck

// Updated interface: Removed safetyScore
interface SavedAccommodation {
  id: string;
  accommodation_id: string;
  name: string;
  source: string;
  url: string;
  imageUrl?: string;
  // safetyScore?: number; // Removed
}

// Removed formatScore helper function

export function SavedAccommodationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Destructure the exported fetch function
  const { saved, loading, fetchSavedAccommodations } = useAccommodationsSaved()
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (open && !hasFetched && fetchSavedAccommodations) {
      console.log("Drawer opened, fetching saved accommodations..."); // Debug log
      fetchSavedAccommodations();
      setHasFetched(true);
    }
    // Reset fetch status when drawer closes *only if* you want fresh data every time
    // Keeping hasFetched=true after first open might be desired for performance
    // if (!open) {
    //     setHasFetched(false);
    // }
  }, [open, hasFetched, fetchSavedAccommodations]);

  // Handle case where hook might not be ready yet
  if (!fetchSavedAccommodations) {
      return null; // Or a minimal loading state
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <DialogPanel
              transition
              className="pointer-events-auto w-screen max-w-md transform transition duration-500 ease-in-out data-closed:translate-x-full sm:duration-700"
            >
              <div className="flex h-full flex-col bg-white shadow-xl"> {/* Removed overflow-y-scroll here */}
                <div className="px-4 sm:px-6 py-6">
                  <div className="flex items-start justify-between">
                    <DialogTitle className="text-base font-semibold leading-6 text-gray-900">
                      Saved Accommodations
                    </DialogTitle>
                    <div className="ml-3 flex h-7 items-center">
                      <button
                        type="button"
                        onClick={onClose}
                        className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        <span className="absolute -inset-2.5" />
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon aria-hidden="true" className="size-6" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="border-b border-gray-200"></div>
                {/* Content Section - Added overflow-y-auto here */}
                <div className="relative flex-1 px-4 sm:px-6 py-6 overflow-y-auto">
                  {/* Show loading only when loading state is true */}
                  {loading ? (
                    <div className="flex justify-center items-center pt-10"> {/* Added padding top */}
                      <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                    </div>
                  // Check saved length only after loading is false
                  ) : !saved || saved.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center mt-10">
                      Your saved accommodations will appear here.
                    </p>
                  ) : (
                    <ul role="list" className="space-y-4">
                      {/* Type assertion should now be correct */}
                      {saved.map((accommodation: SavedAccommodation) => (
                        <li key={accommodation.id} className="flex items-center justify-between gap-4">
                          <Link
                            href={accommodation.url} // url is now guaranteed string
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 group flex-1 min-w-0 p-2 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex-shrink-0 h-12 w-16 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                              {accommodation.imageUrl ? (
                                <img
                                  src={accommodation.imageUrl}
                                  alt="" // Alt text is decorative here as name is linked
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="h-6 w-6 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {/* Removed score display */}
                              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                                {accommodation.name}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                {accommodation.source}
                              </p>
                            </div>
                          </Link>
                          <div className="flex-shrink-0 pr-1">
                            <SavedButton
                              accommodationId={accommodation.accommodation_id}
                              accommodationName={accommodation.name}
                              source={accommodation.source}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
