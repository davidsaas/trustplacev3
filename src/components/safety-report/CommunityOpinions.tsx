'use client'

import { Card } from '@/components/ui/card'
import { MOCK_COMMUNITY_OPINIONS } from '@/lib/mock/safety-report'
import { format } from 'date-fns'

const getSentimentColor = (sentiment: 'positive' | 'negative' | 'neutral') => {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'negative':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

export const CommunityOpinions = () => {
  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Community Opinions</h2>
      <div className="space-y-4">
        {MOCK_COMMUNITY_OPINIONS.map((opinion) => (
          <div 
            key={opinion.id}
            className={`p-4 rounded-lg border ${getSentimentColor(opinion.sentiment)}`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-current">
                {opinion.source === 'reddit' ? 'Reddit' : 'Local Review'}
              </span>
              <time className="text-sm text-gray-500">
                {format(new Date(opinion.date), 'MMM d, yyyy')}
              </time>
            </div>
            <p className="text-sm">{opinion.content}</p>
          </div>
        ))}
      </div>
    </Card>
  )
} 