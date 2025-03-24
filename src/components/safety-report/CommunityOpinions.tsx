'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { MOCK_COMMUNITY_OPINIONS } from '@/lib/mock/safety-report'
import { cn } from '@/lib/utils'
import { MessageSquare, User, Calendar, ThumbsUp } from 'lucide-react'

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
  <div className="rounded-xl p-4 bg-white border border-gray-100 shadow-sm">
    <div className="flex gap-3 mb-3">
      <div className="h-10 w-10 bg-gray-100 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-100 rounded w-24" />
        <div className="h-3 bg-gray-100 rounded w-32" />
      </div>
    </div>
    <div className="space-y-2 pl-13">
      <div className="h-4 bg-gray-100 rounded w-full" />
      <div className="h-4 bg-gray-100 rounded w-5/6" />
      <div className="h-4 bg-gray-100 rounded w-4/6" />
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
    <Card className="p-6 rounded-xl shadow-md overflow-hidden">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-blue-500" />
        <h2 className="text-xl font-semibold text-gray-900">Community Feedback</h2>
      </div>
      
      {loading ? (
        <div className="space-y-4 [&_*]:animate-pulse">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : opinions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No community feedback yet</p>
          <p className="text-sm text-gray-400">Be the first to share your experience!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {opinions.map((opinion) => {
            const date = new Date(opinion.created_at);
            const formattedDate = date.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            });
            
            return (
              <div key={opinion.id} className="p-4 rounded-xl bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm">
                <div className="flex gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">{opinion.user.name}</h3>
                      <div className="flex items-center text-xs text-gray-500 gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                    <p className="text-gray-600 mt-2">{opinion.content}</p>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>Helpful</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  )
} 