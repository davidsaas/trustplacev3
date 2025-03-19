'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { parseAccommodationURL } from '@/lib/utils/url'

const processURL = async (url: string) => {
  try {
    console.log('Processing URL:', url)
    const parsedURL = parseAccommodationURL(url)
    console.log('Parsed URL:', parsedURL)
    
    if (!parsedURL) {
      return { success: false, error: 'Invalid URL format' }
    }

    const response = await fetch('/api/process-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: parsedURL.source,
        externalId: parsedURL.externalId
      })
    })

    const data = await response.json()
    console.log('API Response:', data)

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'This accommodation is not in our database yet', notFound: true }
      }
      throw new Error(data.error || 'Failed to process URL')
    }

    return { success: true, reportId: data.id }
  } catch (error) {
    console.error('Error in processURL:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to process URL' }
  }
}

export const URLProcessor = () => {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const response = await processURL(url)
      console.log('Process URL response:', response)
      
      if (!response.success) {
        if (response.notFound) {
          // Show a specific message for accommodations not in our database
          toast.error(response.error, {
            description: 'We only have data for certain accommodations in Los Angeles at the moment.'
          })
        } else {
          toast.error(response.error)
        }
        setIsLoading(false)
        return
      }

      router.push(`/safety-report/${response.reportId}`)
    } catch (error) {
      console.error('Error in handleSubmit:', error)
      toast.error('Failed to process URL')
      setIsLoading(false)
    }
  }

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
          disabled={isLoading}
        />
        <Button 
          type="submit" 
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? 'Processing...' : 'Get Safety Report'}
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Enter a valid Airbnb or Booking.com listing URL to check if we have safety data
      </p>
    </form>
  )
} 