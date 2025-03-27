'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MailCheck } from 'lucide-react'

export default function VerifyPage() {
  return (
    <div className="text-center">
      <MailCheck className="mx-auto h-12 w-12 text-green-500 mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Check Your Email</h2>
      <p className="text-muted-foreground mb-6">
        We've sent a verification link to your email address. Please click the link to activate your account.
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Didn't receive the email? Check your spam folder or try signing up again.
      </p>
      <Link href="/auth/sign-in">
        <Button variant="outline">Back to Sign In</Button>
      </Link>
    </div>
  )
} 