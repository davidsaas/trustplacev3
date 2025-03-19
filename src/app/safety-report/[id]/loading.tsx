import { Card } from '@/components/ui/card'

export default function Loading() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-8 animate-pulse">
        {/* Header Skeleton */}
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Safety Metrics Skeleton */}
          <Card className="p-6 space-y-6">
            <div className="h-8 w-48 bg-gray-200 rounded-lg" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded-lg" />
                  <div className="h-2 w-full bg-gray-200 rounded-lg" />
                </div>
              ))}
            </div>
          </Card>

          {/* Map Skeleton */}
          <Card className="p-6">
            <div className="h-8 w-32 bg-gray-200 rounded-lg mb-4" />
            <div className="h-[400px] bg-gray-200 rounded-lg" />
          </Card>
        </div>

        {/* Community Opinions Skeleton */}
        <Card className="p-6">
          <div className="h-8 w-48 bg-gray-200 rounded-lg mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border rounded-lg space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 rounded-lg" />
                <div className="h-4 w-1/2 bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  )
} 