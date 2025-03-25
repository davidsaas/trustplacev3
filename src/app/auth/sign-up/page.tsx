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

export default function SignUpPage() {
  const { signUp, signInWithGoogle, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    const { error: signUpError, success } = await signUp(email, password)
    if (signUpError) {
      setError(signUpError)
      toast.error('Sign up failed')
    } else if (success) {
      toast.success('Check your email to verify your account')
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    const { error: googleError } = await signInWithGoogle()
    if (googleError) {
      setError(googleError)
      toast.error('Google sign in failed')
    }
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Create an account</h1>
        <p className="text-muted-foreground mt-2">
          Sign up to get started with Trustplace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            minLength={6}
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Sign Up
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
        outline
        type="button"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={loading}
      >
        {loading ? (
          <Loader className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FcGoogle className="mr-2 h-5 w-5" />
        )}
        Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={`/auth/sign-in${next ? `?next=${next}` : ''}`}
          className="text-primary hover:underline"
          tabIndex={0}
        >
          Sign in
        </Link>
      </p>
    </div>
  )
} 