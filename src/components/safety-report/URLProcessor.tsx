'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { parseAccommodationURL } from '@/lib/utils/url'

export const URLProcessor = () => {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      console.log('Processing URL:', url)
      const parsedUrl = parseAccommodationURL(url)
      console.log('Parsed URL:', parsedUrl)
      
      if (!parsedUrl) {
        toast.error('Invalid URL', {
          description: 'Please enter a valid Airbnb or Booking.com URL'
        })
        setIsLoading(false)
        return
      }

      console.log('Sending to API:', parsedUrl)
      const response = await fetch('/api/process-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parsedUrl)
      })

      const data = await response.json()
      console.log('API Response:', data)

      if (!response.ok) {
        if (response.status === 404) {
          toast.error(data.error, {
            description: 'We only have data for certain accommodations in Los Angeles at the moment.'
          })
        } else {
          toast.error('Failed to process URL')
        }
        setIsLoading(false)
        return
      }

      router.push(`/safety-report/${data.reportId}`)
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