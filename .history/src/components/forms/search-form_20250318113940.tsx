import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export const SearchForm = () => {
  const [url, setUrl] = useState('')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    // Encode the URL for safe transmission
    const encodedUrl = encodeURIComponent(url)
    router.push(`/dashboard?url=${encodedUrl}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste your Airbnb or Booking.com listing URL"
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <Button type="submit">
          Get Safety Report
        </Button>
      </div>
    </form>
  )
} 