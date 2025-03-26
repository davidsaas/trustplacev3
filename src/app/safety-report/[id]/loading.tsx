import { AppNavbar } from '@/app/components/navbar'

const LoadingMessage = () => {
  return (
    <div className="flex items-center justify-center space-x-2 text-primary">
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-600"></div>
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-600" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-600" style={{ animationDelay: '0.4s' }}></div>
      <span className="text-lg font-medium">Analyzing location safety data...</span>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavbar />
      
      <div className="pt-20 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-10">
            {/* Property Header Skeleton */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="h-[300px] bg-gray-200 animate-pulse" />
              <div className="p-6 space-y-4">
                <div className="h-8 w-3/4 bg-gray-200 animate-pulse rounded-lg" />
                <div className="flex space-x-4">
                  <div className="h-6 w-24 bg-gray-200 animate-pulse rounded-lg" />
                  <div className="h-6 w-24 bg-gray-200 animate-pulse rounded-lg" />
                </div>
              </div>
            </div>

            {/* Loading Message */}
            <div className="py-8">
              <LoadingMessage />
            </div>

            {/* Map Skeleton */}
            <div className="h-[400px] bg-gray-100 rounded-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 to-gray-300 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            </div>

            {/* Safety Analysis Skeleton */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
                <div className="h-6 w-48 bg-gray-200 animate-pulse rounded-lg" />
                <div className="mt-2 h-4 w-64 bg-gray-200 animate-pulse rounded-lg" />
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-3">
                      <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 bg-gray-200 animate-pulse rounded-full" />
                        <div className="h-6 w-32 bg-gray-200 animate-pulse rounded-lg" />
                      </div>
                      <div className="h-2 w-full bg-gray-200 animate-pulse rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Community Feedback Skeleton */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
                <div className="h-6 w-48 bg-gray-200 animate-pulse rounded-lg" />
                <div className="mt-2 h-4 w-64 bg-gray-200 animate-pulse rounded-lg" />
              </div>
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 bg-gray-200 animate-pulse rounded-full" />
                      <div className="h-4 w-32 bg-gray-200 animate-pulse rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded-lg" />
                      <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 