'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { parseAccommodationURL } from '@/lib/utils/url'

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

// Read the base URL for the Next.js app (for redirects *within* the app if needed, like from localhost)
const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://trustplacev3-one.vercel.app';
if (!process.env.NEXT_PUBLIC_APP_BASE_URL) {
    console.warn("NEXT_PUBLIC_APP_BASE_URL environment variable is not set. Falling back to 'https://trustplacev3-one.vercel.app'.");
}

// Read the base URL for the WordPress site (for external redirects on error)
const wordpressUrl = process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://trustplace.app';
if (!process.env.NEXT_PUBLIC_WORDPRESS_URL) {
    console.warn("NEXT_PUBLIC_WORDPRESS_URL environment variable is not set. Falling back to 'https://trustplace.app'.");
}

export const URLProcessor = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialUrlParam = searchParams.get('url') // Check param immediately

  // If we have a URL parameter, redirect immediately to the correct domain
  useEffect(() => {
    if (initialUrlParam) {
      const currentUrl = window.location.href;
      // Only redirect if we're on localhost
      if (currentUrl.includes('localhost')) {
        const targetUrl = `${appBaseUrl}/?url=${encodeURIComponent(initialUrlParam)}`;
        window.location.href = targetUrl;
        return;
      }
    }
  }, [initialUrlParam]);

  // Initialize state based on the param presence
  const [url, setUrl] = useState(initialUrlParam || '')
  // isLoading controls the "Processing..." button text & disabled state
  const [isLoading, setIsLoading] = useState(!!initialUrlParam)
  // isProcessingParam specifically tracks if we are auto-processing the URL param
  const [isProcessingParam, setIsProcessingParam] = useState(!!initialUrlParam);

  const handleUrlProcessing = async (urlToProcess: string) => {
    if (!urlToProcess.trim()) {
      // Redirect immediately if URL is empty on manual submit (unlikely if triggered by param)
      window.location.href = `${wordpressUrl}?error=empty_input`;
      return;
    }

    // Ensure loading states are true when processing starts
    // No need to reset error state as we redirect externally
    setIsLoading(true)
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
        // --- Redirect on Invalid URL --- //
        console.error('Invalid URL format:', urlToProcess);
        window.location.href = `${wordpressUrl}?error=invalid_url`;
        return; // Stop execution
        // --- End Redirect --- //
      } else {
        console.log('Sending to API:', parsedUrl)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // Keep timeout

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
              // --- Redirect on 404 Not Found --- //
              console.log('Accommodation not found, redirecting.');
              window.location.href = `${wordpressUrl}?error=not_found`;
              return; // Stop execution
              // --- End Redirect --- //
            } else {
              // --- Redirect on other API errors --- //
              console.error('API Error:', response.status, data.error);
              window.location.href = `${wordpressUrl}?error=processing_failed&status=${response.status}`;
              return; // Stop execution
              // --- End Redirect --- //
            }
          } else {
            const data = await response.json()
            console.log('API Response:', data)
            if (data.reportId) {
              navigated = true;
              // Redirect to the production safety report page using appBaseUrl
              const redirectUrl = `${appBaseUrl}/safety-report/${data.reportId}`;
              console.log('Redirecting to safety report:', redirectUrl);
              window.location.href = redirectUrl;
            } else {
              // --- Redirect if API succeeds but no reportId --- //
              console.error('API success, but no reportId returned.');
              window.location.href = `${wordpressUrl}?error=no_report_id`;
              return; // Stop execution
              // --- End Redirect --- //
            }
          }
        } catch (fetchError: unknown) {
          clearTimeout(timeoutId)
          let errorCode = 'network_error';
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error('Request timed out');
            errorCode = 'timeout';
          } else {
            console.error('Fetch error:', fetchError)
          }
          // --- Redirect on Fetch Error --- //
          window.location.href = `${wordpressUrl}?error=${errorCode}`;
          return; // Stop execution
          // --- End Redirect --- //
        }
      }
    } catch (error) {
      console.error('Error in handleUrlProcessing:', error)
      // --- Redirect on Unexpected Error --- //
      window.location.href = `${wordpressUrl}?error=unknown`;
      return; // Stop execution
      // --- End Redirect --- //
    } finally {
      // Only stop loading if we didn't navigate/redirect away
      // This might be redundant now as most paths redirect, but keep for safety
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isProcessingParam || isLoading) return; // Prevent submit if already processing
    handleUrlProcessing(url)
  }

  // Show Loading State if processing parameter or form submission
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