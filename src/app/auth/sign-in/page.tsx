'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader } from 'lucide-react'
import { toast } from 'sonner'
import { FcGoogle } from 'react-icons/fc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Terminal } from 'lucide-react'
import { ROUTES } from '@/lib/routes'

export default function SignInPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const next = searchParams.get('next')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError(signInError)
      toast.error('Sign in failed')
    } else {
      toast.success('Signed in successfully')
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
    }
    setIsGoogleSubmitting(false)
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground mt-2">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href={ROUTES.FORGOT_PASSWORD}
              className="text-sm font-medium text-primary hover:underline"
              tabIndex={isSubmitting || isGoogleSubmitting ? -1 : 0}
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            required
            placeholder="••••••••"
            aria-label="Password"
            disabled={isSubmitting || isGoogleSubmitting}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting ? <Loader className="animate-spin mr-2" size={16} /> : null}
          Sign In
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting || isGoogleSubmitting}
        aria-label="Sign in with Google"
      >
        {isGoogleSubmitting ? (
          <Loader className="animate-spin mr-2" size={16} />
        ) : (
          <FcGoogle className="mr-2 h-5 w-5" />
        )}
        Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href={`${ROUTES.SIGN_UP}${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-primary hover:underline"
          tabIndex={0}
        >
          Sign up
        </Link>
      </p>
    </div>
  )
} 