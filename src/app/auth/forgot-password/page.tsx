'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Terminal } from 'lucide-react'

export default function ForgotPasswordPage() {
  const { sendPasswordResetEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    const { error: requestError } = await sendPasswordResetEmail(email)

    if (requestError) {
      setError(requestError)
      toast.error('Failed to send reset email.')
    } else {
      setMessage('If an account exists for this email, a password reset link has been sent.')
      toast.success('Password reset email sent.')
      setEmail('') // Clear email field on success
    }
    setIsSubmitting(false)
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-center mb-6">Forgot Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            aria-label="Email address"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {message && (
          <Alert variant="default">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader className="animate-spin mr-2" size={16} /> : null}
          Send Reset Link
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </>
  )
} 