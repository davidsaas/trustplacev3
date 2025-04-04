'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/shared/providers/auth-provider'

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

// Client Component with authentication check
function ReportContent() {
  const { user, loadingAuth } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const listingId = searchParams.get('id')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!loadingAuth) {
      if (!user) {
        // Redirect to sign-in if user is not authenticated
        router.push('/auth/sign-in')
      } else if (!listingId) {
        // If no listing ID is provided, redirect to safety report search
        router.push('/safety-report')
      } else {
        setIsChecking(false)
      }
    }
  }, [user, loadingAuth, router, listingId])

  if (loadingAuth || isChecking) {
    return <ReportLoading />
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Safety Report</h1>
        <p className="text-muted-foreground">
          Viewing report for listing ID: {listingId}
        </p>
        <div className="p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Report Details</h2>
          {/* Report content would go here */}
          <p>User email: {user?.email}</p>
        </div>
      </div>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<ReportLoading />}>
      <ReportContent />
    </Suspense>
  )
} 