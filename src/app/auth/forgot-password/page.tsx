'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader, Terminal, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle, AlertBody, AlertActions } from '@/components/ui/alert'
import { ROUTES } from '@/lib/routes' // Assuming ROUTES.SIGN_IN exists

export default function ForgotPasswordPage() {
  const { sendPasswordResetEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorContent, setErrorContent] = useState<string | null>(null)
  const [messageContent, setMessageContent] = useState<string | null>(null)
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [showMessageAlert, setShowMessageAlert] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorContent(null)
    setMessageContent(null)
    setShowErrorAlert(false)
    setShowMessageAlert(false)
    setIsSubmitting(true)

    const { error: requestError } = await sendPasswordResetEmail(email)

    if (requestError) {
      setErrorContent(requestError)
      setShowErrorAlert(true)
      toast.error('Failed to send reset email.')
    } else {
      setMessageContent('If an account exists for this email, a password reset link has been sent.')
      setShowMessageAlert(true)
      toast.success('Password reset email sent.')
      setEmail('')
    }
    setIsSubmitting(false)
  }

  const handleCloseErrorAlert = () => setShowErrorAlert(false)
  const handleCloseMessageAlert = () => setShowMessageAlert(false)

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

        {showErrorAlert && errorContent && (
          <Alert
            open={showErrorAlert}
            onClose={handleCloseErrorAlert}
            size="sm"
          >
            <AlertBody>
              <div className="flex items-start gap-3">
                <Terminal className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="text-red-800">Error</AlertTitle>
                  <AlertDescription className="text-red-700">{errorContent}</AlertDescription>
                </div>
              </div>
            </AlertBody>
            <AlertActions>
              <Button plain onClick={handleCloseErrorAlert}>OK</Button>
            </AlertActions>
          </Alert>
        )}

        {showMessageAlert && messageContent && (
          <Alert
            open={showMessageAlert}
            onClose={handleCloseMessageAlert}
            size="sm"
          >
            <AlertBody>
              <div className="flex items-start gap-3">
                <Terminal className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="text-blue-800">Success</AlertTitle>
                  <AlertDescription className="text-blue-700">{messageContent}</AlertDescription>
                </div>
              </div>
            </AlertBody>
            <AlertActions>
              <Button plain onClick={handleCloseMessageAlert}>OK</Button>
            </AlertActions>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader className="animate-spin mr-2" size={16} /> : null}
          Send Reset Link
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link href={ROUTES.SIGN_IN} className="font-medium text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </>
  )
} 