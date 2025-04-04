import { AppNavbar } from '@/app/components/navbar'
import { Loader2 } from 'lucide-react' // Import a spinner icon

// Reusable Loading Indicator Component
const CenteredLoadingIndicator = () => {
  return (
    <div className="flex flex-col items-center justify-center space-y-3 text-primary pt-16">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      <span className="text-lg font-medium text-gray-700">
        Analyzing location safety data...
      </span>
      <p className="text-sm text-gray-500">Please wait while we gather the latest information.</p>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavbar />

      {/* Centered containedddr for the loading indicator */}
      <div className="flex items-center justify-center pt-20 pb-20">
         <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
            <div className="mx-auto max-w-5xl">
               <CenteredLoadingIndicator />
            </div>
         </div>
      </div>
    </div>
  )
} 