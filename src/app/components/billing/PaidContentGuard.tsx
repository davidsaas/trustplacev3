'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle, AlertBody, AlertActions } from "@/components/ui/alert"; // Import necessary parts
import { ROUTES } from '@/lib/routes';

interface PaidContentGuardProps {
  children: React.ReactNode;
  signInMessage?: string;
  subscribeMessage?: string;
  loadingComponent?: React.ReactNode;
  showManageButton?: boolean;
}

const PaidContentGuard: React.FC<PaidContentGuardProps> = ({
  children,
  signInMessage = "Please sign in to access this content.",
  subscribeMessage = "You need an active subscription to view this content.",
  loadingComponent = <Skeleton className="h-20 w-full" />,
  showManageButton = true,
}) => {
  const { user, profile, loadingAuth, loadingProfile } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // isLoading depends only on the provider's state now
  const isLoading = loadingAuth || loadingProfile;
  // Ensure profile exists before checking status
  const isActiveSubscriber = profile ? (profile.subscription_status === 'active' || profile.subscription_status === 'trialing') : false;

  const handleRedirect = async (apiUrl: string) => {
    setIsRedirecting(true);
    try {
      const response = await fetch(apiUrl, { method: 'POST' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to initiate session: ${response.status} ${errorText}`);
      }
      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
          throw new Error('No URL received from server.');
      }
    } catch (error) {
      console.error('Error redirecting to Stripe:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Could not connect to billing.'}`);
      setIsRedirecting(false);
    }
  };

  const handleSubscribe = () => {
    handleRedirect('/api/stripe/create-checkout-session');
  };

  const handleManageSubscription = () => {
    handleRedirect('/api/stripe/create-portal-session');
  };

  const handleSignIn = () => {
    router.push(ROUTES.SIGN_IN); // Corrected route usage
  };

  // --- Render Logic ---

  if (isLoading) {
    return <>{loadingComponent}</>;
  }

  if (!user) {
    // Use Alert components correctly
    return (
      <Alert open={true} onClose={() => {}} className="my-4 border border-red-500 bg-red-50 p-4 rounded-md sm:max-w-lg">
         <AlertTitle>Authentication Required</AlertTitle>
         <AlertDescription>
           {signInMessage}
         </AlertDescription>
         <AlertBody> {/* Optional: Add more body content if needed */}
         </AlertBody>
         <AlertActions>
            <Button onClick={handleSignIn}>Sign In</Button>
            {/* Add a close button if the Alert component requires it */}
            {/* <Button plain onClick={() => {}}>Cancel</Button> */}
         </AlertActions>
       </Alert>
    );
  }

  if (!isActiveSubscriber) {
     // Use Alert components correctly
    return (
       <Alert open={true} onClose={() => {}} className="my-4 border border-blue-500 bg-blue-50 p-4 rounded-md sm:max-w-lg">
         <AlertTitle>Subscription Required</AlertTitle>
         <AlertDescription>
           {subscribeMessage}
         </AlertDescription>
         <AlertBody>
         </AlertBody>
         <AlertActions>
           <Button onClick={handleSubscribe} disabled={isRedirecting}>
             {isRedirecting ? 'Redirecting...' : 'Subscribe Now'}
           </Button>
            {/* <Button plain onClick={() => {}}>Cancel</Button> */}
         </AlertActions>
       </Alert>
    );
  }

  // User is logged in and has an active subscription
  return (
    <div>
      {children}
      {showManageButton && (
         <div className="mt-4 text-right">
           {/* Button variant error will be fixed after reading button.tsx */}
           {/* Use the 'outline' boolean prop instead of 'variant' */}
           {/* Remove the 'size' prop as it's not supported by this Button component */}
           <Button outline onClick={handleManageSubscription} disabled={isRedirecting}>
             {isRedirecting ? 'Redirecting...' : 'Manage Subscription'}
           </Button>
         </div>
       )}
    </div>
  );
};

export default PaidContentGuard;