'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function VerifyEmail() {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold mb-6">Check your email</h1>
      <p className="text-muted-foreground mb-8">
        We've sent you a verification link. Please check your email and click the link to verify your account.
      </p>
      <div className="space-y-4">
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/sign-in">
            Back to Sign In
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Didn't receive an email? Check your spam folder or{' '}
          <Link href="/auth/sign-up" className="text-primary hover:underline">
            try signing up again
          </Link>
        </p>
      </div>
    </div>
  )
} 