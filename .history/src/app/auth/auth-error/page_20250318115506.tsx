import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AuthError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <h1 className="mb-4 text-4xl font-bold">Authentication Error</h1>
        <p className="mb-8 text-lg text-gray-600">
          There was an error during the authentication process. This could be due to an expired link
          or an invalid authentication request.
        </p>
        <div className="flex justify-center gap-4">
          <Button asChild>
            <Link href="/auth/sign-in">Try Again</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
} 