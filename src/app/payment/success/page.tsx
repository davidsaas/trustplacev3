// src/app/payment/success/page.tsx
import React from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { AppNavbar } from '@/app/components/navbar'; // Assuming navbar path
import { Button } from '@/components/ui/button'; // Assuming button path
import { ROUTES } from '@/lib/routes'; // Assuming routes path

// Optional: You could use searchParams to get the session_id and verify the payment server-side
// import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
// import { cookies } from 'next/headers';
// import Stripe from 'stripe';
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function PaymentSuccessPage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined } }) {
  const sessionId = searchParams?.session_id;

  // --- Optional Server-Side Verification ---
  // let paymentVerified = false;
  // if (sessionId && typeof sessionId === 'string') {
  //   try {
  //     const session = await stripe.checkout.sessions.retrieve(sessionId);
  //     // Check session status, customer details, etc.
  //     if (session.payment_status === 'paid' || session.status === 'complete') {
  //       // You might also want to double-check against your DB profile status here
  //       paymentVerified = true;
  //       console.log(`Payment success verified for session: ${sessionId}`);
  //     } else {
  //        console.warn(`Payment session ${sessionId} status not confirmed: ${session.status}, ${session.payment_status}`);
  //     }
  //   } catch (error) {
  //     console.error(`Error verifying payment session ${sessionId}:`, error);
  //   }
  // }
  // --- End Optional Verification ---

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppNavbar />
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="text-center p-8 bg-white border border-green-200 rounded-lg shadow-md max-w-md w-full">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 mb-6">
            Thank you for subscribing! Your access has been updated.
            {/* {paymentVerified ? 'Your payment has been confirmed.' : 'Your payment is processing.'} */}
          </p>
          <Link href={ROUTES.HOME}> {/* Link to dashboard or relevant page */}
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}