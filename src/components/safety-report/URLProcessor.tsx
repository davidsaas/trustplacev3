'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type ValidationResult = {
  isValid: boolean
  platform?: 'airbnb' | 'booking'
}

type ProcessURLResponse = {
  success: boolean
  reportId?: string
  error?: string
}

const validateURL = (url: string): ValidationResult => {
  const airbnbRegex = /^https?:\/\/(www\.)?airbnb\.[a-z]+\/rooms\/\d+/i
  const bookingRegex = /^https?:\/\/(www\.)?booking\.com\/hotel/i

  if (airbnbRegex.test(url)) {
    return { isValid: true, platform: 'airbnb' }
  }

  if (bookingRegex.test(url)) {
    return { isValid: true, platform: 'booking' }
  }

  return { isValid: false }
}

const processURL = async (url: string): Promise<ProcessURLResponse> => {
  try {
    const validation = validateURL(url)
    if (!validation.isValid) {
      return { success: false, error: 'Invalid URL' }
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
    return { success: true, reportId: data.id }
  } catch (error) {
    return { success: false, error: 'Failed to process URL' }
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
      const validation = validateURL(url)
      
      if (!validation.isValid) {
        toast.error('Please enter a valid Airbnb or Booking.com URL')
        return
      }

      const response = await processURL(url)
      if (response.success) {
        router.push(`/safety-report/${response.reportId}`)
      }
    } catch {
      setIsLoading(false)
      toast.error('Failed to process URL')
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
        Enter a valid Airbnb or Booking.com listing URL to generate a safety report
      </p>
    </form>
  )
} 