'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type AccommodationURL = {
  platform: 'airbnb' | 'booking' | null
  isValid: boolean
}

const validateURL = (url: string): AccommodationURL => {
  const airbnbRegex = /^https?:\/\/(www\.)?airbnb\.[a-z]+\/rooms\/\d+/i
  const bookingRegex = /^https?:\/\/(www\.)?booking\.[a-z]+\/.+/i

  if (airbnbRegex.test(url)) {
    return { platform: 'airbnb', isValid: true }
  }
  if (bookingRegex.test(url)) {
    return { platform: 'booking', isValid: true }
  }
  return { platform: null, isValid: false }
}

export const URLProcessor = () => {
  const [url, setUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsProcessing(true)
    
    try {
      const validation = validateURL(url)

      if (!validation.isValid) {
        toast.error('Please enter a valid Airbnb or Booking.com URL')
        return
      }

      const response = await fetch('/api/process-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform: validation.platform })
      })

      if (!response.ok) {
        throw new Error('Failed to process URL')
      }

      const data = await response.json()
      router.push(`/safety-report/${data.id}`)
    } catch (error) {
      toast.error('Failed to process the URL. Please try again.')
    } finally {
      setIsProcessing(false)
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
          disabled={isProcessing}
        />
        <Button 
          type="submit" 
          disabled={isProcessing}
          className="w-full sm:w-auto"
        >
          {isProcessing ? 'Processing...' : 'Get Safety Report'}
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Enter a valid Airbnb or Booking.com listing URL to generate a safety report
      </p>
    </form>
  )
} 