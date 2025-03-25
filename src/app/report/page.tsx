import { Suspense } from 'react'
import { requireAuth } from '@/lib/supabase/server-auth'
import { redirect } from 'next/navigation'

// Loading component for Suspense fallback
function ReportLoading() {
  return (
    <div className="container mx-auto px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
}

// Server Component with authentication check
export default async function ReportPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  try {
    // This will redirect to sign-in if user is not authenticated
    const user = await requireAuth()
    
    // Get listing ID from search params (if available)
    const listingId = searchParams.id as string

    if (!listingId) {
      // If no listing ID is provided, redirect to safety report search
      redirect('/safety-report')
    }

    return (
      <div className="container mx-auto px-4 py-10">
        <Suspense fallback={<ReportLoading />}>
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Safety Report</h1>
            <p className="text-muted-foreground">
              Viewing report for listing ID: {listingId}
            </p>
            <div className="p-6 bg-white rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Report Details</h2>
              {/* Report content would go here */}
              <p>User email: {user.email}</p>
            </div>
          </div>
        </Suspense>
      </div>
    )
  } catch (error) {
    console.error('Error in report page:', error)
    return (
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-red-600">Error</h1>
        <p>There was an error loading this report. Please try again later.</p>
      </div>
    )
  }
} 