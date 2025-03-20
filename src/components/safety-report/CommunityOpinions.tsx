'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { MOCK_COMMUNITY_OPINIONS } from '@/lib/mock/safety-report'
import { cn } from '@/lib/utils'

type Opinion = {
  id: string
  user_id: string
  content: string
  created_at: string
  user: {
    name: string
  }
}

type CommunityOpinionsProps = {
  reportId: string
}

const LoadingSkeleton = () => (
  <div className="border rounded-lg p-4 bg-white">
    <div className="flex justify-between items-start mb-2">
      <div className="h-4 bg-gray-200 rounded w-24" />
      <div className="h-4 bg-gray-200 rounded w-20" />
    </div>
    <div className="space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  </div>
)

export const CommunityOpinions = ({ reportId }: CommunityOpinionsProps) => {
  const [opinions, setOpinions] = useState<Opinion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API call with mock data
    const fetchOpinions = async () => {
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        setOpinions(MOCK_COMMUNITY_OPINIONS)
      } catch (error) {
        console.error('Error fetching opinions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchOpinions()
  }, [reportId])

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Community Opinions</h2>
      {loading ? (
        <div className="space-y-4 [&_*]:animate-pulse">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : opinions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          No community opinions yet. Be the first to share your experience!
        </p>
      ) : (
        <div className="space-y-4">
          {opinions.map((opinion) => (
            <div key={opinion.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium">{opinion.user.name}</span>
                <span className="text-sm text-gray-500">
                  {new Date(opinion.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-gray-600">{opinion.content}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
} 