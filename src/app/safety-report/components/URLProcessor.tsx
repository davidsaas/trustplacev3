'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { parseAccommodationURL } from '@/lib/utils/url'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

// Define or Import LoadingState component
const LoadingState = () => {
  return (
    <div className="text-center py-10">
       <svg className="animate-spin h-8 w-8 text-gray-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
       </svg>
      <p className="text-lg font-medium text-gray-700">Processing your link...</p>
      <p className="text-sm text-gray-500">Please wait while we find the safety report.</p>
    </div>
  )
}

export const URLProcessor = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialUrlParam = searchParams.get('url') // Check param immediately

  // Initialize state based on the param presence
  const [url, setUrl] = useState(initialUrlParam || '')
  // isLoading controls the "Processing..." button text & disabled state
  const [isLoading, setIsLoading] = useState(!!initialUrlParam)
  // isProcessingParam specifically tracks if we are auto-processing the URL param
  const [isProcessingParam, setIsProcessingParam] = useState(!!initialUrlParam);
  // --- New State ---
  const [showNotFoundError, setShowNotFoundError] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null); // Ref to store timer ID
  // --- End New State ---

  // Function to redirect to WordPress home
  const redirectToWordPressHome = () => {
     if (timerRef.current) {
       clearInterval(timerRef.current); // Clear timer if manually navigating
       timerRef.current = null;
     }
     window.location.href = 'https://trustplace.app'; // Use window.location for external redirect
  }

  const handleUrlProcessing = async (urlToProcess: string) => {
    if (!urlToProcess.trim()) {
      toast.error('Please enter a URL')
      setIsLoading(false); // Ensure loading stops if URL is empty
      setIsProcessingParam(false); // Reset param processing state
      return
    }

    // Ensure loading states are true when processing starts
    setIsLoading(true)
    setShowNotFoundError(false); // Reset error state on new processing
    let navigated = false; // Flag to track if navigation is initiated

    try {
      console.log('Processing URL:', urlToProcess)

      // Validate URL format
      let validUrl = urlToProcess
      if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
        validUrl = `https://${urlToProcess}`
      }

      const parsedUrl = parseAccommodationURL(validUrl)
      console.log('Parsed URL:', parsedUrl)

      if (!parsedUrl) {
        toast.error('Invalid URL', {
          description: 'Please enter a valid Airbnb or Booking.com URL'
        })
      } else {
        console.log('Sending to API:', parsedUrl)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        try {
          const response = await fetch('/api/process-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedUrl),
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Unknown error' }))
            if (response.status === 404) {
              console.log('Accommodation not found, showing custom error.');
              setShowNotFoundError(true); // Set state to show custom error page
            } else {
              toast.error(data.error || 'Failed to process URL')
            }
          } else {
            const data = await response.json()
            console.log('API Response:', data)
            if (data.reportId) {
              navigated = true;
              router.push(`/safety-report/${data.reportId}`)
            } else {
              toast.error('Could not generate report', {
                description: 'No valid report ID was returned'
              })
            }
          }
        } catch (fetchError: unknown) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            toast.error('Request timed out', { description: 'The server took too long to respond. Please try again later.' })
          } else {
            console.error('Fetch error:', fetchError)
            toast.error('Network error', { description: 'Please check your connection and try again' })
          }
        }
      }
    } catch (error) {
      console.error('Error in handleUrlProcessing:', error)
      toast.error('An unexpected error occurred while processing the URL.')
    } finally {
      if (!navigated) {
        setIsLoading(false)
        setIsProcessingParam(false);
      }
    }
  }

  // Effect to trigger processing only if the param was present on initial load
  useEffect(() => {
    // Check isProcessingParam state which was set based on initialUrlParam
    if (isProcessingParam && initialUrlParam) {
      console.log("Initial URL parameter detected, processing:", initialUrlParam)
      handleUrlProcessing(initialUrlParam)
    }
    // Intentionally run only once on mount if param exists, or handle manual submits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessingParam, initialUrlParam]); // Depends on the initial state

  // --- Countdown Timer Effect ---
  useEffect(() => {
    // Start timer only when the not found error should be shown
    if (showNotFoundError) {
      setCountdown(10); // Reset countdown to 10
      timerRef.current = setInterval(() => {
        setCountdown((prevCount) => {
          if (prevCount <= 1) {
            clearInterval(timerRef.current!); // Use non-null assertion as it's checked
            timerRef.current = null;
            redirectToWordPressHome(); // Redirect when timer hits 0
            return 0;
          }
          return prevCount - 1;
        });
      }, 1000); // Update every second
    }

    // Cleanup function: Clear interval if component unmounts or error state changes
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // Rerun effect when showNotFoundError changes
  }, [showNotFoundError]);
  // --- End Countdown Timer Effect ---

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isProcessingParam || isLoading) return; // Prevent submit if already processing
    handleUrlProcessing(url)
  }

  // --- Updated Conditional Rendering ---
  // 1. Show Not Found Error Page if state is true
  if (showNotFoundError) {
    return (
      <div className="text-center py-10 px-4">
        <ExclamationTriangleIcon
            className="mx-auto size-12 text-yellow-500"
            aria-hidden="true"
        />
        <h3 className="mt-2 text-lg font-semibold text-gray-900">Accommodation Not Found</h3>
        <p className="mt-1 text-sm text-gray-500">
            We only have data for certain accommodations in Los Angeles at the moment.
        </p>
        <div className="mt-6">
          <button
            onClick={redirectToWordPressHome}
            type="button"
            className="solid"
          >
            Back to Home
          </button>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Redirecting automatically in {countdown} second{countdown !== 1 ? 's' : ''}...
        </p>
      </div>
    );
  }

  // 2. Show Loading State if processing parameter or form submission
  if (isLoading || isProcessingParam) {
      return <LoadingState />;
  }

  // Otherwise, render the form for manual input
  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste Airbnb or Booking.com URL here"
          className="flex-1"
          required
          aria-label="Accommodation URL"
          disabled={isLoading} // Disable based on general loading state
        />
        <Button
          type="submit"
          disabled={isLoading} // Disable based on general loading state
          className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-medium py-2 px-6"
        >
          {/* Show Processing if general loading is true */}
          {isLoading ? 'Processing...' : 'Get Safety Report'}
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Enter a valid Airbnb or Booking.com listing URL to check if we have safety data
      </p>
    </form>
  )
}