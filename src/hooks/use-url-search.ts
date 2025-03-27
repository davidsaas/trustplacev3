import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseAccommodationURL } from '@/lib/utils/url'

export const useUrlSearch = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSearchSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery || isLoading) return

    setIsLoading(true)

    try {
      const parsedUrl = parseAccommodationURL(searchQuery)

      if (!parsedUrl) {
        toast.error('Invalid URL', {
          description: 'Please enter a valid Airbnb or Booking.com URL.'
        })
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/process-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedUrl)
      })

      const data = await response.json()

      if (!response.ok) {
        // Provide a more unified error message
        const description = response.status === 404
          ? 'We couldn\'t find data for this specific accommodation URL. We currently support select properties.'
          : data.error || 'An error occurred while processing the URL.';
        toast.error('Failed to generate report', { description });
        setIsLoading(false)
        return
      }

      // Success: Navigate to the report page
      router.push(`/safety-report/${data.reportId}`)
      setSearchQuery('') // Clear search query on success

    } catch (error) {
      console.error('Error processing URL:', error)
      toast.error('Processing Error', {
        description: 'An unexpected error occurred. Please try again later.'
      })
    } finally {
      // Ensure loading is always set to false, even after navigation starts
      // Use a small timeout to allow navigation to potentially start
      setTimeout(() => setIsLoading(false), 100);
    }
  }, [searchQuery, isLoading, router])

  return {
    searchQuery,
    setSearchQuery,
    isLoading,
    handleSearchSubmit,
  }
} 