'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Terminal } from 'lucide-react'
import { ROUTES } from '@/lib/routes'

export default function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsSubmitting(true)
    const { error: signUpError, success } = await signUp(email, password, next)

    if (signUpError) {
      setError(signUpError)
      toast.error('Sign up failed')
    } else if (success) {
      // Redirect is handled within signUp now
    }
    setIsSubmitting(false)
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsGoogleSubmitting(true)
    const { error: googleError } = await signInWithGoogle(next)
    if (googleError) {
      setError(googleError)
      toast.error('Google sign in failed')
      setIsGoogleSubmitting(false); // Set false only if error occurs
    }
    // No need to set loading false on success, page redirects
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-center mb-6">Create Account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            required
            placeholder="you@example.com"
            aria-label="Email address"
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            required
            minLength={6}
            placeholder="•••••••• (min. 6 characters)"
            aria-label="Password"
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </div>
        {error && (
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting ? <Loader className="animate-spin mr-2" size={16} /> : null}
          Sign Up
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting || isGoogleSubmitting}
        aria-label="Sign up with Google"
      >
        {isGoogleSubmitting ? (
          <Loader className="animate-spin mr-2" size={16} />
        ) : (
          <FcGoogle className="mr-2 h-4 w-4" />
        )}
        Google
      </Button>

      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link
          href={`${ROUTES.SIGN_IN}${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-primary hover:underline"
        >
          Sign In
        </Link>
      </p>
    </>
  )
} 