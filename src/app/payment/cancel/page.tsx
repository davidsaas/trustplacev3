// src/app/payment/cancel/page.tsx
import React from 'react';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { AppNavbar } from '@/app/components/navbar'; // Assuming navbar path
import { Button } from '@/components/ui/button'; // Assuming button path
import { ROUTES } from '@/lib/routes'; // Assuming routes path

export default function PaymentCancelPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppNavbar />
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="text-center p-8 bg-white border border-red-200 rounded-lg shadow-md max-w-md w-full">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">Payment Canceled</h1>
          <p className="text-gray-600 mb-6">
            Your payment process was canceled. You have not been charged.
          </p>
          <div className="flex justify-center gap-4">
             <Link href={ROUTES.HOME}> {/* Link back home or to subscription page */}
                <Button outline>Go Back Home</Button> {/* Use outline prop */}
             </Link>
             {/* Optionally add a button to retry payment */}
             {/* <Link href="/subscribe">
                <Button>Retry Subscription</Button>
             </Link> */}
          </div>
        </div>
      </div>
    </div>
  );
}