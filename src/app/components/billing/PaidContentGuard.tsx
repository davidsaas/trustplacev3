'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/shared/providers/auth-provider'; // Use the updated hook
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LockIcon, LogInIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

interface PaidContentGuardProps {
  children: React.ReactNode;
  featureName?: string; // Optional: Name of the feature being guarded
}

export const PaidContentGuard: React.FC<PaidContentGuardProps> = ({
  children,
  featureName = 'this feature',
}) => {
  const { user, isSubscribed, loadingAuth, loadingProfile } = useAuth();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isLoading = loadingAuth || loadingProfile;

  const handleSubscribeClick = async () => {
    setIsSubscribing(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create checkout session.');
      }

      const { url: checkoutUrl } = await response.json();
      if (!checkoutUrl) {
        throw new Error('Checkout URL not found in response.');
      }

      // Redirect to Stripe Checkout
      window.location.href = checkoutUrl;
      // Note: No need to setIsSubscribing(false) here as the page navigates away
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setIsSubscribing(false);
    }
  };

  const handleSignInClick = () => {
    // Redirect to sign-in, passing the current path to return to
    const currentPath = window.location.pathname + window.location.search;
    router.push(`${ROUTES.SIGN_IN}?next=${encodeURIComponent(currentPath)}`);
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="relative w-full min-h-[200px]">
        <Skeleton className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center">
          <p className="text-gray-600 font-medium">Loading access...</p>
        </div>
      </div>
    );
  }

  // --- Authenticated & Subscribed: Show Content ---
  if (user && isSubscribed) {
    return <>{children}</>;
  }

  // --- Blurred Content + Overlay ---
  const Overlay = ({ children: overlayChildren }: { children: React.ReactNode }) => (
    <div className="relative w-full">
      {/* Blurred Background Content */}
      <div className="blur-md select-none pointer-events-none" aria-hidden="true">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-white/50 flex items-center justify-center p-6 rounded-lg">
        <div className="text-center bg-white p-6 rounded-lg shadow-lg border border-gray-200 max-w-sm">
          {overlayChildren}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );

  // --- Authenticated but NOT Subscribed: Show Subscribe Prompt ---
  if (user && !isSubscribed) {
    return (
      <Overlay>
        <LockIcon className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Unlock Premium Feature</h3>
        <p className="text-sm text-gray-600 mb-4">
          Subscribe to access {featureName} and other exclusive content.
        </p>
        <Button
          onClick={handleSubscribeClick}
          disabled={isSubscribing}
          className="w-full"
        >
          {isSubscribing ? 'Processing...' : 'Unlock for $4.99 USD/month'}
        </Button>
      </Overlay>
    );
  }

  // --- NOT Authenticated: Show Sign In Prompt ---
  if (!user) {
    return (
      <Overlay>
        <LogInIcon className="h-8 w-8 text-blue-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Sign In Required</h3>
        <p className="text-sm text-gray-600 mb-4">
          Please sign in or create an account to subscribe and access {featureName}.
        </p>
        <Button onClick={handleSignInClick} className="w-full">
          Sign In / Sign Up
        </Button>
      </Overlay>
    );
  }

  // Fallback (shouldn't be reached)
  return null;
};