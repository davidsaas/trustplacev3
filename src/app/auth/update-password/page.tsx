'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Terminal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function UpdatePasswordPage() {
  const { updatePassword, user } = useAuth()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false) // State to track if recovery session is active

  // Listen for the PASSWORD_RECOVERY event or check if user is already available
  useEffect(() => {
    // If user is already loaded (might happen on refresh after clicking link), we are ready
    if (user) {
      setIsReady(true)
      return
    }

    // Otherwise, listen for the specific auth event
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsReady(true)
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Also handle cases where the user might just be signed in normally
          // but landed here. Check if the session seems fresh from recovery.
          // This part is less critical if AuthProvider handles the state correctly.
          setIsReady(true)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [user]) // Depend on user state from useAuth

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    const { error: updateError } = await updatePassword(password)

    if (updateError) {
      setError(updateError)
      toast.error('Failed to update password.')
    } else {
      toast.success('Password updated successfully. Please sign in again.')
      // Optionally sign the user out here if Supabase doesn't automatically
      // await supabase.auth.signOut();
      router.push('/auth/sign-in') // Redirect to sign-in page
    }
    setIsSubmitting(false)
  }

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px]">
        <Loader className="animate-spin text-primary mb-4" size={32} />
        <p className="text-gray-600">Verifying recovery link...</p>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-center mb-6">Update Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            aria-label="New Password"
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            aria-label="Confirm New Password"
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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader className="animate-spin mr-2" size={16} /> : null}
          Update Password
        </Button>
      </form>
    </>
  )
} 