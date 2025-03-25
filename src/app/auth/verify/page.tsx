'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function VerifyEmail() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-6">Check your email</h1>
        <p className="text-muted-foreground mb-8">
          We&apos;ve sent you a verification link. Please check your email and click the link to verify your account.
        </p>
        <div className="space-y-4">
          <Link href="/auth/sign-in">
            <Button outline className="w-full">
              Back to Sign In
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive an email? Check your spam folder or{' '}
            <Link href="/auth/sign-up" className="text-primary hover:underline">
              try signing up again
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
} 